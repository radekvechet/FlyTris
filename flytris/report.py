import html
import json
import zipfile
from pathlib import Path
import numpy as np
from .data import ROOT

def generate(out):
    out = Path(out)
    d = json.loads((out/'results.json').read_text())
    replay = json.loads((out/'replay.json').read_text())
    rows = []
    for r in d['replicates']:
        s = r['summary']
        lo,hi = s['paired_bootstrap_95_ci']
        rows.append([str(r['training_seed']),f'{s["before_mean_lines"]:.2f}',f'{s["after_mean_lines"]:.2f}',
            f'{s["mean_line_improvement"]:+.2f} [{lo:.2f}, {hi:.2f}]',f'{r["train_seconds"]/60:.1f} min'])
    table = '| Training seed | Before: lines/game | After: lines/game | Paired gain [95% bootstrap CI] | Training |\n|---|---:|---:|---:|---:|\n'
    table += '\n'.join('| '+' | '.join(row)+' |' for row in rows)
    raw = float(np.mean([r['lines'] for r in d['raw_control']]))
    random = float(np.mean([r['lines'] for r in d['random_control']]))
    ablations = '| Training seed | Trained fly | Recurrence disconnected | All output silenced |\n|---|---:|---:|---:|\n'
    for r in d['replicates']:
        ablations += f'| {r["training_seed"]} | {r["summary"]["after_mean_lines"]:.2f} | {np.mean([g["lines"] for g in r["disconnected"]]):.2f} | {np.mean([g["lines"] for g in r["silenced"]]):.2f} |\n'
    mean_seconds = float(np.mean([r['train_seconds'] for r in d['replicates']]))
    generations = d['protocol']['generations']
    all_pass = all(r['summary']['learning_evidence'] for r in d['replicates'])
    text = f'''# FlyTris measured local experiment

{'All training replicates improved on held-out game seeds with a positive paired bootstrap interval.' if all_pass else 'Learning evidence is mixed or insufficient; inspect each replicate below.'}

This is a working reward-trained output layer on a small fly-connectome spiking circuit. It is not a demonstration that the complete biological fly brain learned Tetris.

{table}

- Held-out games per model: {d['protocol']['held_out_seeds'].__len__()}, capped at {d['protocol']['test_piece_cap']} pieces.
- Raw-feature control, trained with the same search budget: **{raw:.2f} lines/game**.
- Random legal placements: **{random:.2f} lines/game**.
- Model: **{d['model']['neurons']} real neurons, {d['model']['edges']} directed weighted edges**, {d['model']['steps']} normalized LIF steps per candidate.
- Only **8 output weights** are trained, using reward `lines + 0.02 * pieces`. No teacher or hand-written placement score.
- Internal wiring is fixed. Engineered board features enter as synthetic currents. Candidate states reset independently.
- Total experiment wall time (including controls/evaluations): {d['elapsed_seconds']/60:.1f} minutes.

## Timing estimates

Measured mean training time for {generations} generations: {mean_seconds/60:.1f} minutes per replicate.
At the same population, games and piece cap, 100 generations would take approximately **{mean_seconds/generations*100/60:.1f} minutes** if average game lengths and throughput stayed the same.
Longer-lived policies, larger caps, more evaluations and slower/faster hardware change that estimate. This is a budget estimate, not a prediction of convergence or mastery.

## Evaluation integrity

Training uses separate game seeds from validation and final tests. Validation selects checkpoints. Final test scores never select weights. All replicates share held-out piece sequences for paired comparisons. A positive interval measures improvement conditional on that trained model; it does not establish an advantage of fly topology. The raw-feature control is essential context.

The replay uses the first predeclared held-out game and first training replicate, not the best recorded game. Silencing all reservoir output removes the agent's input. Disconnecting recurrence is an additional intervention; neither intervention substitutes for training a matched shuffled-connectivity control.

{ablations}

Recurrence removal does not consistently reduce performance in these runs. The experiments therefore do **not** show that the fly wiring is necessary for this task. The learned readout can exploit information carried by directly stimulated neurons.

## Limitations

'''+ '\n'.join('- '+s for s in d['limitations'])+'\n'
    (out/'REPORT.md').write_text(text,encoding='utf-8')
    tbody = ''.join('<tr>'+''.join(f'<td>{html.escape(c)}</td>' for c in row)+'</tr>' for row in rows)
    page = PAGE.replace('__TABLE__',tbody).replace('__RAW__',f'{raw:.2f}').replace('__RANDOM__',f'{random:.2f}')
    page = page.replace('__DATA__',json.dumps(replay).replace('</','<\\/'))
    from .tetris import NAMES, ROTATIONS
    web = ROOT/'flytris/web'
    from .versus import export_model
    checkpoint = out/f'fly_seed{d["replicates"][0]["training_seed"]}'/'checkpoint.json'
    versus_model = export_model(checkpoint) if checkpoint.exists() else None
    if versus_model is not None:
        (out/'versus-model.json').write_text(json.dumps(versus_model),encoding='utf-8')
    page = page.replace('__VERSUS_MODEL__',json.dumps(versus_model))
    page = page.replace('__VERSUS_HTML__',(web/'versus.html').read_text(encoding='utf-8'))
    page = page.replace('__THREE_LICENSE__',(web/'third_party/THREE-LICENSE.txt').read_text(encoding='utf-8'))
    page = page.replace('__SHAPES__',json.dumps({name:[s.tolist() for s in variants] for name,variants in zip(NAMES,ROTATIONS)}))
    for marker,name in [('__FALLING_POLICY__','falling-policy.cjs'),('__FALLING_LIVE__','falling-live.js'),('__STYLE__','style.css'),('__TIMELINE__','replay.js'),('__SCENE__','scene.js'),('__BOOT__','boot.js'),('__THREE_LIB__','third_party/three.cjs'),('__VERSUS_STYLE__','versus.css'),('__VERSUS_CORE__','versus-core.js'),('__VERSUS_UI__','versus.js'),('__SCORES_UI__','scores.js'),('__SCORES_HTML__','scores.html'),('__SCORES_STYLE__','scores.css')]:
        page = page.replace(marker,(web/name).read_text(encoding='utf-8').replace('</script','<\\/script'))
    page = page.replace('__NEURONS__',str(d['model']['neurons'])).replace('__EDGES__',str(d['model']['edges']))
    page = page.replace('__FALLING_SUMMARY__','')
    page = page.replace('__STATUS__','Learning observed in every replicate' if all_pass else 'Learning evidence needs review')
    if not ((ROOT/'runs/benchmark.json').exists() and (ROOT/'runs/benchmark_gpu.json').exists()):
        page = page.replace(' · <a href="MEASUREMENTS.md">Hardware and scaling</a>','')
    (out/'report.html').write_text(page,encoding='utf-8')
    if (ROOT/'runs/benchmark.json').exists() and (ROOT/'runs/benchmark_gpu.json').exists():
        measurements(out)
    print(f'Report: {(out/"report.html").resolve()}',flush=True)

def measurements(out):
    out = Path(out)
    cpu = json.loads((ROOT/'runs/benchmark.json').read_text())
    gpu = json.loads((ROOT/'runs/benchmark_gpu.json').read_text())
    trials = json.loads((out/'results.json').read_text())
    lines = ['# Measured hardware and scaling','',
        f'CPU: {cpu["hardware"]["cpu"]}; RAM: {cpu["hardware"]["ram_gib"]} GiB. GPU: {gpu["hardware"]["gpu"]}. OS: {cpu["hardware"]["platform"]}. Python: {cpu["hardware"]["python"]}.',
        '','## Learning evidence','',
        f'The complete experiment took {trials["elapsed_seconds"]/60:.2f} minutes. The {trials["protocol"]["generations"]}-generation training runs took '+
        ', '.join(f'{r["train_seconds"]:.1f} seconds' for r in trials['replicates'])+'.',
        '',f'{sum(r["summary"]["learning_evidence"] for r in trials["replicates"])} of {len(trials["replicates"])} runs had positive paired improvement intervals on {len(trials["protocol"]["held_out_seeds"])} held-out games. Internal synapses were fixed; eight output weights learned.',
        '','The recurrence-disconnection control did not consistently impair performance. These results demonstrate a working learning pipeline, not a necessary contribution of fly topology.',
        '','## Normalized reservoir throughput','',
        'Median of three timed repeats after warmup. Each measurement scores 34 synthetic candidate afterstates using 16 normalized LIF steps. Candidate-to-host transfer is included for CUDA.',
        '','| Neurons | Directed edges | CPU seconds / decision | GPU seconds / decision | GPU time / 100,000 such decisions |',
        '|---:|---:|---:|---:|---:|']
    for a,b in zip(cpu['records'],gpu['records']):
        lines.append(f'| {a["model"]["neurons"]:,} | {a["model"]["edges"]:,} | {a["median_seconds"]:.4f} | {b["median_seconds"]:.4f} | {b["median_seconds"]*100000/3600:.2f} hours |')
    lines += ['', 'The 100,000-decision column is an arithmetic compute-budget scenario, not a training-convergence estimate. Actual tetrominoes have different candidate counts; environment work, validation, and setup add time. Hardware was also driving the desktop. Larger models were benchmarked, not trained or evaluated for playing quality.',
        '', 'GPU memory allocated by torch for the full normalized reservoir peaked at '+f'{gpu["records"][-1]["torch_peak_allocated_gib"]:.3f} GiB. This excludes CUDA context, the desktop and other applications. Memory fit is not the main bottleneck in this forward-only experiment.',
        '', '## Canonical full-brain model','']
    for name in ['upstream_gpu.json','upstream_gpu_batch34.json']:
        path = ROOT/'runs'/name
        if path.exists():
            d = json.loads(path.read_text())
            lines += [f'- Batch {d["batch"]}: {d["duration_ms"]:g} ms of biological time took **{d["median_wall_seconds"]:.3f} seconds** (median of {len(d["wall_seconds"])} repeats); torch peak allocated VRAM {d["torch_peak_allocated_gib"]:.3f} GiB.']
    lines += ['', 'These execute the pinned original model classes and constants: 138,639 neurons, 15,091,983 nonzero directed edges, 0.1 ms integration step. Stimulation is synthetic. They demonstrate forward simulation only, not Tetris learning. The normalized reservoir and canonical model have different dynamics; their times cannot be substituted for one another.',
        '', '## Practical next run','',
        'Stay with the reduced model to refine the experiment. At the original caps/budget, 100 generations extrapolate to '+
        f'{min(r["train_seconds"] for r in trials["replicates"])/trials["protocol"]["generations"]*100/60:.1f}–{max(r["train_seconds"] for r in trials["replicates"])/trials["protocol"]["generations"]*100/60:.1f} minutes per {trials["model"]["neurons"]}-neuron training run if throughput and game lengths remain comparable. Longer episodes and changed caps can increase that.',
        '', 'A 1,024- or 4,096-neuron circuit with CUDA is a more practical next scale than the entire graph. Verify learning again at each scale. Full-network timings indicate that batching/kernel work is worth investigating before simply purchasing or borrowing faster hardware.',
        '', 'For friends, install the portable bundle, benchmark their actual machine, and resume a copied checkpoint or run a separate optimizer seed. The implementation is single-machine; it does not combine several friends’ GPUs into one distributed learner.',
        '', '## Verification','',
        'Unit/integration checks cover Tetris physics, subgraph provenance, recurrence/input effects, checkpoint resume, and CPU/CUDA parity. The saved replay was also checked in a browser: playback, seeking and score updates work.',
        '', 'Raw measurements: `benchmark.json`, `benchmark_gpu.json`, `upstream_gpu.json`, `upstream_gpu_batch34.json`, plus the experiment’s `results.json` and per-replicate evaluations.']
    content = '\n'.join(lines)+'\n'
    (ROOT/'runs/MEASUREMENTS.md').write_text(content,encoding='utf-8')
    (out/'MEASUREMENTS.md').write_text(content,encoding='utf-8')

def pack(out, include_data=False, run='runs/local'):
    path = Path(out).resolve()
    path.parent.mkdir(parents=True,exist_ok=True)
    files = []
    for folder in ['flytris','tests']:
        files.extend((ROOT/folder).glob('*.py'))
    files.extend(p for p in (ROOT/'flytris/web').rglob('*') if p.is_file())
    files.extend((ROOT/'tests').glob('*.cjs'))
    for folder in ['app','server','db','scripts','site-data']:
        files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file())
    for name in ['package.json','package-lock.json','vercel.json','next.config.mjs','proxy.js','DEPLOYMENT.md','SECURITY.md','.env.example']:
        if (ROOT/name).exists(): files.append(ROOT/name)
    for name in ['README.md','EXPERIMENTS.md','OVERNIGHT.md','FALLING_TRAINING.md','RUN_OVERNIGHT.cmd','STOP_TRAINING.cmd','requirements.txt','requirements-gpu.txt','setup.ps1','setup.sh','NOTICE.md','LICENSE','.gitignore']:
        if (ROOT/name).exists(): files.append(ROOT/name)
    files += [p for p in (ROOT/'vendor').glob('*') if p.is_file()]
    if (ROOT/'data/source.json').exists(): files.append(ROOT/'data/source.json')
    if include_data:
        files += [p for p in (ROOT/'data').glob('*') if p.suffix in {'.csv','.parquet','.npz','.npy'}]
    runpath = (ROOT/run).resolve()
    if not runpath.is_relative_to(ROOT):
        raise ValueError('Pack --run must be inside the project.')
    if runpath.exists():
        files += [p for p in runpath.rglob('*') if p.is_file() and p.suffix in {'.json','.jsonl','.md','.html','.txt','.js','.cjs'}]
    for name in ['benchmark.json','benchmark_gpu.json','upstream_gpu.json','upstream_gpu_batch34.json','MEASUREMENTS.md']:
        if (ROOT/'runs'/name).exists(): files.append(ROOT/'runs'/name)
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for f in sorted(set(files)):
            z.write(f,Path('flytris')/f.relative_to(ROOT))
    print(f'{path}: {path.stat().st_size/1e6:.2f} MB',flush=True)

PAGE = (ROOT / 'flytris/web/report.html').read_text(encoding='utf-8')
