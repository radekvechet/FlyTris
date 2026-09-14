# Legacy placement-rules overnight experiment

This page describes the earlier placement-only experiment. For the current
falling-rules trainer, use `RUN_OVERNIGHT.cmd` and see [FALLING_TRAINING.md](FALLING_TRAINING.md).

To explicitly run the legacy experiment, run this from the project folder:

```powershell
.\.venv\Scripts\python.exe -m flytris overnight --hours 6 --out runs/overnight --resume
```

The launcher resumes an interrupted session automatically. A completed session
does not start again; choose a new `--out` to create a fresh experiment.

## What happens

| Phase | Maximum budget | Purpose |
|---|---:|---|
| 256-neuron circuit on CPU | 2½ hours | Improve the existing readout on longer games |
| 1,024-neuron circuit on CUDA | 2½ hours | Test a larger circuit with transferred starting weights |
| Fresh paired evaluation | Remaining time, at least approximately 1 hour | Compare each retained policy with its own starting policy |

The phases run sequentially. A phase can finish early. Its unused time is not
automatically spent on another search. The process stops once testing completes;
six hours is a maximum active-time budget, not a minimum runtime.

Both searches start from the earlier checkpoint with the best **validation** score.
That checkpoint remains unchanged. Transfer to the larger circuit is an
initialization experiment, not a continuation of the same neural network.

- 16 candidate policies per generation, each tested on 4 rotating training seeds.
- Training games allow **1,000 pieces**, versus 100 in the first experiment.
- Selection uses 8 fixed validation games with a **2,000-piece** cap.
- Final evaluation uses 24 fresh seeds, each tested with the starting and retained
  policy, with a **5,000-piece** cap. Test scores never select weights.
- The baseline on the larger circuit uses the same transferred starting weights
  through that circuit. This permits a valid within-circuit before/after comparison.
- Both circuits still train only **eight output weights**. Their internal synapses
  remain fixed. More neurons do not automatically mean greater learning capacity.

## Diminishing returns

In the earlier short trials, seed 33 achieved its best validation result at
generation 3. Seed 22 gained little after generations 9–10. That suggests early
plateaus under the original configuration; it does not locate a universal limit.
The original 100-piece training cap also made many games too easy.

The overnight runner defines a meaningful validation improvement as at least
**2 fitness points or 1%**, whichever is larger, above the last meaningful gain.
Fitness is `cleared lines + 0.02 × pieces placed`.

After **8 generations** without that improvement, it broadens the search around
the best retained policy. It permits **2 such restarts**. If a further plateau
occurs, that circuit stops early. Small cumulative improvements can still reset
the counter. The best validation weights are retained even when later proposals
perform worse.

This rule saves compute; it is not statistical proof that learning is finished.
Look at the final fresh games, variation between games, and how many games hit
their cap. A high cap-hit rate suggests that longer evaluation is needed.
Six hours may improve this model, but cannot overcome limits of its eight-weight
readout, engineered features or simplified game rules by itself.

## Checkpoints, interruption and the morning result

- `runs/overnight/session.json`: saved after every completed game; includes
  candidates, RNG state, pending generation, validation history and test pairs.
- `runs/overnight/<circuit>/checkpoint.json`: latest retained output weights,
  compatible with the existing `replay` command.
- `runs/overnight/MORNING_REPORT.md`: progress/final summary, before/after scores,
  plateau decisions and completed evaluation counts. It refreshes approximately
  every 30 seconds when a game finishes, and at phase boundaries or interruption.

Ctrl+C pauses and saves. Resume with the same command. An interrupted game is
replayed from its original seed; its partial score is never used. Idle time
between invocations does not consume the remaining six-hour active-time budget.
The deadline is checked between moves; a running move plus startup/export can add
a little overhead. A lock prevents two processes from writing the same session.

On Windows the runner temporarily inhibits automatic idle sleep while working;
normal sleep behavior is restored when it exits. You may turn the display off.
Manual sleep, shutdown or forcibly terminating the process can still interrupt it.

If time runs out during final tests, incomplete games are discarded, completed
pairs are retained, and the report marks incomplete coverage. Do not interpret a
small or deadline-truncated sample as conclusive evidence of improvement.

Development smoke test (short horizons, **not** an overnight learning result):

```powershell
.\.venv\Scripts\python.exe -m flytris overnight --hours 0.02 --smoke --out runs/overnight_smoke
```
