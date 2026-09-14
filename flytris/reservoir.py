"""A normalized LIF reservoir using real directed, signed fly connections.

This fast task adapter is deliberately NOT the upstream biological simulation:
dt=1 ms, normalized threshold/rest, row-normalized recurrent weights, synthetic
feature currents, and state reset per candidate afterstate. Only output weights
are trained. The exact upstream model has a separate full-brain benchmark.
"""
import hashlib
import numpy as np
from scipy import sparse
from .data import circuit

class FlyReservoir:
    def __init__(self, neurons=256, steps=16, seed=42, mode='fly', gain=0.45):
        self.neurons, self.steps, self.seed, self.mode, self.gain = neurons, steps, seed, mode, gain
        raw, self.indices = circuit(neurons)
        self.neurons = raw.shape[0]
        self.raw_edges = raw.nnz
        self.graph_hash = hashlib.sha256(raw.indptr.tobytes()+raw.indices.tobytes()+raw.data.tobytes()).hexdigest()
        rows = np.asarray(abs(raw).sum(1)).ravel()
        self.w = (sparse.diags(1/np.maximum(rows,1)) @ raw).astype(np.float32).tocsr()
        if mode == 'disconnected':
            self.w = sparse.csr_matrix(raw.shape,dtype=np.float32)
        elif mode == 'shuffled':
            # Relabel graph relative to the SAME encoder/readout; preserves degree/sign statistics.
            permutation = np.random.default_rng(seed+100).permutation(self.neurons)
            self.w = self.w[permutation][:,permutation].tocsr()
        elif mode != 'fly':
            raise ValueError(mode)
        rng = np.random.default_rng(seed)
        self.groups = np.arange(self.neurons) % 8
        rng.shuffle(self.groups)
        self.input_gain = rng.uniform(0.7,1.3,self.neurons).astype(np.float32)
        self.bias = rng.uniform(0.2,0.35,self.neurons).astype(np.float32)
        self.pool = np.zeros((8,self.neurons),dtype=np.float32)
        for g in range(8):
            self.pool[g,self.groups==g] = 1 / np.count_nonzero(self.groups==g)
        self.last_spikes = 0

    def transform(self, x):
        # Independent candidate states batched in columns. No raw-feature bypass.
        drive = self.bias[:,None] + 1.8*self.input_gain[:,None]*x[:,self.groups].T
        voltage = np.zeros_like(drive)
        spikes = np.zeros_like(drive)
        trace = np.zeros_like(drive)
        total = np.zeros_like(drive)
        mean_voltage = np.zeros_like(drive)
        for _ in range(self.steps):
            trace = 0.7*trace + spikes
            voltage = np.maximum(0, 0.9*voltage + 0.2*drive + self.gain*(self.w @ trace))
            spikes = (voltage >= 1).astype(np.float32)
            voltage -= spikes  # subtractive reset
            total += spikes
            mean_voltage += voltage
        # Smooth subthreshold activity supplements spike counts for short windows.
        response = (total + 0.25*mean_voltage) / self.steps
        self.last_spikes = int(total.sum())
        return (self.pool @ response).T

    def metadata(self):
        return {'kind':'normalized_lif_fly_reservoir','neurons':self.neurons,'edges':self.raw_edges,
            'steps':self.steps,'encoder_seed':self.seed,'mode':self.mode,'recurrent_gain':self.gain,
            'graph_sha256':self.graph_hash,'trainable_parameters':8,
            'input_features':8,'state_reset':'each_candidate',
            'biological_fidelity':'Task-adapted dynamics; not the canonical Shiu/Eon model.'}

class LinearPolicy:
    def __init__(self, reservoir, weights, ablate=False):
        self.reservoir = reservoir
        self.weights = np.asarray(weights,dtype=np.float32)
        self.ablate = ablate

    def __call__(self, x):
        z = x if self.reservoir is None else self.reservoir.transform(x)
        if self.ablate:
            z = np.zeros_like(z)
        return int(np.argmax(z @ self.weights))

class TorchFlyReservoir(FlyReservoir):
    """Same task-adapted dynamics on CUDA; the small default remains faster on CPU."""
    def __init__(self, neurons=256, steps=16, seed=42, mode='fly', gain=0.45):
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError('CUDA unavailable; install requirements-gpu.txt or select --device cpu.')
        super().__init__(neurons,steps,seed,mode,gain)
        self.torch = torch
        self.tw = torch.sparse_csr_tensor(torch.from_numpy(self.w.indptr.astype(np.int64)),
            torch.from_numpy(self.w.indices.astype(np.int64)),torch.from_numpy(self.w.data),
            size=self.w.shape,device='cuda')
        self.tgroups = torch.as_tensor(self.groups,device='cuda')
        self.tinput_gain = torch.as_tensor(self.input_gain,device='cuda')
        self.tbias = torch.as_tensor(self.bias,device='cuda')
        self.tpool = torch.as_tensor(self.pool,device='cuda')

    def transform(self, x):
        torch = self.torch
        with torch.no_grad():
            tx = torch.as_tensor(x,device='cuda')
            drive = self.tbias[:,None]+1.8*self.tinput_gain[:,None]*tx[:,self.tgroups].T
            voltage = torch.zeros_like(drive)
            spikes = torch.zeros_like(drive)
            trace = torch.zeros_like(drive)
            total = torch.zeros_like(drive)
            mean_voltage = torch.zeros_like(drive)
            for _ in range(self.steps):
                trace = 0.7*trace+spikes
                voltage = torch.clamp(0.9*voltage+0.2*drive+self.gain*torch.sparse.mm(self.tw,trace),min=0)
                spikes = (voltage>=1).float()
                voltage -= spikes
                total += spikes
                mean_voltage += voltage
            self.last_total = total.sum()
            response = (total+0.25*mean_voltage)/self.steps
            return (self.tpool @ response).T.cpu().numpy()

def make_reservoir(neurons=256,steps=16,mode='fly',device='cpu'):
    if mode=='raw':
        return None
    cls = TorchFlyReservoir if device=='cuda' else FlyReservoir
    return cls(neurons,steps,mode=mode)
