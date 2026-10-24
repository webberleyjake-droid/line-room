// Shared session handling for every app on empirehq.win.
//
// A passphrase identifies a person: the USERS secret maps sha256(passphrase)
// to a display name, so no plaintext passphrase exists in code or config.
// On success we hand out a cookie scoped to the parent domain, signed with
// HMAC-SHA256, so every subdomain can verify it without talking to anything.

export const COOKIE = 'emp_session';
export const MAX_AGE = 60 * 60 * 24 * 365; // one year

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return body + '.' + b64url(new Uint8Array(sig));
}

// Returns the session payload, or null if missing / tampered / expired.
export async function verify(token, secret) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await key(secret), unb64url(sig), enc.encode(body));
  } catch { return null; }
  if (!ok) return null;
  let p;
  try { p = JSON.parse(new TextDecoder().decode(unb64url(body))); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || Date.now() / 1000 > p.exp) return null;
  return p;
}

export function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function cookieHeader(token, maxAge) {
  return `${COOKIE}=${token}; Domain=empirehq.win; Path=/; Secure; HttpOnly; ` +
         `SameSite=Lax; Max-Age=${maxAge}`;
}

// Current session for a request, or null.
export async function session(request, env) {
  if (!env.AUTH_SECRET) return null;
  return verify(readCookie(request, COOKIE), env.AUTH_SECRET);
}

// Check a submitted passphrase against the USERS map. Returns a name or null.
export async function identify(passphrase, env) {
  if (!env.USERS) return null;
  let users;
  try { users = JSON.parse(env.USERS); } catch { return null; }
  const h = await sha256hex(String(passphrase).trim().toLowerCase());
  return Object.prototype.hasOwnProperty.call(users, h) ? users[h] : null;
}
