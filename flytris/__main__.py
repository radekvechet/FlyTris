import os
# Small candidate batches suffer badly from BLAS thread oversubscription.
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('OMP_NUM_THREADS','1')
os.environ.setdefault('MKL_NUM_THREADS','1')
import argparse

def main():
    p = argparse.ArgumentParser(description='FlyTris: real fly connectivity, trainable Tetris readout')
    sub = p.add_subparsers(dest='command',required=True)
    sub.add_parser('fetch')
    falling = sub.add_parser('falling-overnight',help='Train against the browser falling/tick rules')
    falling.add_argument('--out',default='runs/falling_overnight')
    falling.add_argument('--hours',type=float,default=6)
    falling.add_argument('--workers',type=int,default=4)
    falling.add_argument('--resume',action='store_true')
    falling.add_argument('--smoke',action='store_true')
    night = sub.add_parser('overnight',help='Up to six hours, with plateau handling and fresh final tests')
    night.add_argument('--out',default='runs/overnight')
    night.add_argument('--hours',type=float,default=6)
    night.add_argument('--resume',action='store_true')
    night.add_argument('--smoke',action='store_true',help='Tiny game/search settings for development verification')
    for name in ['train','experiment']:
        t = sub.add_parser(name)
        t.add_argument('--out',required=True)
        t.add_argument('--neurons',type=int,default=256)
        t.add_argument('--steps',type=int,default=16)
        t.add_argument('--generations',type=int,default=12)
        t.add_argument('--population',type=int,default=16)
        t.add_argument('--games',type=int,default=2)
        t.add_argument('--cap',type=int,default=100)
        t.add_argument('--resume',action='store_true')
        t.add_argument('--device',choices=['cpu','cuda'],default='cpu')
        if name=='train':
            t.add_argument('--seed',type=int,default=11)
            t.add_argument('--mode',choices=['fly','raw','shuffled','disconnected'],default='fly')
        else:
            t.add_argument('--seeds',nargs='+',type=int,default=[11,22,33])
            t.add_argument('--test-games',type=int,default=24)
            t.add_argument('--test-cap',type=int,default=300)
    b = sub.add_parser('benchmark')
    b.add_argument('--out',default='runs/benchmark.json')
    b.add_argument('--sizes',type=int,nargs='+',default=[256,1024,4096,138639])
    b.add_argument('--steps',type=int,default=16)
    b.add_argument('--repeats',type=int,default=3)
    b.add_argument('--device',choices=['cpu','cuda'],default='cpu')
    b = sub.add_parser('benchmark-upstream')
    b.add_argument('--out',default='runs/upstream_gpu.json')
    b.add_argument('--duration-ms',type=float,default=100)
    b.add_argument('--repeats',type=int,default=3)
    b.add_argument('--batch',type=int,default=1)
    b.add_argument('--device',choices=['cpu','cuda'],default='cuda')
    r = sub.add_parser('report')
    r.add_argument('--out',required=True)
    r = sub.add_parser('replay')
    r.add_argument('--checkpoint',required=True)
    r.add_argument('--seed',type=int,default=91000)
    r.add_argument('--cap',type=int,default=300)
    r.add_argument('--out',default='runs/replay.json')
    r.add_argument('--device',choices=['cpu','cuda'],default='cpu')
    r = sub.add_parser('pack')
    r.add_argument('--out',default='dist/flytris.zip')
    r.add_argument('--include-data',action='store_true')
    r.add_argument('--run',default='runs/local')
    args = vars(p.parse_args())
    cmd = args.pop('command')
    for key in ['steps','generations','population','games','cap','test_games','test_cap','repeats','batch','duration_ms']:
        if key in args and args[key] <= 0:
            p.error(f'{key} must be positive')
    if 'population' in args and args['population'] < 4:
        p.error('population must be >= 4')
    if cmd=='fetch':
        from .data import fetch
        fetch()
    elif cmd=='falling-overnight':
        from .falling_training import run
        run(**args)
    elif cmd=='overnight':
        from .overnight import overnight
        overnight(**args)
    elif cmd in {'train','experiment'}:
        from . import train
        getattr(train,cmd)(**args)
    elif cmd=='benchmark':
        from .benchmark import bench_reservoir
        bench_reservoir(**args)
    elif cmd=='benchmark-upstream':
        from .benchmark import bench_upstream
        bench_upstream(**args)
    elif cmd=='report':
        from .report import generate
        generate(**args)
    elif cmd=='replay':
        import json
        from pathlib import Path
        from .reservoir import make_reservoir,LinearPolicy
        from .tetris import play
        from .train import write_json
        checkpoint = json.loads(Path(args['checkpoint']).read_text())
        if checkpoint.get('config',{}).get('task')=='falling-v1':
            raise ValueError('This is a falling-rules model. Use its saved tick replay, not the placement replay command.')
        c = checkpoint['config']
        reservoir = make_reservoir(c['neurons'],c['steps'],c['mode'],args['device'])
        write_json(args['out'],play(LinearPolicy(reservoir,checkpoint['best_weights']),args['seed'],args['cap'],record=True))
    elif cmd=='pack':
        from .report import pack
        pack(**args)

if __name__=='__main__':
    main()
