# FlyTris measured local experiment

All training replicates improved on held-out game seeds with a positive paired bootstrap interval.

This is a working reward-trained output layer on a small fly-connectome spiking circuit. It is not a demonstration that the complete biological fly brain learned Tetris.

| Training seed | Before: lines/game | After: lines/game | Paired gain [95% bootstrap CI] | Training |
|---|---:|---:|---:|---:|
| 11 | 0.12 | 40.71 | +40.58 [33.33, 48.62] | 1.1 min |
| 22 | 7.46 | 103.83 | +96.38 [86.75, 103.88] | 1.4 min |
| 33 | 0.08 | 68.58 | +68.50 [58.33, 78.50] | 1.3 min |

- Held-out games per model: 24, capped at 300 pieces.
- Raw-feature control, trained with the same search budget: **42.25 lines/game**.
- Random legal placements: **0.04 lines/game**.
- Model: **256 real neurons, 9089 directed weighted edges**, 16 normalized LIF steps per candidate.
- Only **8 output weights** are trained, using reward `lines + 0.02 * pieces`. No teacher or hand-written placement score.
- Internal wiring is fixed. Engineered board features enter as synthetic currents. Candidate states reset independently.
- Total experiment wall time (including controls/evaluations): 5.4 minutes.

## Timing estimates

Measured mean training time for 12 generations: 1.3 minutes per replicate.
At the same population, games and piece cap, 100 generations would take approximately **10.7 minutes** if average game lengths and throughput stayed the same.
Longer-lived policies, larger caps, more evaluations and slower/faster hardware change that estimate. This is a budget estimate, not a prediction of convergence or mastery.

## Evaluation integrity

Training uses separate game seeds from validation and final tests. Validation selects checkpoints. Final test scores never select weights. All replicates share held-out piece sequences for paired comparisons. A positive interval measures improvement conditional on that trained model; it does not establish an advantage of fly topology. The raw-feature control is essential context.

The replay uses the first predeclared held-out game and first training replicate, not the best recorded game. Silencing all reservoir output removes the agent's input. Disconnecting recurrence is an additional intervention; neither intervention substitutes for training a matched shuffled-connectivity control.

| Training seed | Trained fly | Recurrence disconnected | All output silenced |
|---|---:|---:|---:|
| 11 | 40.71 | 48.96 | 0.17 |
| 22 | 103.83 | 101.25 | 0.17 |
| 33 | 68.58 | 72.29 | 0.17 |


Recurrence removal does not consistently reduce performance in these runs. The experiments therefore do **not** show that the fly wiring is necessary for this task. The learned readout can exploit information carried by directly stimulated neurons.

## Limitations

- Simplified placement Tetris: no hold, kicks, tucks or real-time control.
- Eight engineered board features; synthetic input mapping.
- Small extracted subgraph with normalized LIF dynamics; not full biological brain training.
- Only eight output weights learn. Internal fly synapses remain fixed.
- Paired intervals are conditional on each trained model; no proof of fly-topology advantage.
- Fixed-budget timing does not predict time to convergence.
