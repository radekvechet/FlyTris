# FlyTris experiment reference

This document preserves the detailed placement-training protocol and benchmark
commands. For fresh-clone setup and the current training workflow, start with
[README.md](README.md). Falling-rule experiments use [FALLING_TRAINING.md](FALLING_TRAINING.md).

A portable local experiment: a fixed spiking reservoir built from **real FlyWire
v783 connectivity**, with eight output weights trained to play Tetris.

**Falling-rules training:** `RUN_OVERNIGHT.cmd` now starts/resumes a six-hour
budget using the browser's falling physics, midair rotation and legal slides.
See [FALLING_TRAINING.md](FALLING_TRAINING.md) for progress, pause/resume and
evaluation details. The existing dashboard model remains separate until the
new controller and weights are integrated.

This project distinguishes two experiments:

1. **Learning trial:** a small, deterministically extracted fly subgraph with
   normalized LIF dynamics and engineered Tetris inputs. Only the output weights
   learn. This is fast enough for repeated local tests.
2. **Full-brain benchmark:** the pinned Eon/Shiu PyTorch model's unmodified classes
   and parameters, running all neurons on CPU or CUDA. This tests simulation
   throughput, not full-brain Tetris learning.

The learning trial is not a biologically faithful recreation of a fly's learning
mechanism. A strong ordinary Tetris agent may be much easier to train; the included
raw-feature control makes that comparison visible.

## Quick start

Python **3.11** is the tested version. Run from this project directory.

Windows PowerShell:

```powershell
.\setup.ps1
.\.venv\Scripts\python.exe -m flytris experiment --out runs/my_machine
```

If PowerShell does not allow scripts, run their commands directly:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flytris fetch
.\.venv\Scripts\python.exe -m flytris experiment --out runs/my_machine
```

Linux:

```bash
bash setup.sh
.venv/bin/python -m flytris experiment --out runs/my_machine
```

Open `runs/my_machine/report.html` in a browser. It works offline and includes an
animated saved game. `REPORT.md`, `results.json`, per-run `history.jsonl`,
`checkpoint.json`, and `evaluation.json` contain the protocol and measurements.

The report includes a Three.js fly wired to a folding Brick Game handheld.
**Play replay** synchronizes its LCD, leg taps, button presses and wire pulses
with the saved placements. Cleared rows flash, disappear, and trigger a small
head shake. Pause, Next move, seeking, playback speed and drag-to-orbit are
available. Motion illustrates the recorded actions; it is not a biomechanical
simulation. All assets are bundled for offline use. WebGL is needed for the 3D
scene; the 2D replay remains available without it. Paused scenes redraw only when
the camera or viewport changes, and switching tabs pauses playback.

**Play against the fly** opens a full-page versus arena: human board on the left,
the wired 3D fly in the middle, and its live game on the right. The exported
trained reservoir makes fresh decisions locally in a browser worker. Both players
receive the same seeded seven-bag sequence. Most lines wins at the time limit,
then pieces placed; a top-out immediately loses the match. Results include clear
counts, pace settings, elapsed time and an optional JSON download.

The human game has falling pieces, collision-aware movement beneath overhangs,
clockwise/counterclockwise rotation with small horizontal kicks, and a 500 ms
landing delay (at most 15 grounded movement/rotation resets per piece). Choose
250, 500 or 800 ms per gravity row in setup. Held soft drop runs at 50 ms per row;
it does not lock immediately. The fly retains the placement rules on which it was
trained; this is an asymmetric match, not a claim of identical action spaces.

Default controls: A/D or Left/Right move; S/Down soft-drop; W/Up/E/X/Space/Enter
rotate clockwise; Q/Z rotate counterclockwise; Shift hard-drops; P/Escape pauses.
Hold movement for repeat. Edit comma-separated bindings in **Keyboard controls**
before starting; duplicate/conflicting bindings are rejected and hard drop can
be disabled by leaving its field empty. Controls and pace are saved in a first-party
cookie for one year when starting a match. Cookie persistence requires serving
the report over HTTP, such as the local preview; browsers commonly disable cookies
for directly opened files. Playback and local inference otherwise work offline.
Losing window focus or hiding the tab pauses both players and releases held keys.
JavaScript and Python use different float accumulation orders, so numerically
tied fly placements can differ while using the same graph and trained readout.

The dashboard also includes persistent high scores and a human/fly lines-cleared
chart. Easy, Medium and Hard are fixed three-minute ranked presets; custom settings
remain practice. Completed ranked games save both scores, initially as `anonymous`,
and offer a name field afterward. Leaderboards have rolling 24-hour, 7-day, 30-day
and overall windows. See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel + Neon setup and
the local SQLite preview. Game speed changes available moves per match, not the
fly's neural weights, simulation steps or decision inputs.

CPU-only dependencies are enough for training. The first data preparation takes
more time and memory than subsequent starts. Data download is about 105 MB;
prepared sparse caches use additional disk space. The optional CUDA wheel is
about 2.5 GB and its installed environment is much larger.

## The original placement experiment

- Board: 10×20, all seven tetrominoes, shuffled seven-bag generator.
- Actions: legal orientation + column, followed by hard drop. No hold, wall kicks,
  tucks, lateral movement after dropping, or real-time controls. No next-piece input.
- Candidate afterstate inputs: normalized aggregate height, holes, bumpiness,
  maximum height, lines cleared, wells, row transitions and column transitions.
- These eight features drive synthetic currents in the fly-derived neurons.
  Their spike counts and subthreshold activity feed the trainable readout.
  There is **no direct raw-feature bypass** in the fly policy.
- Default reservoir: 256 nodes, all signed directed edges between selected nodes,
  incoming absolute-weight normalization, 16 LIF steps, fixed deterministic encoder.
- The subgraph grows from the most connected node by connection strength. It is
  **not claimed to be an anatomically identified learning circuit**. Node indices
  are saved and map to the original neuron table.
- State resets for each candidate. This is an afterstate scorer, not a persistent
  model of fly memory across the game.
- Cross-entropy optimization trains 8 output weights from episode reward
  `lines + 0.02 * pieces`. No expert demonstrations or programmed placement score.
- Default: 12 generations × 16 candidate policies × 2 training games, plus four
  validation games per generation. Three independent optimizer seeds.
- Training and validation games have a 100-piece cap. Final tests use 24 unseen
  piece sequences with a 300-piece cap. Capped games are flagged, not counted as losses.
- Training seeds, validation seeds and held-out seeds are disjoint. Checkpoint
  selection uses validation only. A paired bootstrap interval compares trained
  and initial policies on the same held-out sequences, separately per replicate.
- Controls: random legal placements, equally budgeted raw-feature training,
  silenced output and disconnected recurrence. A trained shuffled-graph control
  can be run separately; the defaults do not prove a fly-topology advantage.

## Continue or scale training

For the current falling-rules experiment, use `RUN_OVERNIGHT.cmd` after generating
`runs/local`; see [FALLING_TRAINING.md](FALLING_TRAINING.md). The older two-circuit
placement experiment is available explicitly through `python -m flytris overnight`;
see [OVERNIGHT.md](OVERNIGHT.md). The launchers resume interruptions and do not
restart completed sessions.

```powershell
# Continue the first measured model to a fixed total of 100 generations.
# Other configuration values must match its checkpoint.
.\.venv\Scripts\python.exe -m flytris train --out runs/local/fly_seed11 --seed 11 --generations 100 --resume

# A larger circuit; separate run, do not change an existing checkpoint's config.
.\.venv\Scripts\python.exe -m flytris train --out runs/circuit1024 --neurons 1024 --generations 30

# Matched shuffled graph, preserving the graph statistics but remapping its neurons.
.\.venv\Scripts\python.exe -m flytris train --out runs/shuffled11 --mode shuffled --seed 11

# Generate a game trace on a new seed from a saved checkpoint.
.\.venv\Scripts\python.exe -m flytris replay --checkpoint runs/local/fly_seed11/checkpoint.json --seed 91000 --out runs/new_replay.json
```

Checkpoints include optimizer distribution, RNG state, initial/best weights,
configuration, graph identity, generation, and elapsed training time. Copies can
resume on another machine; floating-point differences across platforms may affect
ties. If you extend a run, its previous experiment report remains a historical
snapshot until you explicitly run the experiment/evaluation again. Keep a copy of
the original report before extending its training checkpoints.

The software has no guaranteed time-to-mastery. Estimate the cost of a fixed
generation/placement budget, then use validation learning curves to decide whether
additional training helps. Time increases when policies survive longer, unless all
episodes already reach the piece cap.

## Benchmark your machine

```powershell
.\.venv\Scripts\python.exe -m flytris benchmark --out runs/benchmark.json
```

This measures 34-candidate CPU reservoir batches at 256, 1024, 4096 and all 138,639
nodes. It warms each configuration and repeats it three times. It does not train
the larger models. CPU is the default. After installing `requirements-gpu.txt`,
add `--device cuda` to `benchmark`, `train`, `experiment` or `replay` to use the GPU
for the normalized reservoir. Small circuits can be slower on GPU because of
kernel-launch overhead; measure before choosing. The ordinary raw-feature control
always runs on CPU.

To benchmark the original full spiking model on NVIDIA CUDA:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-gpu.txt
.\.venv\Scripts\python.exe -m flytris benchmark --device cuda --out runs/benchmark_gpu.json
.\.venv\Scripts\python.exe -m flytris benchmark-upstream --out runs/upstream_gpu.json
```

Use `--device cpu` explicitly for a CPU comparison. The benchmark uses 100 ms of
biological time per trial, 0.1 ms steps, three trials, and synthetic stimulation.
CUDA timings synchronize the device; loading is excluded. Reported torch VRAM is
allocated/reserved process memory, not the entire GPU's use. Brain simulation time
alone is not end-to-end training time. The two reservoir models have different
dynamics and timings must not be treated as interchangeable.

## Share with friends

```powershell
.\.venv\Scripts\python.exe -m flytris pack --out dist/flytris.zip --run runs/local
# Optional self-contained data bundle (still requires installing Python packages):
.\.venv\Scripts\python.exe -m flytris pack --out dist/flytris-with-data.zip --include-data --run runs/local
```

The archive includes source, setup scripts, pinned upstream source/license,
checkpoints and results. It excludes the virtual environment and downloaded CUDA
wheel. Friends can extract it, run setup, benchmark into a new output name, and
send their JSON results back. They can copy a checkpoint directory and use
`train --resume` to continue it. Run training seeds on separate machines if desired;
distributed training of one model is not implemented.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
# Replay integration checks (Node.js 24; generate runs/local first):
node --test tests/test_replay.cjs
node --test tests/test_falling.cjs
```

Tests cover bag generation, legal orientations, four-line clears, holes, game over,
block conservation, deterministic replay, exact subgraph provenance, neural
input/recurrence effects and absence of a raw-input bypass. Successful simulation
tests alone are not evidence of learning; inspect held-out evaluations.

See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE) for source licensing, and
[DATA_NOTICE.md](site-data/DATA_NOTICE.md) for the separate connectome data terms.
`data/source.json` pins the original commit and file hashes.
