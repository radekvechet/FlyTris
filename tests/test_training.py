import json
from pathlib import Path
import tempfile
import unittest
from flytris.train import train

class CheckpointTests(unittest.TestCase):
    def test_resume_reproduces_uninterrupted_optimizer(self):
        with tempfile.TemporaryDirectory() as folder:
            a,b = Path(folder)/'continuous',Path(folder)/'resumed'
            kw = dict(seed=17,neurons=64,steps=4,population=4,games=1,cap=12,mode='raw')
            expected = train(a,generations=2,**kw)
            train(b,generations=1,**kw)
            actual = train(b,generations=2,resume=True,**kw)
            for key in ['mean','std','initial_weights','best_weights','rng_state','placements','generation']:
                self.assertEqual(expected[key],actual[key])
            with self.assertRaises(ValueError):
                train(b,generations=3,resume=True,**(kw|{'cap':13}))
            with self.assertRaises(FileExistsError):
                train(b,generations=3,**kw)

if __name__=='__main__': unittest.main()
