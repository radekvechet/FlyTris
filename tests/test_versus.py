import json
import shutil
import subprocess
import unittest
import numpy as np
from flytris.data import ROOT
from flytris.tetris import Tetris, NAMES, ROTATIONS
from flytris.reservoir import make_reservoir, LinearPolicy
from flytris.versus import export_model


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed for browser-model parity checks')
class VersusParity(unittest.TestCase):
    def test_live_model_and_placement_rules_match_python(self):
        checkpoint = ROOT/'runs/local/fly_seed11/checkpoint.json'
        if not checkpoint.exists():
            self.skipTest('Local trained checkpoint not available')
        model = export_model(checkpoint)
        r = make_reservoir(model['metadata']['neurons'], model['metadata']['steps'])
        policy = LinearPolicy(r, model['weights'])
        replay = json.loads((ROOT/'runs/local/replay.json').read_text())
        boards = [np.zeros((20,10),dtype=np.uint8)]
        boards += [np.array(replay['frames'][i]['board'],dtype=np.uint8) for i in [8,24,45,70]]
        boards += [np.ones((20,10),dtype=np.uint8)]
        cases = []
        for board in boards:
            for piece in range(7):
                env = Tetris(0); env.board = board; env.piece = piece
                c = env.candidates()
                options = []
                if c is not None:
                    response = r.transform(c.features)
                    options = [dict(action=c.actions[i],board=b.tolist(),cleared=int(c.lines[i]),
                                    features=c.features[i].tolist(),response=response[i].tolist(),score=float(response[i] @ policy.weights)) for i,b in enumerate(c.boards)]
                cases.append(dict(board=board.tolist(),piece=NAMES[piece],options=options,selected=policy(c.features) if c is not None else None))
        payload = dict(model=model,shapes={name:[s.tolist() for s in variants] for name,variants in zip(NAMES,ROTATIONS)},cases=cases)
        result = subprocess.run(['node',str(ROOT/'tests/check_versus.cjs')],input=json.dumps(payload),text=True,capture_output=True,timeout=120)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        print(result.stdout.strip())
