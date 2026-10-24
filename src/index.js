import { session } from './auth.js';

const HUB = 'https://empirehq.win';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const who = await session(request, env);

    if (!who) {
      // No session: send them to the front door, and back here afterwards.
      const next = encodeURIComponent(url.toString());
      return new Response(null, {
        status: 302,
        headers: { 'Location': `${HUB}/?next=${next}`, 'Cache-Control': 'no-store' }
      });
    }

    // Who the page is talking to. The slips and bet log read this.
    if (url.pathname === '/__me') {
      return new Response(JSON.stringify({ name: who.n }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('X-Empire-User', who.n);
    // Session-gated data should not sit in shared caches.
    out.headers.set('Cache-Control', 'private, no-cache');
    return out;
  }
};
