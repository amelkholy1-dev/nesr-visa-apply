'use strict';
const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'va_sid';
const TTL_MS = 12 * 3600 * 1000;

/* كلمات السر: scrypt مع ملح عشوائي */
function hashPassword(pw) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) => (e ? reject(e) : resolve(`s1$${salt.toString('hex')}$${key.toString('hex')}`)));
  });
}
function verifyPassword(pw, stored) {
  return new Promise((resolve) => {
    const [v, saltHex, keyHex] = String(stored || '').split('$');
    if (v !== 's1' || !saltHex || !keyHex) return resolve(false);
    crypto.scrypt(String(pw), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 }, (e, key) => {
      if (e) return resolve(false);
      const want = Buffer.from(keyHex, 'hex');
      resolve(want.length === key.length && crypto.timingSafeEqual(want, key));
    });
  });
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');
function issue(user) {
  const payload = b64(JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + TTL_MS }));
  return `${payload}.${sign(payload)}`;
}
function verify(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const want = sign(p);
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
function cookieOf(req, name) {
  const h = String(req.headers.cookie || '');
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return '';
}
function setCookie(req, res, token) {
  const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)}${secure ? '; Secure' : ''}`);
}
const clearCookie = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

/* تقييد محاولات الدخول (في الذاكرة): 6 غلط في 10 دقايق لنفس المستخدم + الجهاز */
const fails = new Map();
const key = (req, u) => `${req.ip}|${String(u || '').toLowerCase()}`;
function throttled(req, u) { const f = fails.get(key(req, u)); return !!f && f.n >= 6 && Date.now() - f.at < 600000; }
function failed(req, u) { const k = key(req, u); const f = fails.get(k); fails.set(k, { n: (f && Date.now() - f.at < 600000 ? f.n : 0) + 1, at: Date.now() }); }
function succeeded(req, u) { fails.delete(key(req, u)); }

module.exports = { COOKIE, hashPassword, verifyPassword, issue, verify, cookieOf, setCookie, clearCookie, throttled, failed, succeeded };
