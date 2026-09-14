"""Reward-only cross-entropy optimization of eight output weights."""
import json
import time
from pathlib import Path
import numpy as np
from .reservoir import FlyReservoir, LinearPolicy, make_reservoir
from .tetris import play

def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    temp = path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value,indent=2),encoding='utf-8')
    temp.replace(path)

def evaluate(reservoir, weights, seeds, cap, ablate=False):
    policy = LinearPolicy(reservoir,weights,ablate)
    return [play(policy,int(s),cap) for s in seeds]

def train(out, seed=11, neurons=256, steps=16, generations=12, population=16,
          games=2, cap=100, mode='fly', resume=False, device='cpu'):
    out = Path(out)
    out.mkdir(parents=True,exist_ok=True)
    checkpoint = out/'checkpoint.json'
    config = dict(seed=seed,neurons=neurons,steps=steps,population=population,games=games,cap=cap,mode=mode)
    reservoir = make_reservoir(neurons,steps,mode,device)
    rng = np.random.default_rng(seed)
    mean = rng.normal(0,1,8)
    mean /= np.linalg.norm(mean)
    initial = mean.copy()
    std = np.ones(8)
    best = initial.copy()
    best_val = -np.inf
    first = 0
    seconds = 0.0
    placements = 0
    if checkpoint.exists():
        if not resume:
            raise FileExistsError(f'{checkpoint} exists; choose a new --out or use --resume.')
        previous = json.loads(checkpoint.read_text())
        if previous['config'] != config:
            raise ValueError('Resume configuration differs from checkpoint.')
        if reservoir is not None and previous['model'] != reservoir.metadata():
            raise ValueError('Resume graph or reservoir metadata differs from checkpoint.')
        mean, std, best, initial = [np.array(previous[k]) for k in ['mean','std','best_weights','initial_weights']]
        rng.bit_generator.state = previous['rng_state']
        best_val, first = previous['best_validation_fitness'], previous['generation']
        seconds, placements = previous['train_seconds'],previous['placements']
    validation_seeds = list(range(50000,50004))
    for generation in range(first,generations):
        start = time.perf_counter()
        candidates = rng.normal(mean,std,(population,8))
        candidates[0] = mean
        candidates /= np.maximum(np.linalg.norm(candidates,axis=1,keepdims=True),1e-8)
        train_seeds = [100000+seed*10000+generation*games+j for j in range(games)]
        fitness = []
        for weights in candidates:
            results = evaluate(reservoir,weights,train_seeds,cap)
            placements += sum(r['pieces'] for r in results)
            fitness.append(np.mean([r['fitness'] for r in results]))
        elite = candidates[np.argsort(fitness)[-max(2,population//4):]]
        mean = 0.2*mean+0.8*elite.mean(0)
        mean /= max(np.linalg.norm(mean),1e-8)
        std = np.maximum(0.08,0.2*std+0.8*elite.std(0))
        validation = evaluate(reservoir,mean,validation_seeds,cap)
        placements += sum(r['pieces'] for r in validation)
        val = float(np.mean([r['fitness'] for r in validation]))
        if val > best_val:
            best_val, best = val, mean.copy()
        elapsed = time.perf_counter()-start
        seconds += elapsed
        state = {'config':config,'generation':generation+1,'mean':mean.tolist(),'std':std.tolist(),
            'best_weights':best.tolist(),'initial_weights':initial.tolist(),
            'best_validation_fitness':best_val,'rng_state':rng.bit_generator.state,
            'train_seconds':seconds,'placements':placements,'compute_device':device,
            'model':{'kind':'raw_feature_linear_control','trainable_parameters':8} if reservoir is None else reservoir.metadata()}
        write_json(checkpoint,state)
        row = {'generation':generation+1,'train_fitness_mean':float(np.mean(fitness)),
            'train_fitness_best':float(max(fitness)),'validation_lines':float(np.mean([r['lines'] for r in validation])),
            'validation_fitness':val,'best_validation_fitness':best_val,'seconds':elapsed,'total_seconds':seconds}
        with open(out/'history.jsonl','a',encoding='utf-8') as f:
            f.write(json.dumps(row)+'\n')
        print(f'{mode} seed={seed} generation={generation+1}/{generations} validation lines={row["validation_lines"]:.2f} time={elapsed:.1f}s',flush=True)
    return json.loads(checkpoint.read_text())

def paired_summary(before,after):
    a = np.array([r['lines'] for r in before],dtype=float)
    b = np.array([r['lines'] for r in after],dtype=float)
    d = b-a
    rng = np.random.default_rng(847)
    bootstrap = rng.choice(d,(5000,len(d)),replace=True).mean(1)
    return {'games':len(d),'before_mean_lines':float(a.mean()),'after_mean_lines':float(b.mean()),
        'before_median_lines':float(np.median(a)),'after_median_lines':float(np.median(b)),
        'mean_line_improvement':float(d.mean()),
        'paired_bootstrap_95_ci':np.quantile(bootstrap,[0.025,0.975]).tolist(),
        'wins':int((d>0).sum()),'ties':int((d==0).sum()),'losses':int((d<0).sum()),
        'after_capped_games':sum(r['capped'] for r in after),
        'learning_evidence':bool(np.quantile(bootstrap,0.025)>0)}

def experiment(out, seeds=(11,22,33), neurons=256, steps=16, generations=12,
               population=16, games=2, cap=100, test_games=24, test_cap=300, resume=False, device='cpu'):
    from .benchmark import hardware
    out = Path(out)
    out.mkdir(parents=True,exist_ok=True)
    started = time.perf_counter()
    test_seeds = list(range(90000,90000+test_games))
    runs = []
    # All runs and test seeds are fixed before observing any held-out results.
    for seed in seeds:
        state = train(out/f'fly_seed{seed}',seed,neurons,steps,generations,population,games,cap,'fly',resume,device)
        runs.append((seed,state))
    # Same training budget and features, with the fly simulation removed.
    control = train(out/'raw_control',seeds[0],neurons,steps,generations,population,games,cap,'raw',resume)
    reservoir = make_reservoir(neurons,steps,'fly',device)
    summaries = []
    for seed,state in runs:
        print(f'Held-out evaluation: fly seed {seed}',flush=True)
        before = evaluate(reservoir,state['initial_weights'],test_seeds,test_cap)
        after = evaluate(reservoir,state['best_weights'],test_seeds,test_cap)
        silenced = evaluate(reservoir,state['best_weights'],test_seeds,test_cap,ablate=True)
        disconnected = evaluate(make_reservoir(neurons,steps,'disconnected',device),state['best_weights'],test_seeds,test_cap)
        result = {'training_seed':seed,'summary':paired_summary(before,after),
            'before':before,'after':after,'silenced':silenced,'disconnected':disconnected,
            'train_seconds':state['train_seconds'],'training_placements':state['placements']}
        write_json(out/f'fly_seed{seed}'/'evaluation.json',result)
        summaries.append(result)
    raw_results = evaluate(None,control['best_weights'],test_seeds,test_cap)
    random_results = []
    for seed in test_seeds:
        rng = np.random.default_rng(seed+1)
        random_results.append(play(lambda x: rng.integers(len(x)),seed,test_cap))
    # Replay first predeclared test seed with first training replicate, not best game.
    replay = play(LinearPolicy(reservoir,runs[0][1]['best_weights']),test_seeds[0],test_cap,record=True)
    write_json(out/'replay.json',replay)
    result = {'hardware':hardware(),'model':reservoir.metadata(),
        'protocol':{'training_seeds':list(seeds),'held_out_seeds':test_seeds,'generations':generations,
            'population':population,'games_per_candidate':games,'training_piece_cap':cap,'test_piece_cap':test_cap,
            'fitness':'lines + 0.02 * pieces','selection':'validation seeds 50000..50003 only',
            'test_policy':'greedy, no learning during evaluation'},
        'replicates':summaries,'raw_control':raw_results,'random_control':random_results,
        'raw_train_seconds':control['train_seconds'],'elapsed_seconds':time.perf_counter()-started,
        'limitations':['Simplified placement Tetris: no hold, kicks, tucks or real-time control.',
            'Eight engineered board features; synthetic input mapping.',
            'Small extracted subgraph with normalized LIF dynamics; not full biological brain training.',
            'Only eight output weights learn. Internal fly synapses remain fixed.',
            'Paired intervals are conditional on each trained model; no proof of fly-topology advantage.',
            'Fixed-budget timing does not predict time to convergence.']}
    write_json(out/'results.json',result)
    from .report import generate
    generate(out)
    print(json.dumps({str(r['training_seed']):r['summary'] for r in summaries},indent=2),flush=True)
    return result
