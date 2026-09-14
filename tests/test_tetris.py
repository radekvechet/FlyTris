import unittest
import numpy as np
from flytris.tetris import Tetris, features, ROTATIONS, play

class PhysicsTests(unittest.TestCase):
    def test_seven_bag(self):
        env = Tetris(9)
        first = [env.piece]+[env.next_piece() for _ in range(6)]
        second = [env.next_piece() for _ in range(7)]
        self.assertEqual(sorted(first),list(range(7)))
        self.assertEqual(sorted(second),list(range(7)))

    def test_orientations(self):
        self.assertEqual([len(x) for x in ROTATIONS],[2,1,4,2,2,4,4])

    def test_tetris_four_line_clear(self):
        env = Tetris(0)
        env.board[16:,:] = 1
        env.board[16:,4] = 0
        env.piece = 0
        c = env.candidates()
        action = int(c.lines.argmax())
        self.assertEqual(int(c.lines[action]),4)
        self.assertEqual(int(c.boards[action].sum()),0)
        env.step(c,action)
        self.assertEqual(env.lines,4)

    def test_game_over(self):
        env = Tetris(0)
        env.board[:] = 1
        self.assertIsNone(env.candidates())

    def test_holes(self):
        boards = np.zeros((1,20,10),dtype=np.uint8)
        boards[0,17,2] = 1
        x = features(boards,np.array([0]))
        self.assertAlmostEqual(float(x[0,1]*200),2,places=5)
        self.assertAlmostEqual(float(x[0,3]*20),3,places=5)

    def test_conservation_and_no_overlap(self):
        env = Tetris(235)
        for _ in range(80):
            c = env.candidates()
            if c is None: break
            before = np.count_nonzero(env.board)
            for board,lines in zip(c.boards,c.lines):
                self.assertEqual(np.count_nonzero(board),before+4-10*int(lines))
            env.step(c,int(c.features[:,0].argmin()))

    def test_replay_is_deterministic(self):
        policy = lambda x:int(np.argmin(x[:,0]+4*x[:,1]))
        self.assertEqual(play(policy,12,30,True),play(policy,12,30,True))

if __name__=='__main__': unittest.main()
