import unittest
import numpy as np
from flytris.data import ROOT,circuit,load_graph
from flytris.reservoir import FlyReservoir,LinearPolicy

@unittest.skipUnless((ROOT/'data/2025_Connectivity_783.parquet').exists(),'Download public data first')
class ReservoirTests(unittest.TestCase):
    def test_real_edges_preserved(self):
        small,ids = circuit(64)
        actual = load_graph()[ids][:,ids]
        self.assertEqual((small != actual).nnz,0)
        self.assertGreater(small.nnz,0)

    def test_input_and_recurrence_affect_activity(self):
        rng = np.random.default_rng(19)
        x = rng.uniform(0,0.7,(12,8)).astype(np.float32)
        fly = FlyReservoir(64)
        a = fly.transform(x)
        self.assertTrue(np.isfinite(a).all())
        self.assertGreater(fly.last_spikes,0)
        self.assertGreater(float(np.linalg.norm(a-fly.transform(x*0))),1e-4)
        disconnected = FlyReservoir(64,mode='disconnected')
        self.assertGreater(float(np.linalg.norm(a-disconnected.transform(x))),1e-4)
        np.testing.assert_array_equal(a,fly.transform(x))

    def test_no_raw_feature_bypass(self):
        fly = FlyReservoir(64)
        x = np.random.default_rng(1).random((10,8)).astype(np.float32)
        p = LinearPolicy(fly,np.arange(8),ablate=True)
        self.assertEqual(p(x),0)

if __name__=='__main__': unittest.main()
