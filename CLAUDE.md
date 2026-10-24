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

`index.html` contains a slips / shared-parlay / bet-log system gated behind
`if (!window.claude?.use) return;` (~line 1862). Without that runtime the site renders
normally and those features simply never initialize.

It uses nine collections, but only four need a real backend:

| Collection | Keep? |
|---|---|
| `bets` | yes — bet log |
| `slips` | yes — shared parlays |
| `data/users/<uid>/<id>` | yes — private slips, per user |
| `settings/parlays` | yes — skip list |
| `splits`, `splitshist`, `kalshi`, `ilani`, `propsplits` | no — same data arrives as `site/data/*.json` |

API surface is small: `collection(x).add`, `doc(p).set`, `doc(p).update`, `doc(p).delete`,
plus reads. Identity comes from `user.id()`, `user.canEdit()`, `user.isOwner()`.

Porting means a shim Worker over D1 exposing those methods, with identity from `/__me`
(the session cookie), and replacing the `S.db`/`S.me` initialization. The UI is untouched.

Note the API shape is Firestore's — it was modeled on it. Worth remembering if D1 ever
feels like the wrong fit, though staying on Cloudflare avoids another account.

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
