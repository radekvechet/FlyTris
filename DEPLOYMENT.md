# Vercel + Neon scorebook

Production is hosted at **https://flytris.net** on Vercel with Neon Postgres.
Local development uses SQLite at `.local/leaderboard.sqlite`. Local scores,
credentials and environment files are excluded from Git and public assets.

## Deploy

1. Import this repository into Vercel. Set **Root Directory to `.` (repository root)**,
   not `flytris/web`. Choose framework **Other**,
   Node.js **24.x**, and the supplied `vercel.json`. It sets `npm run build` and the
   `public` output folder. The root `api/scores.js` becomes a Node.js function.
2. Add a **Neon Postgres** database through Vercel's Marketplace and connect it to
   the project. Set its connection string as server-only `DATABASE_URL`. Use
   separate database branches for Production and Preview; never expose the URL in
   browser code or prefix it with a public-environment-variable convention.
3. Redeploy. The build runs the idempotent schemas in `db/001_matches.sql` and `db/002_request_limits.sql` when
   `DATABASE_URL` is present. A migration failure fails the build. Without the
   connection, the page can build but score APIs return an unavailable response and
   games are unranked. There is no ephemeral SQLite fallback on Vercel.

The committed `site-data` snapshot contains the model and measured report inputs.
Vercel needs neither Python, CUDA, nor the full downloaded connectome to serve this
snapshot. For a falling-rules update, run `node scripts/evaluate-falling.cjs`
against the saved training run, then `node scripts/integrate-falling.cjs` against
that evaluation directory. Inspect results and push the changed source/snapshot.
`snapshot.cjs` refuses to overwrite a falling release with a placement model unless
`--legacy` is explicitly supplied. Historical placement measurements stay separate.

If a build says "No Output Directory named public found", check Root Directory
first. The build creates `public/` at repository root. Keep Output Directory as
`public`, Build Command as `npm run build`, and Install Command as `npm install`.
Remove an empty `DATABASE_URL` until Neon is connected; its absence disables
shared scores but does not prevent the static site from building.

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

- Ranked matches use fixed two-minute presets: Easy (800 ms gravity), Medium
  (500 ms), Hard (250 ms), applied to both players. The fly executes trained routes
  in 50 ms control steps. Both simulation clocks wait during worker planning.
  Custom gravity or duration settings are practice.
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
- New sessions explicitly use `rules_version=3` (two-minute falling matches). Old rows remain in the database
  under versions 1 and 2 and are excluded from the new leaderboards and chart totals.
  No destructive migration is needed. The stored model ID includes readout weights,
  graph, controller and rules, so changing weights invalidates stale clients.
  Current charts aggregate models within the same rule version. The trained policy
  and historical three-minute evaluation are unchanged; match duration is enforced
  independently by the versioned server preset. Older open clients must reload.

## Validation and operational limits

The server validates tokens, presets, time bounds, row-clear totals, board block
conservation, and plausible placement counts. Both scores are committed together,
SQL values are parameterized, bodies are limited to 20 KB, and browser
requests must originate from an allowed domain. Database credentials remain server-side.

This is a casual, client-submitted scorebook. It is **not cheat-proof**: a modified
client can still fabricate a plausible game. There is no account verification or
server replay verification. Application rate limits and a short leaderboard cache are enabled. Add the
Vercel edge rule described in [SECURITY.md](SECURITY.md) to reject excess traffic
before function execution. Moderation and replay-based verification can be added
for public competitions. Abandoned session rows can be periodically deleted after
two hours; completed matches are retained for the overall leaderboard.

Local automated tests cover atomic completion, duplicate retries, anonymous names,
renaming authorization, timestamps, every time window, ranking, filters, invalid
scores, and database reopen persistence. The PostgreSQL branch requires an actual
Neon connection for a live integration test; it has not been exercised here.

Official references: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js),
[Vercel configuration](https://vercel.com/docs/project-configuration),
[Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).

See [SECURITY.md](SECURITY.md) for allowed origins, rate limits, credential handling
and the remaining Vercel dashboard setup.
