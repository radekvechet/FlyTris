"""10x20, seven-bag, hard-drop Tetris. No hold, kicks, tucks or real-time clock.

Actions enumerate legal orientation/column placements. Policies see candidate
afterstate features; the physics and action enumeration are shared by controls.
"""
from dataclasses import dataclass
import time
import numpy as np

SHAPES = [
    [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]],
    [[0,1,1],[1,1,0]], [[1,1,0],[0,1,1]],
    [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]],
]
NAMES = ['I','O','T','S','Z','J','L']

def rotations(shape):
    result = []
    a = np.array(shape, dtype=np.uint8)
    for _ in range(4):
        if not any(np.array_equal(a,b) for b in result):
            result.append(a.copy())
        a = np.rot90(a)
    return result

ROTATIONS = [rotations(s) for s in SHAPES]
TEMPLATES = []
for variants in ROTATIONS:
    actions = []
    for r, s in enumerate(variants):
        ys, xs = np.nonzero(s)
        bottom = np.array([np.flatnonzero(s[:,i])[-1] for i in range(s.shape[1])])
        for x in range(11-s.shape[1]):
            actions.append((r,x,ys,xs,bottom))
    TEMPLATES.append(actions)

FEATURE_NAMES = ['aggregate_height','holes','bumpiness','max_height','lines_cleared','wells','row_transitions','column_transitions']

def features(boards, lines):
    occupied = boards != 0
    heights = np.where(occupied.any(axis=1), 20-occupied.argmax(axis=1), 0)
    below_top = np.maximum.accumulate(occupied, axis=1)
    holes = (below_top & ~occupied).sum(axis=(1,2))
    side = np.pad(heights, ((0,0),(1,1)), constant_values=20)
    wells = np.maximum(0, np.minimum(side[:,:-2], side[:,2:])-heights)
    horizontal = np.pad(occupied, ((0,0),(0,0),(1,1)), constant_values=True)
    vertical = np.pad(occupied, ((0,0),(1,1),(0,0)), constant_values=True)
    raw = np.stack([heights.sum(1), holes, np.abs(np.diff(heights,axis=1)).sum(1),
        heights.max(1), lines, wells.sum(1), (horizontal[:,:,1:] != horizontal[:,:,:-1]).sum((1,2)),
        (vertical[:,1:,:] != vertical[:,:-1,:]).sum((1,2))], axis=1)
    return (raw / np.array([200,200,180,20,4,200,220,210],dtype=np.float32)).astype(np.float32)

@dataclass
class Candidates:
    boards: np.ndarray
    features: np.ndarray
    lines: np.ndarray
    actions: list

class Tetris:
    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)
        self.board = np.zeros((20,10), dtype=np.uint8)
        self.bag = []
        self.pieces = 0
        self.lines = 0
        self.piece = self.next_piece()

    def next_piece(self):
        if not self.bag:
            self.bag = self.rng.permutation(7).tolist()
        return self.bag.pop()

    def candidates(self):
        occupied = self.board != 0
        top = np.where(occupied.any(0), occupied.argmax(0), 20)
        boards, cleared, actions = [], [], []
        for rotation,x,ys,xs,bottom in TEMPLATES[self.piece]:
            y = int(np.min(top[x:x+len(bottom)] - bottom - 1))
            if y < 0:
                continue
            b = self.board.copy()
            b[y+ys,x+xs] = self.piece+1
            full = (b != 0).all(1)
            count = int(full.sum())
            if count:
                b = np.concatenate([np.zeros((count,10),dtype=np.uint8),b[~full]],axis=0)
            boards.append(b)
            cleared.append(count)
            actions.append({'rotation':rotation,'x':x,'y':y})
        if not boards:
            return None
        boards = np.stack(boards)
        lines = np.array(cleared,dtype=np.int32)
        return Candidates(boards, features(boards,lines), lines, actions)

    def step(self, candidates, action):
        self.board = candidates.boards[action].copy()
        self.lines += int(candidates.lines[action])
        self.pieces += 1
        self.piece = self.next_piece()

def play(policy, seed, max_pieces=200, record=False, deadline=None):
    env = Tetris(seed)
    frames = []
    while env.pieces < max_pieces:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError('Game stopped at the run deadline; no partial score is used.')
        candidates = env.candidates()
        if candidates is None:
            break
        action = int(policy(candidates.features))
        if record:
            frames.append({'piece':NAMES[env.piece], 'action':candidates.actions[action],
                'cleared':int(candidates.lines[action]), 'board':candidates.boards[action].tolist()})
        env.step(candidates,action)
    result = {'seed':int(seed), 'lines':env.lines, 'pieces':env.pieces,
        'capped':env.pieces==max_pieces, 'fitness':env.lines+0.02*env.pieces}
    if record:
        result['frames'] = frames
    return result
