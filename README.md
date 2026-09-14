# FlyTris

A playable Tetris experiment with a fly-derived spiking circuit, a Three.js fly
at the controls, human-versus-fly matches, and reproducible local training.

The default model contains **256 neurons, 9,089 directed connections and eight
trainable output weights**. Connectivity comes from FlyWire v783. The circuit
is fixed; training adjusts the output weights that score possible board states.
This is a small engineered learning experiment, not a complete fly brain learning
Tetris or a biologically faithful model of fly learning.

**Code: GPL-2.0-or-later. Connectome data: separate CC BY-NC 4.0 terms.**
See [Licensing](#licensing) before reusing the bundled model.

## Play locally

Install **Node.js 24.x** and npm, then run these commands in the cloned repository:

```sh
npm install
npm run build
npm run dev
```

Open [localhost:8765](http://127.0.0.1:8765). The included `site-data/` snapshot
provides a trained model and recorded experiment; playing requires no Python,
GPU, full connectome download or new training. Local scores use SQLite in
`.local/leaderboard.sqlite`, which is excluded from Git.

- Play a recorded game with a fly/handheld animation synchronized to decisions
  and line clears, or open the human-versus-fly arena.
- Human pieces fall in ticks, with midair rotation, slides beneath overhangs,
  soft drop and a 500 ms landing delay.
- Default controls: A/D or arrows to move; S/Down to soft-drop; W/Up/E/X/Space/Enter
  to rotate clockwise; Q/Z counterclockwise; Shift to hard-drop; P/Escape to pause.
  Edit bindings before a match; preferences are saved in a browser cookie.
- Easy, Medium and Hard ranked matches last three minutes. Leaderboards show
  human and fly scores over 24 hours, seven days, 30 days and all time.

**Current opponent:** the site uses the saved falling-rules checkpoint after 63
generations. It moves and rotates through the same falling engine as the human,
with a control every 50 ms; both clocks pause while its worker plans. Ranked
presets use equal gravity for both sides.

The planned six-hour training run stopped at 3.19 hours on a Windows file lock.
A separate fresh evaluation measured **190.8 → 280.1 lines/game** over 24 paired
games (eight independent sequences, three speeds). The 95% paired interval
includes zero and some sequences regress. See [evaluation details](site-data/FALLING_RESULTS.md).
The main replay uses recorded controls from this evaluated checkpoint.

## Train locally

Python **3.11** is the tested version. The initial data download is about 105 MB;
prepared caches and installed dependencies require additional space. The small
training model runs on CPU. CUDA is optional for separate Python experiments.

Windows PowerShell:

```powershell
.\setup.ps1
.\.venv\Scripts\python.exe -m flytris experiment --out runs/local
```

If script execution is disabled, run the setup commands directly:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flytris fetch
.\.venv\Scripts\python.exe -m flytris experiment --out runs/local
```

Linux/macOS shell (Python 3.11 and Node.js 24 must already be installed):

```sh
bash setup.sh
.venv/bin/python -m flytris experiment --out runs/local
```

The initial experiment trains three placement-policy replicates and compares
trained/initial policies on held-out game sequences. Open `runs/local/report.html`
for the results. Detailed protocol, controls and scaling commands are in
[EXPERIMENTS.md](EXPERIMENTS.md).

### Six-hour falling-rules run

First generate `runs/local` as above: a fresh clone does not contain private run
checkpoints. Then double-click `RUN_OVERNIGHT.cmd` on Windows, or run:

```powershell
.\.venv\Scripts\python.exe -m flytris falling-overnight --hours 6 --workers 4 --out runs/falling_overnight --resume
```

On Linux/macOS, use `.venv/bin/python` with the same arguments.

This uses the actual browser falling physics at all three gravity speeds.
A fixed planner finds legal routes, including rotations and tucks, and the fly
readout learns to score the resulting boards. It can also use explicit hard drop.
Four CPU workers run simulated games faster than real time; the six-hour budget
includes final before/after tests and may finish early once evaluation completes.

Progress and results are in `runs/falling_overnight/MORNING_REPORT.md`.
`STOP_TRAINING.cmd` pauses the Windows run; starting the launcher again resumes
its remaining budget. On any platform, create a `STOP` file in the run directory.
Future checkpoints do not automatically replace the released model.
See [FALLING_TRAINING.md](FALLING_TRAINING.md) for the full protocol and limitations.

## Deploy

The web app supports Vercel with Neon Postgres for shared scores. Python training
continues on a local machine or compute host. See [DEPLOYMENT.md](DEPLOYMENT.md).
Set `DATABASE_URL` in the hosting environment; `.env.example` contains only a
placeholder. The scorebook is intended for casual play and does not verify full
replays on the server.

## Repository layout

| Path | Purpose |
|---|---|
| `flytris/` | Python training, graph extraction, benchmarks and reports |
| `flytris/web/` | Browser game, procedural animation and falling physics/controller |
| `scripts/` | Site builds, local server, training workers and orchestration |
| `api/`, `server/`, `db/` | Score API, storage adapters and database schema |
| `site-data/` | Small public model/report snapshot used by the web build |
| `tests/` | Physics, training, replay and scorebook checks |
| `data/source.json` | Pinned upstream URLs and SHA-256 provenance |
| `runs/`, `.local/`, `public/` | Generated local files; excluded from Git |

## Verification

These checks use the included snapshot and Node.js 24:

```sh
node --test tests/test_falling.cjs tests/test_falling_training.cjs tests/test_falling_runner.cjs
npm run test:server
```

After Python setup and generating `runs/local`, also run:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node --test tests/test_replay.cjs
```

Physics tests and a successful training run establish that the implementation
runs. Learning claims require held-out comparisons; validation improvements alone
are insufficient. Historical placement measurements and the newer falling-rule evaluation are
reported separately.

## Publishing on GitLab or GitHub

Create an empty remote project, then push this source directory using the
instructions shown by your Git host. Keep the existing `LICENSE`, README and
notices rather than generating conflicting replacements on the host.

The `.gitignore` excludes environments, downloaded datasets/upstream code,
training runs, local scores, generated sites, archives and environment secrets.
It deliberately keeps `site-data/`, `data/source.json`, `.env.example` and package
lockfiles. Review `git status --short` before your first commit. It cannot remove
secrets that were already committed to history.

Friends can reproduce training from source. To transfer an active run, pause it
and share its run directory separately, including frozen inputs and state; see
[FALLING_TRAINING.md](FALLING_TRAINING.md). Do not commit multi-gigabyte caches.

## Licensing

FlyTris original source code is **GNU GPL version 2 or later**, SPDX
`GPL-2.0-or-later`. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
This matches the [pinned Eon fly-brain licensing statement](https://github.com/eonsystemspbc/fly-brain/blob/a3db62f9436074e485c0278290c2164ed6150808/README.md#license).
Retain notices and provide corresponding source when GPL distribution requires it.

The bundled Three.js library retains its MIT licence. FlyWire connectivity and
its exported subgraph retain separate **CC BY-NC 4.0** data terms, including the
noncommercial restriction; the code licence does not override these. See
[DATA_NOTICE.md](site-data/DATA_NOTICE.md) for attribution, transformations and
licence links. The repository contains open-source code alongside separately
licensed data; it does not grant unrestricted commercial use of that data.
