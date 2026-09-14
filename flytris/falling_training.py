"""Launch isolated falling-rules training, using a snapshot of browser physics."""
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
from .data import ROOT
from .overnight import awake, choose_warm_start
from .train import write_json
from .versus import export_model


def prepare(out):
    out = Path(out).resolve()
    if (out/'input/manifest.json').exists():
        return
    if (out/'session.json').exists():
        raise ValueError('Existing training session has no input manifest.')
    out.joinpath('input').mkdir(parents=True,exist_ok=True)
    _, source = choose_warm_start()
    model = export_model(ROOT/source)
    write_json(out/'input/model.json',model)
    from .tetris import NAMES, ROTATIONS
    write_json(out/'input/shapes.json',{name:[s.tolist() for s in variants] for name,variants in zip(NAMES,ROTATIONS)})
    hashes = {}
    for name in ['versus-core.js','falling-policy.cjs']:
        raw = (ROOT/'flytris/web'/name).read_bytes()
        (out/'input'/name).write_bytes(raw)
        hashes[name] = hashlib.sha256(raw).hexdigest()
    for name in ['model.json','shapes.json']:
        hashes[name] = hashlib.sha256((out/'input'/name).read_bytes()).hexdigest()
    write_json(out/'input/manifest.json',dict(task='falling-v1',source_checkpoint=source,
        warm_start_selection='highest previous validation fitness; no held-out selection',
        hashes=hashes,controller_ms=50,gravity_ms=[800,500,250],lock_delay_ms=500,
        hard_drop='explicit allowed control, costs one controller tick',
        learned='eight reservoir readout weights; fixed circuit and reachability planner'))


def run(out='runs/falling_overnight',hours=6,resume=False,smoke=False,workers=4):
    if not math.isfinite(hours) or hours<=0 or not 1<=workers<=8:
        raise ValueError('Use positive finite hours and 1..8 workers.')
    from filelock import FileLock, Timeout
    out=Path(out).resolve();out.mkdir(parents=True,exist_ok=True)
    node=shutil.which('node')
    if not node:
        bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
        if bundled.exists(): node=str(bundled)
    if not node: raise RuntimeError('Install Node.js 24 to run falling-rules training.')
    args=[node,str(ROOT/'scripts/train-falling.cjs'),'--out',str(out),'--hours',str(hours),'--workers',str(workers)]
    if resume: args.append('--resume')
    if smoke: args.append('--smoke')
    try:
        with FileLock(str(out/'launcher.lock'),timeout=0):
            prepare(out)
            with awake():
                flags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name=='nt' else 0
                child=subprocess.Popen(args,cwd=ROOT,creationflags=flags)
                write_json(out/'process.json',dict(wrapper_pid=os.getpid(),trainer_pid=child.pid,out=str(out),hours=hours,workers=workers))
                try: code=child.wait()
                except KeyboardInterrupt:
                    (out/'STOP').write_text('Graceful stop requested\n')
                    code=child.wait()
                if code: raise RuntimeError(f'Falling trainer exited with code {code}; inspect training.log/session.json.')
    except Timeout as error:
        raise RuntimeError('This falling training directory already has an active process.') from error
