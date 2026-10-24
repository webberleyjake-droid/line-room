-- Slips, bets and settings for Line Room.
--
-- The front end speaks a Firestore-shaped API (doc paths and collections), so
-- rather than fight that, one table stores documents by path. `coll` is the
-- path minus its last segment, which is what collection reads filter on.
--
--   slips/<id>               a shared parlay
--   data/users/<name>/<id>   someone's private slip
--   bets/<id>                a logged bet
--   settings/parlays         the skip list

CREATE TABLE IF NOT EXISTS docs (
  path    TEXT PRIMARY KEY,
  coll    TEXT NOT NULL,
  data    TEXT NOT NULL,
  updated INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS docs_coll ON docs(coll);
