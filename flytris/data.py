"""Pinned, public upstream data; no synthetic-connectome fallback."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
COMMIT = 'a3db62f9436074e485c0278290c2164ed6150808'
BASE = f'https://raw.githubusercontent.com/eonsystemspbc/fly-brain/{COMMIT}/'
FILES = {
    'data/2025_Completeness_783.csv': 'data/2025_Completeness_783.csv',
    'data/2025_Connectivity_783.parquet': 'data/2025_Connectivity_783.parquet',
    'vendor/run_pytorch.py': 'code/run_pytorch.py',
    'vendor/LICENSE': 'LICENSE',
}

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def fetch():
    manifest_path = ROOT / 'data/source.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    records = {}
    for dest, source in FILES.items():
        path = ROOT / dest
        path.parent.mkdir(parents=True, exist_ok=True)
        expected = old.get('files', {}).get(dest, {}).get('sha256')
        if not path.exists() or (expected and sha256(path) != expected):
            print(f'Downloading {source}', flush=True)
            temp = path.with_suffix(path.suffix + '.part')
            request = urllib.request.Request(BASE + source, headers={'User-Agent': 'FlyTris-research'})
            with urllib.request.urlopen(request, timeout=120) as response, open(temp, 'wb') as f:
                while block := response.read(1024 * 1024):
                    f.write(block)
            if temp.stat().st_size < 100:
                raise RuntimeError(f'Unexpectedly small download: {source}')
            temp.replace(path)
        records[dest] = {'url': BASE + source, 'sha256': sha256(path), 'bytes': path.stat().st_size}
        print(f'  {dest}: {path.stat().st_size / 1e6:.1f} MB', flush=True)
    manifest_path.write_text(json.dumps({'repository': 'https://github.com/eonsystemspbc/fly-brain',
        'commit': COMMIT, 'files': records}, indent=2))

def load_graph():
    import numpy as np
    import pandas as pd
    from scipy import sparse
    path = ROOT / 'data/full_graph.npz'
    if path.exists():
        return sparse.load_npz(path).tocsr()
    conn = ROOT / 'data/2025_Connectivity_783.parquet'
    if not conn.exists():
        raise FileNotFoundError('Run python -m flytris fetch first. Real connectivity is required.')
    df = pd.read_parquet(conn, columns=['Postsynaptic_Index', 'Presynaptic_Index', 'Excitatory x Connectivity'])
    n = len(pd.read_csv(ROOT / 'data/2025_Completeness_783.csv'))
    post = df['Postsynaptic_Index'].to_numpy(np.int64)
    pre = df['Presynaptic_Index'].to_numpy(np.int64)
    if min(pre.min(), post.min()) < 0 or max(pre.max(), post.max()) >= n:
        raise ValueError('Connectome indices do not match the neuron table.')
    w = sparse.coo_matrix((df['Excitatory x Connectivity'].to_numpy(np.float32), (post, pre)), shape=(n,n)).tocsr()
    w.eliminate_zeros()
    sparse.save_npz(path, w)
    return w

def circuit(n=256):
    """Deterministic connected growth by total absolute connection weight.

    No claim of selecting an anatomically defined learning circuit. The saved
    indices map back to the upstream neuron table, retaining directed signed edges.
    """
    import numpy as np
    from scipy import sparse
    cache = ROOT / f'data/circuit_{n}.npz'
    ids_path = ROOT / f'data/circuit_{n}_indices.npy'
    if cache.exists() and ids_path.exists():
        return sparse.load_npz(cache).tocsr(), np.load(ids_path)
    w = load_graph()
    if n >= w.shape[0]:
        ids = np.arange(w.shape[0])
        return w, ids
    if n < 8:
        raise ValueError('Use at least 8 neurons.')
    graph = abs(w) + abs(w.T)
    degree = np.asarray(graph.sum(axis=1)).ravel()
    score = np.zeros(w.shape[0], dtype=np.float64)
    used = np.zeros(w.shape[0], dtype=bool)
    selected = []
    node = int(degree.argmax())
    for _ in range(n):
        selected.append(node)
        used[node] = True
        row = graph.getrow(node)
        score[row.indices] += row.data
        score[used] = -np.inf
        node = int(score.argmax())
    ids = np.sort(np.array(selected, dtype=np.int64))
    sub = w[ids][:, ids].tocsr()
    sparse.save_npz(cache, sub)
    np.save(ids_path, ids)
    return sub, ids
