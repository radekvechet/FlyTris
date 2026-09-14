# Security and abuse protection

## Database credentials

`DATABASE_URL` is read only by Node server code and build-time migrations.
The static browser bundle contains the model, replay and interface, with no
server environment injection. The build fails if public files contain the actual
connection string or a PostgreSQL credential URL. `.env*` files are ignored except
for the credential-free `.env.example`. Never commit connection strings or put
them in public variables, HTML, browser JavaScript, logs or screenshots.

Neon errors return a generic unavailable message. Match tokens are random
capabilities; only token hashes are stored. SQL values are parameterized and
player names render as text. The scorebook validates plausible results but is
not cheat-proof: client-supplied results are not replay-verified on the server.

## Application controls

- API Host and browser Origin must use `https://flytris.net`, HTTPS subdomains
  of `flytris.net`, or HTTP/HTTPS `localhost`, `127.0.0.1` or `[::1]` (local ports
  allowed). Production hosts use the default HTTPS port. Bare `*.vercel.app`
  previews cannot use scores; their game can still run unranked. Serve previews
  on an approved subdomain if ranked access is needed.
- GET may use a valid Referer when browsers omit Origin. POST requires Origin.
  Missing/null origins and unrelated domains fail before database access.
  CORS reflects the exact allowed origin and permits only GET/POST and JSON.
  No cross-origin credentials/cookies are needed. Local development is explicitly
  trusted, so scripts served locally can call the production score endpoint.
- Application limits: 60 API requests per minute per IP, plus 600 per minute
  per warm function instance. Memory limits reset on a cold start and are not
  global across Vercel instances. Expired IP entries are discarded.
- Neon-backed atomic limits: 6 match starts and 20 finish/name-update attempts
  per IP per minute (finish and rename share the latter budget). These persist
  across instances. Fixed windows can allow a burst at a minute boundary.
  Vercel's overwritten forwarding header identifies IPs on Vercel; local
  development ignores forwarding headers and uses the socket peer. The database
  stores keyed hashes of IPs, not raw IP addresses. Expired limit entries are
  removed opportunistically, at most once an hour per warm instance, after a day.
  This does not control Vercel's own platform log retention.
- All 16 validated leaderboard queries are cached/coalesced for 15 seconds per
  warm function instance. New scores or names may take 15 seconds to appear.
  This reduces database queries; it does not eliminate edge/function requests.
- JSON submissions are limited to 20 KB, including UTF-8 byte size; malformed,
  oversized, compressed or unsupported requests are rejected. Rate limits return
  HTTP 429 and `Retry-After: 60`.
- Static pages authorize their exact inline scripts with CSP hashes, allow the
  local fly worker, and restrict network connections to their own origin.
  Frame embedding, plugins, MIME sniffing and unused sensitive browser features
  are disabled. Inline CSS remains allowed for the existing animated UI.

Origin/CORS checks restrict browsers, not arbitrary programs: bots can forge
Origin and Referer headers. Distributed traffic can evade per-IP limits. App
checks still invoke a function; they are not a substitute for edge protection.
People behind one shared IP share limits; adjust them if legitimate use is blocked.

## Vercel dashboard setup (not configured by this code)

Vercel provides automatic DDoS mitigation on all plans. Add a dedicated edge
rate-limit rule to stop API floods before function execution:

1. Open the FlyTris project, **Firewall → Configure → New Rule**.
2. Name: `FlyTris score API`. Condition: **Request Path equals `/api/scores`**.
3. Action: **Rate Limit**, fixed window **60 seconds**, **60 requests**, key **IP**.
4. Exceeded-limit action: **Default (429)**. Save, review and publish the rule.

Review any pricing notice before enabling. Vercel counters are regional, not a
single worldwide counter. Monitor blocked traffic and adjust for shared networks.
During an active attack, enable **Attack Challenge Mode** and inspect Firewall
traffic. Configure usage/budget alerts in the Vercel and Neon dashboards. These
operational settings require access to the hosting accounts and are not applied
by pushing this repository. No system can guarantee immunity from DDoS.

Official references:
- [Vercel DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Trusted forwarding headers](https://vercel.com/docs/headers/request-headers#x-forwarded-for)

## Verification

`npm run test:server` exercises origin/host boundaries, preflight, spoofed local
forwarding headers, rate-limit resets and shared atomic counters, body sizes,
caching, safe errors, two-minute scoring, historical leaderboard isolation and
static secret/CSP checks. SQLite runs the migration and SQL tests locally; Neon
uses the same parameterized queries through its serverless driver. Do not load
test the production site without a separate, agreed test plan.
