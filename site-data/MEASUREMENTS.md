# Measured hardware and scaling

CPU: Intel64 Family 6 Model 158 Stepping 12, GenuineIntel; RAM: 31.92 GiB. GPU: NVIDIA GeForce GTX 1660, 6144 MiB, 4062 MiB, 610.47. OS: Windows-10-10.0.26100-SP0. Python: 3.11.0.

## Learning evidence

The complete experiment took 5.44 minutes. The 12-generation training runs took 65.6 seconds, 84.8 seconds, 80.8 seconds.

3 of 3 runs had positive paired improvement intervals on 24 held-out games. Internal synapses were fixed; eight output weights learned.

The recurrence-disconnection control did not consistently impair performance. These results demonstrate a working learning pipeline, not a necessary contribution of fly topology.

## Normalized reservoir throughput

Median of three timed repeats after warmup. Each measurement scores 34 synthetic candidate afterstates using 16 normalized LIF steps. Candidate-to-host transfer is included for CUDA.

| Neurons | Directed edges | CPU seconds / decision | GPU seconds / decision | GPU time / 100,000 such decisions |
|---:|---:|---:|---:|---:|
| 256 | 9,089 | 0.0016 | 0.0059 | 0.17 hours |
| 1,024 | 97,039 | 0.0151 | 0.0059 | 0.16 hours |
| 4,096 | 625,409 | 0.1198 | 0.0282 | 0.78 hours |
| 138,639 | 15,091,983 | 8.8289 | 5.7874 | 160.76 hours |

The 100,000-decision column is an arithmetic compute-budget scenario, not a training-convergence estimate. Actual tetrominoes have different candidate counts; environment work, validation, and setup add time. Hardware was also driving the desktop. Larger models were benchmarked, not trained or evaluated for playing quality.

GPU memory allocated by torch for the full normalized reservoir peaked at 0.347 GiB. This excludes CUDA context, the desktop and other applications. Memory fit is not the main bottleneck in this forward-only experiment.

## Canonical full-brain model

- Batch 1: 100 ms of biological time took **1.787 seconds** (median of 3 repeats); torch peak allocated VRAM 0.199 GiB.
- Batch 34: 20 ms of biological time took **80.595 seconds** (median of 3 repeats); torch peak allocated VRAM 1.104 GiB.

These execute the pinned original model classes and constants: 138,639 neurons, 15,091,983 nonzero directed edges, 0.1 ms integration step. Stimulation is synthetic. They demonstrate forward simulation only, not Tetris learning. The normalized reservoir and canonical model have different dynamics; their times cannot be substituted for one another.

## Practical next run

Stay with the reduced model to refine the experiment. At the original caps/budget, 100 generations extrapolate to 9.1–11.8 minutes per 256-neuron training run if throughput and game lengths remain comparable. Longer episodes and changed caps can increase that.

A 1,024- or 4,096-neuron circuit with CUDA is a more practical next scale than the entire graph. Verify learning again at each scale. Full-network timings indicate that batching/kernel work is worth investigating before simply purchasing or borrowing faster hardware.

For friends, install the portable bundle, benchmark their actual machine, and resume a copied checkpoint or run a separate optimizer seed. The implementation is single-machine; it does not combine several friends’ GPUs into one distributed learner.

## Verification

Unit/integration checks cover Tetris physics, subgraph provenance, recurrence/input effects, checkpoint resume, and CPU/CUDA parity. The saved replay was also checked in a browser: playback, seeking and score updates work.

Raw measurements: `benchmark.json`, `benchmark_gpu.json`, `upstream_gpu.json`, `upstream_gpu_batch34.json`, plus the experiment’s `results.json` and per-replicate evaluations.
