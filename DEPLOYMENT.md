# Vercel + Neon scorebook

The game is ready for Vercel, but this workspace is **not deployed** and no hosted
database has been provisioned. The current preview uses a persistent local SQLite
database at `.local/leaderboard.sqlite`. This file and all test scores are excluded
from Git, public assets, and the portable ZIP.

## Deploy

1. Import this repository into Vercel. Use the repository root, framework **Other**,
   Node.js **24.x**, and the supplied `vercel.json`. It sets `npm run build` and the
   `public` output folder. The root `api/scores.js` becomes a Node.js function.
2. Add a **Neon Postgres** database through Vercel's Marketplace and connect it to
   the project. Set its connection string as server-only `DATABASE_URL`. Use
   separate database branches for Production and Preview; never expose the URL in
   browser code or prefix it with a public-environment-variable convention.
3. Redeploy. The build runs the idempotent schema in `db/001_matches.sql` when
   `DATABASE_URL` is present. A migration failure fails the build. Without the
   connection, the page can build but score APIs return an unavailable response and
   games are unranked. There is no ephemeral SQLite fallback on Vercel.

The committed `site-data` snapshot contains the model and measured report inputs.
Vercel needs neither Python, CUDA, nor the full downloaded connectome to serve this
snapshot. To update it after local training, regenerate the Python report, run
`node scripts/snapshot.cjs`, inspect the changed snapshot, and deploy it together
with the source. Scientific table formatting is preserved from the Python report.

Useful commands with Node.js 24 and npm installed:

```text
npm install
npm run build
npm run dev
npm run test:server
```

The local server initializes SQLite automatically and serves the game and API on
127.0.0.1:8765. Production uses `@neondatabase/serverless` 1.0.2 over HTTPS.
To run migrations separately with a server environment configured, use
`npm run db:migrate`. Do not put real credentials into `.env.example`.

## Rules and stored data

- Ranked matches use fixed three-minute presets: Easy (800 ms human gravity / 5 s
  fly pace), Medium (500 ms / 3 s), Hard (250 ms / 1.5 s). Other settings are practice.
- A server-created match assigns its seed, preset, model graph ID and start time.
  A private random token authorizes finishing that match and setting its name.
- Finishing updates one row atomically with both players' lines and pieces, winner,
  reason and server completion timestamp. Repeating the submission is idempotent.
  Started but unfinished sessions do not enter rankings or aggregates.
- The display name starts as `anonymous`; blank names remain `anonymous`. Names
  are limited to 30 characters, treated as text, and editable with the match token
  for one hour. Names are not authenticated identities. The token is not returned
  by public leaderboard queries or included in the downloadable match result.
- Public lists show the top 10 human scores for each difficulty, paired with that
  match's fly score, ordered by lines, pieces, then earlier completion time.
- Windows are rolling 24 hours, 7 days, **30 days** (not the previous calendar
  month), and all time. Boundaries use UTC milliseconds; displayed dates use the
  viewer's local timezone. Chart totals cover *all* matching completed games,
  not just the top ten, and can be filtered by difficulty.
- `rules_version=1` isolates this ranked rule set. Increase it when changing ranked
  rules and explicitly decide whether to migrate old rankings. Model graph IDs
  are retained with matches; current charts aggregate all models in the rule set.

## Validation and operational limits

The server validates tokens, presets, time bounds, row-clear totals, board block
conservation, and plausible placement counts. Both scores are committed together,
SQL values are parameterized, bodies are limited to 20 KB, and cross-site browser
submissions are rejected. Database credentials remain server-side.

This is a casual, client-submitted scorebook. It is **not cheat-proof**: a modified
client can still fabricate a plausible game. There is no account verification or
server replay verification. Before opening a popular public competition, add
Vercel Firewall rate limits to the score endpoint, moderation and replay-based
verification as needed. Abandoned session rows can be periodically deleted after
two hours; completed matches are retained for the overall leaderboard.

Local automated tests cover atomic completion, duplicate retries, anonymous names,
renaming authorization, timestamps, every time window, ranking, filters, invalid
scores, and database reopen persistence. The PostgreSQL branch requires an actual
Neon connection for a live integration test; it has not been exercised here.

Official references: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js),
[Vercel configuration](https://vercel.com/docs/project-configuration),
[Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).
