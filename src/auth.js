// مصادقة بسيطة بكوكي موقّع (HMAC) — بدون اعتماديات.
const crypto = require('crypto');
const SECRET = () => process.env.SESSION_SECRET || 'dev-secret-change-me';
const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // أسبوع

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() - p.t > MAX_AGE) return null;
    return p;
  } catch (e) { return null; }
}
function checkPassword(pw) {
  const real = process.env.APP_PASSWORD || '';
  if (!real) return false;
  const a = Buffer.from(String(pw)); const b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseCookie(header) {
  const o = {};
  (header || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function isAuthed(req) {
  const c = parseCookie(req.headers.cookie);
  return !!verify(c.ef_session);
}
function setSession(res) {
  const token = sign({ t: Date.now() });
  res.setHeader('Set-Cookie', `ef_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE / 1000}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', 'ef_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
module.exports = { checkPassword, isAuthed, setSession, clearSession };
