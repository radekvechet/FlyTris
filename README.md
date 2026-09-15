# FlyTris

A playable Tetris experiment with a fly-derived spiking circuit, a Three.js fly
at the controls, human-versus-fly matches, a Next.js server-rendered site, and reproducible local training.

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
  Add keys by pressing them in the capture popup, or click keycaps to remove them.
  Keys move automatically from their previous function. Every function needs a key;
  edits save immediately in a browser cookie, including incomplete sets.
- Easy, Medium and Hard ranked matches last two minutes. Leaderboards show
  human and fly scores over 24 hours, seven days, 30 days and all time.

**Current opponent:** the site uses the saved falling-rules checkpoint after 63
generations. It moves and rotates through the same falling engine as the human,
with a control every 800 ms on Easy, 500 ms on Medium and 360 ms on Hard.
The whole fly simulation slows with its control tick, including gravity and
landing delay; human timing stays unchanged. Ranked games use one of nine
precomputed fly runs and server verification every ten seconds; the server
calculates both scores. Practice runs fresh inference in a browser worker.
Current leaderboards use rules version 9; older scores are preserved separately.
See [SECURITY.md](SECURITY.md) for the limits of anti-cheat verification.

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
placeholder. Ranked games submit input batches every ten simulated seconds;
the server replays both boards and derives the final scores. This verifies legal
gameplay and timing, but cannot prove a human supplied the controls.

With `DATABASE_URL` configured, the build automatically runs the idempotent
schema files in order: [matches](db/001_matches.sql),
[request limits](db/002_request_limits.sql), and [checkpoints](db/003_checkpoints.sql).
They can also be run manually in Neon's SQL Editor in that order. These scripts
create missing tables and indexes; they do not alter existing columns or erase
test data. Future changes to existing tables need explicit migrations.

The application currently stores keyed IP hashes for rate limiting, not raw IP
addresses or an IP history attached to matches. Raw-IP storage, a separate
`IP_HASH_SECRET`, and automatic 30-day cleanup are proposed improvements and are
not implemented. See [SECURITY.md](SECURITY.md) for current protections and the
Vercel firewall configuration that must be applied separately.

Optional Neon agent skills can be installed with
`npx neon@latest skills -s neon -s neon-postgres -y`. Installing the skills does
not authenticate the CLI or grant database access. They are not needed to run
the app or deploy with a server-side `DATABASE_URL`.

## Difficulty configuration

Edit [`game-config.json`](game-config.json) to change the default difficulty,
ranked presets and rules version. Browser settings, server verification and
recording generation all read this file.

| Setting | Meaning |
|---|---|
| `gravityMs` | Human milliseconds per falling row |
| `flyMs` | Fly gravity in the original simulation |
| `flyControlMs` | Real milliseconds per trained 50 ms fly step |
| `durationMs` | Ranked match duration in milliseconds |

Gravity and match duration use positive multiples of 50 ms. Fly control intervals
accept any whole number from 50 to 1,000 ms. Gravity is limited to 5,000 ms and
ranked duration to 120,000 ms; the match may finish between fly actions. For example, a 350 ms fly tick works
with a 120,000 ms match; only complete fly ticks are played. Actions are dispatched on the next 50 ms
simulation boundary (up to 49 ms later), identically in the browser and server. Effective fly gravity is `flyMs * flyControlMs / 50`.
Increase `rulesVersion` when changing defaults so earlier scores remain separate.
`npm run dev` and `npm run build` regenerate stale ranked recordings automatically;
commit the updated `site-data/ranked-pool.json` with your configuration. No new
training or database schema migration is needed for these timing changes.

Only exact default settings qualify for ranking. Custom settings are practice.
After saving a name, the name form disappears and shows the match's position
in that difficulty's last-24-hours scoreboard, including positions below the top
ten. The server orders by lines, pieces, completion time and match ID. Position
is calculated when the name is saved and may change as other people play.

## Repository layout

| Path | Purpose |
|---|---|
| `flytris/` | Python training, graph extraction, benchmarks and reports |
| `flytris/web/` | Browser game, procedural animation and falling physics/controller |
| `game-config.json` | Shared difficulty defaults and ranked rules version |
| `app/` | Next.js server-rendered pages, metadata and score API route |
| `scripts/` | Site builds, training workers and orchestration |
| `server/`, `db/` | Ranked verification, storage adapters and database schema |
| `site-data/` | Small public model/report snapshot used by the web build |
| `tests/` | Physics, training, replay and scorebook checks |
| `data/source.json` | Pinned upstream URLs and SHA-256 provenance |
| `runs/`, `.local/`, `public/`, `.generated/`, `.next/` | Generated local files; excluded from Git |

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
