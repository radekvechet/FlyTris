import importlib.util
import unittest
import numpy as np
from flytris.data import ROOT

def cuda_available():
    if not importlib.util.find_spec('torch'):
        return False
    import torch
    return torch.cuda.is_available() and (ROOT/'data/2025_Connectivity_783.parquet').exists()

@unittest.skipUnless(cuda_available(),'Optional CUDA PyTorch or real data unavailable')
class CudaTests(unittest.TestCase):
    def test_gpu_shape_activity_and_policy_match_cpu(self):
        from flytris.reservoir import FlyReservoir,TorchFlyReservoir,LinearPolicy
        x = np.random.default_rng(35).uniform(0,0.6,(34,8)).astype(np.float32)
        cpu = FlyReservoir(64)
        gpu = TorchFlyReservoir(64)
        a,b = cpu.transform(x),gpu.transform(x)
        self.assertEqual(b.shape,(34,8))
        np.testing.assert_allclose(a,b,rtol=1e-4,atol=1e-5)
        weights = np.random.default_rng(84).normal(size=8)
        self.assertEqual(LinearPolicy(cpu,weights)(x),LinearPolicy(gpu,weights)(x))

if __name__=='__main__': unittest.main()
