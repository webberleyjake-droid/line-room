# Line Room

NFL betting trends, public splits, Kalshi + ilani odds. Python collectors feed JSON into
`site/data/`; `site/index.html` is a single-file front end that reads those JSON files.

## Where things run

- **Collection**: five GitHub Actions workflows (`.github/workflows/`) run the Python
  scrapers on schedule and commit their output via `commit.sh`, which copies results aside,
  rebases onto newest `main`, and retries — safe when two workflows push at once.
- **Front end**: `site/` is a fully static site. `index.html` fetches `data/*.json` with
  relative paths. Serving the folder is the whole deployment; there is no build step.
- **Destination**: a Cloudflare Worker (`wrangler.jsonc`) serving `site/` as static
  assets, git-connected so every workflow push redeploys. Domain: `lines.empirehq.win`.
- **Auth**: `src/index.js` checks a signed session cookie before serving anything and
  bounces to `empirehq.win` to log in if there isn't one. `run_worker_first: true` is
  load-bearing — without it Cloudflare serves `site/data/*.json` before the Worker runs
  and the data is public. `/__me` returns the current user as JSON.

## The database layer

Slips, the bet log and settings live in **D1** (`schema.sql`, one `docs` table keyed by
path). `src/db.js` serves them; `site/index.html` talks to it through a small shim near
the bottom of its script.

| Collection | Where it lives |
|---|---|
| `slips` | D1 — shared parlays, any member may edit |
| `data/users/<name>/<id>` | D1 — private slips, only that person can read or write |
| `bets` | D1 — bet log; `by` is stamped server-side, only the owner deletes others' |
| `settings/parlays` | D1 — skip list, owner only |
| `splits`, `kalshi`, `ilani`, `propsplits` | `site/data/*.json`, straight from the collectors |
| `splitshist` | `site/data/splitshist.json`, written by `splitshist.py` |

The front end's API is Firestore-shaped because it was modeled on it. Rather than rewrite
~1,500 lines of UI, the shim reimplements just what's used: `collection(c).add/onSnapshot`
and `doc(p).set/update/delete`.

**`onSnapshot` is a poll, not a subscription.** `GET /__db/sync` returns everything you may
see plus a revision string (`count:newestTimestamp`); the client re-polls every 5 seconds,
and 350ms after any write, firing callbacks only when the revision changes. For a handful
of people watching slips this is indistinguishable from realtime and needs no Durable
Objects. If it ever needs to be genuinely live, that's the thing to reach for.

Identity comes from `/__me`, which returns `{name, owner}` off the session cookie. `OWNER`
is a plain var in `wrangler.jsonc` and must match a name registered via `passphrase.js`.

## Gotchas

- **The repo must stay public.** Crons fire ~3,850×/month and GitHub rounds each job up to
  a full minute. Public repos get unlimited Actions minutes; private gets 2,000.
- **`GITHUB_TOKEN` needs write permission** or every `commit.sh` push fails. New repos
  default to read-only: `gh api -X PUT repos/<r>/actions/permissions/workflow
  -f default_workflow_permissions=write`.
- **`site/data/propsplits.json` does not exist** and nothing generates it. The fetch is
  guarded by `try/catch` + `if (r.ok)`, so the 404 is harmless. Vestigial.
- **`sync_site.py` only serves the Claude-artifact copy** — it builds batched,
  version-locked writes of the odds collections. It is dead once the artifact is retired,
  and not before.
- `actions/checkout@v4` and `setup-python@v5` are on deprecated Node 20.

## History

Migrated 2026-10-24 from `VDevelopments-W/line-room` (read-only, unadministrable) to
`webberleyjake-droid/line-room` with full history. The old repo still runs its own crons
into itself and cannot be disabled from here; it is divergent and irrelevant.
