// Document store for slips, bets and settings.
//
// The front end speaks a Firestore-shaped API, so documents are addressed by
// path and `coll` is the path minus its last segment. Four collections live
// here; everything else the UI reads (splits, kalshi, ilani) arrives as JSON
// from the collectors and never touches this.

const SHARED = ['slips', 'bets', 'settings'];

const collOf = path => {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
};

// What a given person is allowed to see: the shared collections, plus their
// own private slips and nobody else's.
const readable = me => SHARED.concat(['data/users/' + me]);

function mayWrite(coll, me) {
  if (coll === 'data/users/' + me) return true;
  if (coll.startsWith('data/users/')) return false;   // someone else's drawer
  return SHARED.indexOf(coll) >= 0;
}

const put = (env, path, coll, data, now) => env.DB.prepare(
  'INSERT INTO docs (path, coll, data, updated) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated'
).bind(path, coll, JSON.stringify(data), now).run();

// Everything this person can see, plus a revision string so the client can
// skip the payload when nothing has changed.
export async function sync(env, me, clientRev) {
  const colls = readable(me);
  const marks = colls.map(() => '?').join(',');
  const rs = await env.DB.prepare(
    `SELECT path, coll, data, updated FROM docs WHERE coll IN (${marks}) ORDER BY coll, path`
  ).bind(...colls).all();

  const rows = rs.results || [];
  let newest = 0;
  for (const r of rows) if (r.updated > newest) newest = r.updated;
  const rev = rows.length + ':' + newest;
  if (clientRev && clientRev === rev) return { rev, unchanged: true };

  const out = {};
  for (const c of colls) out[c] = [];
  for (const r of rows) {
    let data = {};
    try { data = JSON.parse(r.data); } catch {}
    (out[r.coll] || (out[r.coll] = [])).push({ id: r.path.slice(r.coll.length + 1), data });
  }
  return { rev, collections: out };
}

export async function write(env, me, isOwner, body) {
  const op = body && body.op;
  const now = Date.now();

  if (op === 'add') {
    const coll = String(body.path || '');
    if (!mayWrite(coll, me)) return { error: 'forbidden' };
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const data = Object.assign({}, body.data || {});
    if (coll === 'bets') data.by = me;      // a bet is always logged by you
    await put(env, coll + '/' + id, coll, data, now);
    return { ok: true, id };
  }

  const path = String((body && body.path) || '');
  if (!path || path.indexOf('/') < 0) return { error: 'bad path' };
  const coll = collOf(path);
  if (!mayWrite(coll, me)) return { error: 'forbidden' };
  // The skip list is a shared setting; the UI only offers it to the owner.
  if (coll === 'settings' && !isOwner) return { error: 'forbidden' };

  if (op === 'delete') {
    if (coll === 'bets' && !isOwner) {
      const cur = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(path).first();
      if (cur) {
        let d = {};
        try { d = JSON.parse(cur.data); } catch {}
        if (d.by && d.by !== me) return { error: 'forbidden' };
      }
    }
    await env.DB.prepare('DELETE FROM docs WHERE path = ?').bind(path).run();
    return { ok: true };
  }

  if (op === 'set') {
    await put(env, path, coll, body.data || {}, now);
    return { ok: true };
  }

  if (op === 'update') {
    const cur = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(path).first();
    let d = {};
    if (cur) { try { d = JSON.parse(cur.data); } catch {} }
    await put(env, path, coll, Object.assign(d, body.data || {}), now);
    return { ok: true };
  }

  return { error: 'bad op' };
}
