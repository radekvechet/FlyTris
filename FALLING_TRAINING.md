# Training with falling pieces

Run `RUN_OVERNIGHT.cmd` on Windows, or from this directory:

```powershell
.\.venv\Scripts\python.exe -m flytris falling-overnight --hours 6 --workers 4 --out runs/falling_overnight --resume
```

Requires the Python dependencies, Node.js 24, and the existing warm-start
checkpoints in `runs/local/fly_seed*/`. The highest previous validation score
selects the starting model. This run uses the existing 256-neuron fly circuit
on four CPU workers. It does not use the GPU. Different worker counts are allowed
when resuming; physics, seed schedules and other training settings stay fixed.

Training uses a frozen copy of the browser's actual `FallingPlayer` engine:
gravity at 800/500/250 ms per row, 50 ms control steps, left/right collision,
rotation in midair with horizontal kicks, soft drop, and 500 ms landing delay
with at most 15 grounded resets. Explicit hard drop remains an allowed action,
matching the human Shift key, and consumes one control step. Games have the ranked
three-minute simulated time limit. Simulation runs as fast as the CPU allows;
three game minutes do not require three wall-clock minutes.

A bounded planner searches legal timed routes, including slides under overhangs.
The reservoir scores their resulting boards. **Only eight output weights are
trained**; the fly circuit and route planner are fixed. The planner keeps the
earliest route to each piece pose and explores up to 900 states per decision.
It is not an exhaustive search over every timing/lock-reset possibility.

Each generation evaluates 16 weight candidates on a common seed at all three
speeds, then validates its proposed weights on nine fixed games. Training seeds
change each generation. Fitness is lines cleared plus pieces placed / 10000;
lines always dominate the tie-break within the match duration. The best
validation checkpoint is retained. After 12 validations without a gain of at
least one line or 1%, exploration broadens; every third restart explores a new
center. This is a search heuristic, not proof that learning has converged.

The budget includes roughly 5 hours 31 minutes of training/baseline evaluation
and up to 29 minutes reserved for 24 fresh before/after game pairs (eight seeds
at each speed). The process exits once those tests finish, so it may finish
slightly before six hours. Incomplete games are discarded at the deadline.
Only complete pairs appear in the final comparison. Held-out results, rather
than validation alone, tell us whether the change generalizes. Improvement is
not guaranteed; the existing warm start may remain best.

## Progress, pause and resume

The run directory contains:

- `MORNING_REPORT.md`: status, deadline, recent generations and final comparisons.
- `training.log`: timestamped milestones.
- `session.json`: optimizer, random generator and completed game caches.
- `checkpoint.json` and `best-model.json`: best weights found so far.
- `input/`: model, shapes, exact physics/controller code and checked SHA-256 hashes.
- `falling-replay.json`: controls recorded from a final medium-speed test, if completed.
- `process.json`: wrapper and trainer process IDs.

State is saved after every completed game and every 30 seconds. Run
`STOP_TRAINING.cmd` to pause a background run safely, or use Ctrl+C for a foreground
run. The current incomplete games are discarded. Launch `RUN_OVERNIGHT.cmd`
again to resume the remaining budget; stopped time does not count. Completed
runs are not restarted. A fresh experiment needs a different `--out` directory.
Keep the machine powered on. The Python wrapper prevents automatic idle sleep
while training, but cannot prevent shutdown or a manually requested sleep.

These outputs use `falling-v1` and are kept separate from old placement training.
The current dashboard opponent still uses its previous placement controller.
New weights are **not automatically deployed**; they must be integrated with
the falling controller before use in the live game. Existing placement replay
and export commands reject falling checkpoints to avoid mixing the rules.

The earlier two-lane placement experiment remains available with
`python -m flytris overnight`; see `OVERNIGHT.md` for that legacy protocol.

## Checks

```powershell
node --test tests/test_falling.cjs tests/test_falling_training.cjs tests/test_falling_runner.cjs
.\.venv\Scripts\python.exe -m flytris falling-overnight --hours 0.05 --workers 2 --smoke --out runs/my_falling_smoke
```

Tests verify actual route execution, a tuck beneath an overhang that direct
placement cannot reach, deterministic playback, pause/resume including partially
completed validation, and enforcement of the wall-clock budget. Smoke mode uses
short games and two generations to check the pipeline, not to claim improvement.
