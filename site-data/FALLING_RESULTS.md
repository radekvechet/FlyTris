# Falling-rules checkpoint evaluation

Checkpoint after 63 generations and 3.19 hours of training. The planned six-hour run stopped early when Windows denied a checkpoint rename. Its saved best validation weights were frozen, then evaluated separately.

Fresh test mean: **190.8 → 280.1 lines/game** (+46.8% on this test set). Paired mean gain: 89.3 lines, 95% bootstrap interval **-45.0 to 205.7**. The interval includes zero: this small evaluation does not establish a reliable general improvement. Some seeds regress.

24 paired games represent eight independent piece sequences, each repeated at three speeds. The interval resamples seed clusters, not 24 independent games. Tests did not select weights. Games have a three-minute simulated clock; hard drop is allowed. Both baseline and trained weights use the same falling controller.

| Gravity | Before | After |
|---|---:|---:|
| Easy | 192.1 | 280.1 |
| Medium | 192.1 | 280.1 |
| Hard | 188.3 | 280.1 |

Validation mean: 134.7 → 332.3 lines/game. Validation selected the checkpoint and is not an independent test.

The replay uses the first predeclared test seed at medium gravity (7000000), not the highest score. It replays recorded controls through the actual falling engine. The live opponent computes new routes in a browser worker, with both match clocks paused during planning.

Model ID: 4768ce0f1410449416212b0b37a7fe36bb215f0bdbaa8ce2ea57d339e6286888. Evaluated: 2026-09-14T11:29:16.678Z.

The historical placement trial, raw-feature baseline and random baseline are preserved separately in REPORT.md and results.json. They are not directly comparable to this timed falling experiment. The fixed circuit and route planner do not learn; only eight readout weights do.
