import time
import contextlib
import importlib.util
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from flytris.overnight import settings,plateau,cached_games
from flytris.tetris import play

class OvernightTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec('torch'),'Optional torch dependency unavailable')
    def test_session_resume_preserves_optimizer_and_pending_games(self):
        from flytris.overnight import overnight
        class DummyReservoir:
            def metadata(self): return {'kind':'unit_test'}
        calls = [0]
        interrupt = [False]
        def game(policy,seed,cap,deadline):
            calls[0] += 1
            if interrupt[0] and calls[0]==4:
                raise KeyboardInterrupt()
            return dict(seed=seed,fitness=1.,lines=1,pieces=5,capped=False)
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            stack.enter_context(patch('flytris.overnight.choose_warm_start',return_value=([1.,0,0,0,0,0,0,0],'unit_test')))
            stack.enter_context(patch('flytris.overnight.make_reservoir',return_value=DummyReservoir()))
            stack.enter_context(patch('flytris.overnight.play',side_effect=game))
            stack.enter_context(patch('flytris.overnight.awake',side_effect=contextlib.nullcontext))
            stack.enter_context(patch('torch.cuda.is_available',return_value=True))
            expected = overnight(Path(folder)/'continuous',hours=0.01,smoke=True)
            calls[0],interrupt[0] = 0,True
            paused = overnight(Path(folder)/'resumed',hours=0.01,smoke=True)
            self.assertEqual(paused['status'],'paused')
            interrupt[0] = False
            actual = overnight(Path(folder)/'resumed',hours=0.01,smoke=True,resume=True)
            self.assertEqual(actual['status'],'complete')
            for a,b in zip(expected['jobs'],actual['jobs']):
                for key in ['mean','std','rng_state','best_weights','generation','test_pairs','status']:
                    self.assertEqual(a[key],b[key],key)

    def test_second_writer_is_rejected(self):
        from filelock import FileLock
        from flytris.overnight import overnight
        with tempfile.TemporaryDirectory() as folder:
            with FileLock(str(Path(folder)/'session.lock')):
                with self.assertRaisesRegex(RuntimeError,'active overnight process'):
                    overnight(out=folder,smoke=True,hours=0.01)

    def test_deadline_discards_partial_game(self):
        with self.assertRaises(TimeoutError):
            play(lambda x:0,1,100,deadline=time.monotonic()-1)

    def test_plateau_restarts_then_stops_and_cumulative_gain_counts(self):
        cfg = settings()
        job = dict(meaningful_anchor=100.,stale=0,restarts=0,best_weights=[1.]*8)
        for restart in range(2):
            for _ in range(7):
                self.assertEqual(plateau(job,101,cfg),'continue')
            self.assertEqual(plateau(job,101,cfg),'restart')
            self.assertEqual(job['restarts'],restart+1)
        for _ in range(7): plateau(job,101,cfg)
        self.assertEqual(plateau(job,101,cfg),'plateau')
        self.assertEqual(plateau(job,102,cfg),'continue')
        self.assertEqual(job['stale'],0)

    def test_nonfinite_budget_rejected(self):
        for hours in [0,-1,float('inf'),float('nan')]:
            with self.assertRaises(ValueError): settings(hours)

    def test_completed_games_are_not_replayed_after_interruption(self):
        results,visited = [],[]
        def game(policy,seed,cap,deadline):
            visited.append(seed)
            if seed==13 and len(visited)==3:
                raise TimeoutError()
            return {'fitness':float(seed)}
        with patch('flytris.overnight.play',side_effect=game):
            with self.assertRaises(TimeoutError):
                cached_games(None,[0]*8,[11,12,13],100,999,results,lambda:None)
            score = cached_games(None,[0]*8,[11,12,13],100,999,results,lambda:None)
        self.assertEqual(visited,[11,12,13,13])
        self.assertEqual(score,12.)

if __name__=='__main__': unittest.main()
