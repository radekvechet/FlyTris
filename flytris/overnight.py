"""Bounded overnight search, resumable between complete games.

Validation is used for checkpoint selection and plateau decisions. Fresh final
tests never feed back into training. All eight readout weights remain trainable;
increasing neuron count does not increase the readout's parameter count.
"""
import contextlib
import json
import math
import os
from pathlib import Path
import time
import numpy as np
from .data import ROOT
from .reservoir import make_reservoir, LinearPolicy
from .tetris import play
from .train import write_json, paired_summary

def settings(hours=6, smoke=False):
    if not math.isfinite(hours) or hours <= 0:
        raise ValueError('--hours must be finite and positive.')
    return dict(hours=hours, smoke=smoke, population=4 if smoke else 16,
        games=1 if smoke else 4, train_cap=30 if smoke else 1000,
        validation_games=2 if smoke else 8, validation_cap=50 if smoke else 2000,
        test_games=2 if smoke else 24, test_cap=60 if smoke else 5000,
        patience=2 if smoke else 8, max_restarts=0 if smoke else 2,
        min_relative_gain=0.01, min_absolute_gain=2.0,
        lanes=[{'name':'fly256_cpu','neurons':256,'device':'cpu'},
               {'name':'fly1024_cuda','neurons':1024,'device':'cuda'}])

def choose_warm_start():
    files = sorted((ROOT/'runs/local').glob('fly_seed*/checkpoint.json'))
    if not files:
        raise FileNotFoundError('The overnight profile needs a local experiment checkpoint in runs/local/fly_seed*/.')
    states = [(p,json.loads(p.read_text())) for p in files]
    path,state = max(states,key=lambda pair:pair[1]['best_validation_fitness'])
    return state['best_weights'],str(path.relative_to(ROOT))

def plateau(job,score,cfg):
    """Practical stopping heuristic, not a statistical convergence test."""
    anchor = job['meaningful_anchor']
    if score >= anchor+max(cfg['min_absolute_gain'],abs(anchor)*cfg['min_relative_gain']):
        job['meaningful_anchor'] = score
        job['stale'] = 0
    else:
        job['stale'] += 1
    if job['stale'] < cfg['patience']:
        return 'continue'
    if job['restarts'] < cfg['max_restarts']:
        job['restarts'] += 1
        job['stale'] = 0
        job['mean'] = list(job['best_weights'])
        job['std'] = [0.4]*8
        return 'restart'
    return 'plateau'

@contextlib.contextmanager
def awake():
    """Prevent automatic idle sleep only while this process is working."""
    if os.name != 'nt':
        yield
        return
    import ctypes
    old = ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
    if not old:
        print('Could not inhibit idle sleep; check your power settings.',flush=True)
    try:
        yield
    finally:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)

def cached_games(reservoir,weights,seeds,cap,deadline,results,save):
    policy = LinearPolicy(reservoir,weights)
    for seed in seeds[len(results):]:
        result = play(policy,seed,cap,deadline=deadline)
        results.append(result)
        save()
    return float(np.mean([r['fitness'] for r in results]))

def export_checkpoint(out,job):
    # Compatible with the existing replay command; overnight resume uses session.json.
    write_json(out/job['name']/'checkpoint.json',{
        'config':{'seed':job['seed'],'neurons':job['neurons'],'steps':16,'mode':'fly'},
        'generation':job['generation'],'best_weights':job['best_weights'],
        'initial_weights':job['initial_weights'],'best_validation_fitness':job['best_score'],
        'model':job.get('model'), 'resume_with':'python -m flytris overnight --resume --out '+str(out),
        'train_seconds':job['seconds']})

def train_lane(job,reservoir,cfg,deadline,save,out):
    validation_seeds = list(range(6000000,6000000+cfg['validation_games']))
    if job['baseline_validation'] is None:
        cached_games(reservoir,job['initial_weights'],validation_seeds,cfg['validation_cap'],
            deadline,job['baseline_games'],save)
        job['baseline_validation'] = float(np.mean([r['fitness'] for r in job['baseline_games']]))
        job['best_score'] = job['baseline_validation']
        job['meaningful_anchor'] = job['best_score']
        save()
    while time.monotonic() < deadline:
        if job['pending'] is None:
            rng = np.random.default_rng()
            rng.bit_generator.state = job['rng_state']
            candidates = rng.normal(job['mean'],job['std'],(cfg['population'],8))
            candidates[0],candidates[1] = job['mean'],job['best_weights']
            candidates /= np.maximum(np.linalg.norm(candidates,axis=1,keepdims=True),1e-8)
            job['rng_state'] = rng.bit_generator.state
            job['pending'] = {'candidates':candidates.tolist(),'scores':[[] for _ in candidates],
                'validation':[], 'proposed_mean':None,'proposed_std':None}
            save()
        p = job['pending']
        train_seeds = [10000000+job['seed']*1000000+job['generation']*cfg['games']+g for g in range(cfg['games'])]
        fitness = [cached_games(reservoir,w,train_seeds,cfg['train_cap'],deadline,p['scores'][i],save)
                   for i,w in enumerate(p['candidates'])]
        if p['proposed_mean'] is None:
            elite = np.array(p['candidates'])[np.argsort(fitness)[-max(2,cfg['population']//4):]]
            mean = 0.2*np.array(job['mean'])+0.8*elite.mean(0)
            mean /= max(np.linalg.norm(mean),1e-8)
            std = np.maximum(0.04,0.2*np.array(job['std'])+0.8*elite.std(0))
            p['proposed_mean'],p['proposed_std'] = mean.tolist(),std.tolist()
            save()
        score = cached_games(reservoir,p['proposed_mean'],validation_seeds,cfg['validation_cap'],deadline,p['validation'],save)
        job['mean'],job['std'] = p['proposed_mean'],p['proposed_std']
        if score > job['best_score']:
            job['best_score'],job['best_weights'] = score,list(job['mean'])
        job['generation'] += 1
        decision = plateau(job,score,cfg)
        row = {'generation':job['generation'],'validation_fitness':score,
            'validation_lines':float(np.mean([r['lines'] for r in p['validation']])),
            'validation_capped':sum(r['capped'] for r in p['validation']),
            'best_validation_fitness':job['best_score'],'stale_checks':job['stale'],
            'restarts':job['restarts'],'decision':decision,'seconds':job['seconds']}
        job['history'].append(row)
        job['pending'] = None
        save()
        export_checkpoint(out,job)
        print(f'{job["name"]}: generation {job["generation"]}, validation {row["validation_lines"]:.1f} lines, '
            f'plateau counter {job["stale"]}/{cfg["patience"]}, {decision}',flush=True)
        if decision=='plateau':
            return 'plateau'
    return 'time_budget'

def morning_report(out,state):
    cfg = state['config']
    text = ['# Overnight training report','',f'Status: **{state["status"]}**. Active process time: {state["elapsed"]/3600:.3f} hours; budget {cfg["hours"]:g} hours.',
        '', 'Only eight output weights learn; internal fly connectivity is fixed. The larger circuit does not increase the number of learned parameters.',
        '', '| Circuit | Generations | Baseline validation fitness | Best validation fitness | Search restarts | Training stop |',
        '|---|---:|---:|---:|---:|---|']
    for j in state['jobs']:
        baseline = 'pending' if j['baseline_validation'] is None else f'{j["baseline_validation"]:.2f}'
        best = 'pending' if j['best_score'] is None else f'{j["best_score"]:.2f}'
        text.append(f'| {j["name"]} | {j["generation"]} | {baseline} | {best} | {j["restarts"]} | {j["status"]} |')
    text += ['',f'Validation fitness = lines + 0.02 × pieces, on {cfg["validation_games"]} fixed validation seeds with a {cfg["validation_cap"]}-piece cap. These scores select checkpoints and are not unbiased final-test estimates.',
        '', '## Fresh final tests','',f'Each starting policy and retained policy is compared on up to {cfg["test_games"]} previously unused seeds, capped at {cfg["test_cap"]} pieces. Incomplete games are discarded. Partial test sets are labelled and may be biased by the deadline.', '']
    for j in state['jobs']:
        pairs = j['test_pairs']
        if not pairs:
            text += [f'- {j["name"]}: no complete test pairs yet.']
            continue
        summary = paired_summary([p['before'] for p in pairs],[p['after'] for p in pairs])
        text += [f'- {j["name"]}: **{summary["before_mean_lines"]:.2f} → {summary["after_mean_lines"]:.2f} lines/game**, '
            f'{len(pairs)}/{cfg["test_games"]} complete pairs; gain 95% paired bootstrap interval {summary["paired_bootstrap_95_ci"]}. '
            f'{summary["after_capped_games"]} final-policy games reached the cap.']
    text += ['', '## Interpreting diminishing returns','',
        f'A meaningful validation gain is at least {cfg["min_absolute_gain"]:g} fitness points or {cfg["min_relative_gain"]:.0%} above the last meaningful improvement, whichever is larger. After {cfg["patience"]} checks without that gain, the search broadens around the retained best policy. After {cfg["max_restarts"]} restarts, another plateau ends that lane.',
        '', 'This is a practical compute-saving rule, not proof of convergence. Noise, repeated use of validation seeds and episode caps limit its interpretation. A high capped-game count means the measurement horizon may need extending.',
        '', 'The 1,024-neuron lane starts with transferred readout weights from the chosen 256-neuron checkpoint. Its baseline is evaluated through its own circuit, so improvement is measured against that transferred starting policy. Hardware budgets are equal in time, not number of generations.',
        '', 'Check `session.json` for full histories, RNG states, pending games and final-test pairs. Use `python -m flytris overnight --resume --out '+str(out)+'` after an interruption. Use the original `--hours` and `--smoke` options if they differed from defaults. Completed sessions do not restart.',
        '', 'The six-hour session was prepared separately from the short development smoke tests. A smoke test confirms operation, not overnight improvement.']
    (out/'MORNING_REPORT.md').write_text('\n'.join(text)+'\n',encoding='utf-8')
    for job in state['jobs']:
        export_checkpoint(out,job)

def overnight(out='runs/overnight',hours=6,resume=False,smoke=False):
    from filelock import FileLock, Timeout
    Path(out).mkdir(parents=True,exist_ok=True)
    try:
        with FileLock(str(Path(out)/'session.lock'),timeout=0):
            return _overnight(out,hours,resume,smoke)
    except Timeout as error:
        raise RuntimeError('This output directory already has an active overnight process.') from error

def _overnight(out='runs/overnight',hours=6,resume=False,smoke=False):
    cfg = settings(hours,smoke)
    out = Path(out)
    out.mkdir(parents=True,exist_ok=True)
    session_path = out/'session.json'
    if session_path.exists():
        if not resume:
            raise FileExistsError('Session exists; use --resume or a new --out.')
        state = json.loads(session_path.read_text())
        if state['config'] != cfg:
            raise ValueError('Resume configuration differs; preserve the original --hours and --smoke.')
        if state['status'] in {'complete','deadline_reached'}:
            print(f'Session already {state["status"]}. No new training started.',flush=True)
            return state
    else:
        weights,source = choose_warm_start()
        state = {'version':1,'config':cfg,'elapsed':0.0,'status':'prepared','warm_start':source,'jobs':[]}
        for index,lane in enumerate(cfg['lanes']):
            seed = 71+index
            state['jobs'].append(dict(lane,seed=seed,seconds=0.0,generation=0,status='pending',
                mean=list(weights),std=[0.2]*8,initial_weights=list(weights),best_weights=list(weights),
                best_score=None,baseline_validation=None,baseline_games=[],meaningful_anchor=None,
                stale=0,restarts=0,pending=None,history=[],test_pairs=[],test_pending=None,
                rng_state=np.random.default_rng(seed).bit_generator.state))
    # Fail before beginning a long CPU run if the requested second backend is unavailable.
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('This two-circuit profile requires CUDA; install requirements-gpu.txt first.')
    started = time.monotonic()
    elapsed_before = state['elapsed']
    global_deadline = started+max(0,hours*3600-elapsed_before)
    active_job = None
    lane_start = None
    lane_before = 0
    last_report = [started]
    def save():
        state['elapsed'] = elapsed_before+time.monotonic()-started
        if active_job is not None:
            active_job['seconds'] = lane_before+time.monotonic()-lane_start
        write_json(session_path,state)
        if time.monotonic()-last_report[0] >= 30:
            morning_report(out,state)
            last_report[0] = time.monotonic()
    state['status'] = 'training'
    save()
    morning_report(out,state)
    try:
        with awake():
            for job in state['jobs']:
                if job['status'] not in {'pending','training'}:
                    continue
                active_job,lane_start,lane_before = job,time.monotonic(),job['seconds']
                lane_deadline = min(global_deadline, lane_start+max(0,hours*3600*5/12-lane_before))
                if time.monotonic() >= lane_deadline:
                    job['status'] = 'time_budget'
                    save()
                    active_job = None
                    continue
                job['status'] = 'training'
                print(f'Starting {job["name"]}; up to {max(0,lane_deadline-time.monotonic())/60:.1f} minutes remain for this circuit.',flush=True)
                reservoir = make_reservoir(job['neurons'],16,'fly',job['device'])
                if 'model' in job and job['model'] != reservoir.metadata():
                    raise ValueError('Connectome/model changed since checkpoint.')
                job['model'] = reservoir.metadata()
                try:
                    job['status'] = train_lane(job,reservoir,cfg,lane_deadline,save,out)
                except TimeoutError:
                    job['status'] = 'time_budget'
                save()
                active_job = None
                del reservoir
                torch.cuda.empty_cache()
                morning_report(out,state)
            state['status'] = 'evaluating'
            save()
            for job in state['jobs']:
                if time.monotonic() >= global_deadline:
                    break
                reservoir = make_reservoir(job['neurons'],16,'fly',job['device'])
                print(f'Fresh final tests: {job["name"]}',flush=True)
                for i in range(len(job['test_pairs']),cfg['test_games']):
                    seed = 7000000+i
                    pending = job['test_pending'] or {'seed':seed}
                    job['test_pending'] = pending
                    try:
                        for label,key in [('before','initial_weights'),('after','best_weights')]:
                            if label not in pending:
                                pending[label] = play(LinearPolicy(reservoir,job[key]),seed,cfg['test_cap'],deadline=global_deadline)
                                save()
                    except TimeoutError:
                        break
                    job['test_pairs'].append(pending)
                    job['test_pending'] = None
                    save()
                del reservoir
                torch.cuda.empty_cache()
            state['status'] = 'complete' if all(len(j['test_pairs'])==cfg['test_games'] for j in state['jobs']) else 'deadline_reached'
            save()
    except KeyboardInterrupt:
        state['status'] = 'paused'
        save()
        print('Paused. Completed games and optimizer state saved; --resume continues.',flush=True)
    except Exception as error:
        state['status'] = 'failed'
        state['error'] = repr(error)
        save()
        morning_report(out,state)
        raise
    morning_report(out,state)
    print(f'{state["status"]}: {(out/"MORNING_REPORT.md").resolve()}',flush=True)
    return state
