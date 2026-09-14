"""Export the trained reservoir for offline browser inference."""
import json
from pathlib import Path
from .reservoir import make_reservoir


def export_model(checkpoint):
    state = json.loads(Path(checkpoint).read_text())
    if state.get('config',{}).get('task')=='falling-v1':
        raise ValueError('Falling-rules checkpoints require the falling controller; do not export as a placement policy.')
    c = state['config']
    r = make_reservoir(c['neurons'], c['steps'], c['mode'])
    if r is None or r.graph_hash != state['model']['graph_sha256']:
        raise ValueError('Versus requires the trained checkpoint’s original fly graph.')
    return dict(metadata=r.metadata(), training_seed=c['seed'], generation=state['generation'],
                weights=state['best_weights'], groups=r.groups.tolist(),
                input_gain=r.input_gain.tolist(), bias=r.bias.tolist(),
                indptr=r.w.indptr.tolist(), indices=r.w.indices.tolist(), data=r.w.data.tolist())
