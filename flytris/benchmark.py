import ast
import json
import platform
import subprocess
import time
from pathlib import Path
import numpy as np
import psutil
from .data import ROOT, load_graph, sha256
from .train import write_json

def hardware():
    try:
        gpu = subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total,memory.free,driver_version','--format=csv,noheader'],
            text=True,timeout=10).strip()
    except (OSError,subprocess.SubprocessError):
        gpu = 'unavailable'
    return {'platform':platform.platform(),'cpu':platform.processor(),'logical_cpus':psutil.cpu_count(),
        'ram_gib':round(psutil.virtual_memory().total/2**30,2),'gpu':gpu,'python':platform.python_version()}

def bench_reservoir(out, sizes=(256,1024,4096,138639), steps=16, repeats=3, device='cpu'):
    from .reservoir import make_reservoir
    rng = np.random.default_rng(53)
    x = rng.uniform(0,0.5,(34,8)).astype(np.float32)
    records = []
    for n in sizes:
        start = time.perf_counter()
        r = make_reservoir(n,steps,device=device)
        setup = time.perf_counter()-start
        r.transform(x)
        if device=='cuda':
            r.torch.cuda.reset_peak_memory_stats()
        times = []
        for _ in range(repeats):
            start = time.perf_counter()
            z = r.transform(x)
            times.append(time.perf_counter()-start)
        if not np.isfinite(z).all():
            raise RuntimeError('Nonfinite reservoir output')
        row = {'model':r.metadata(),'candidate_batch':len(x),'setup_seconds':setup,
            'seconds_per_34_candidate_decision':times,'median_seconds':float(np.median(times)),
            'process_rss_gib':psutil.Process().memory_info().rss/2**30,
            'last_batch_spikes':int(r.last_total.item()) if device=='cuda' else r.last_spikes,
            'torch_peak_allocated_gib':r.torch.cuda.max_memory_allocated()/2**30 if device=='cuda' else None}
        records.append(row)
        print(f'{n} neurons: {row["median_seconds"]:.4f}s per 34-candidate decision, {row["process_rss_gib"]:.2f} GiB RSS',flush=True)
        del r
    result = {'hardware':hardware(),'kind':'task_adapter_throughput','device':device,'records':records,
        'note':'Timing only. No full-connectome learning evaluation. Process RSS is a snapshot, not peak.'}
    write_json(out,result)
    return result

def bench_upstream(out, duration_ms=100, repeats=3, batch=1, device='cuda'):
    import torch
    import torch.nn as nn
    torch.set_num_threads(4)
    if device=='cuda' and not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable. Install CUDA PyTorch or explicitly select --device cpu.')
    manifest = json.loads((ROOT/'data/source.json').read_text())
    source = ROOT/'vendor/run_pytorch.py'
    if sha256(source) != manifest['files']['vendor/run_pytorch.py']['sha256']:
        raise RuntimeError('Upstream source checksum differs from download manifest.')
    # Load exactly upstream model definitions, avoiding its unrelated benchmark imports.
    parsed = ast.parse(source.read_text(encoding='utf-8'))
    names = {'PoissonSpikeGenerator','AlphaSynapse','LIFNeuron','AlphaLIF','TorchModel'}
    nodes = [node for node in parsed.body if (isinstance(node,ast.ClassDef) and node.name in names)
        or (isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'MODEL_PARAMS','DT'} for t in node.targets))]
    namespace = {'np':np,'torch':torch,'nn':nn}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),namespace)
    graph = load_graph()
    n = graph.shape[0]
    weights = torch.sparse_csr_tensor(torch.from_numpy(graph.indptr.astype(np.int64)),
        torch.from_numpy(graph.indices.astype(np.int64)),torch.from_numpy(graph.data),size=graph.shape,device=device)
    # Synthetic stimulation for a reproducible throughput test, not a behavioral validation.
    stimulated = torch.arange(0,n,max(1,n//256),device=device)
    model = namespace['TorchModel'](batch,n,namespace['DT'],namespace['MODEL_PARAMS'],weights,
        exc_indices=stimulated,device=device)
    rates = torch.zeros(batch,n,device=device)
    rates[:,stimulated] = 100.0
    count = int(round(duration_ms/namespace['DT']))
    times, counts = [], []
    if device=='cuda':
        torch.cuda.reset_peak_memory_stats()
    with torch.no_grad():
        for trial in range(repeats+1):
            torch.manual_seed(70+trial)
            state = model.state_init()
            spikes_total = torch.zeros((),device=device)
            if device=='cuda': torch.cuda.synchronize()
            start = time.perf_counter()
            for _ in range(20 if trial==0 else count):
                state = model(rates,*state)
                spikes_total += state[2].sum()
            if device=='cuda': torch.cuda.synchronize()
            elapsed = time.perf_counter()-start
            if trial:
                times.append(elapsed)
                counts.append(int(spikes_total.item()))
                print(f'Upstream {device}: trial {trial}, {duration_ms}ms biological time in {elapsed:.3f}s, spikes={counts[-1]}',flush=True)
    result = {'kind':'canonical_upstream_LIF_throughput','hardware':hardware(),'torch':torch.__version__,
        'device':device,'upstream_commit':manifest['commit'],'source_sha256':sha256(source),
        'neurons':n,'nonzero_directed_edges':graph.nnz,'dt_ms':namespace['DT'],
        'duration_ms':duration_ms,'batch':batch,'wall_seconds':times,'spike_counts':counts,
        'median_wall_seconds':float(np.median(times)),
        'wall_seconds_per_biological_second':float(np.median(times)/(duration_ms/1000)),
        'torch_peak_allocated_gib':torch.cuda.max_memory_allocated()/2**30 if device=='cuda' else None,
        'torch_peak_reserved_gib':torch.cuda.max_memory_reserved()/2**30 if device=='cuda' else None,
        'process_rss_gib':psutil.Process().memory_info().rss/2**30,
        'note':'Forward simulation with synthetic stimulation. No learning or Tetris. Excludes loading; 20-step warmup.'}
    write_json(out,result)
    return result
