import { session } from './auth.js';
import { sync, write } from './db.js';

const HUB = 'https://empirehq.win';

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const who = await session(request, env);

    if (!who) {
      // API calls get a clean 401 rather than a redirect into HTML; the page
      // reloads itself and picks up the login properly.
      if (url.pathname.startsWith('/__')) return json({ error: 'unauthenticated' }, 401);
      const next = encodeURIComponent(url.toString());
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${HUB}/?next=${next}`, 'Cache-Control': 'no-store' }
      });
    }

    const me = who.n;
    const isOwner = !!env.OWNER && me === env.OWNER;

    if (url.pathname === '/__me') {
      return json({ name: me, owner: isOwner });
    }

    if (url.pathname === '/__db/sync') {
      return json(await sync(env, me, url.searchParams.get('rev') || ''));
    }

    if (url.pathname === '/__db/write' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const res = await write(env, me, isOwner, body);
      return json(res, res.error ? 403 : 200);
    }

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('X-Empire-User', me);
    // Session-gated content should not sit in shared caches.
    out.headers.set('Cache-Control', 'private, no-cache');
    return out;
  }
};
