'use strict';
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const audit = require('../audit');

const router = express.Router();

/* الدخول والخروج وبيانات المستخدم الحالي */
router.post('/login', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) return res.status(400).json({ error: 'اكتب اسم المستخدم وكلمة السر' });
    if (auth.throttled(req, username)) return res.status(429).json({ error: 'محاولات كتير غلط. استنى 10 دقايق وجرّب تاني' });
    const u = (await db.query('SELECT id, username, display_name, pass_hash, role, active FROM users WHERE username = ? LIMIT 1', [username]))[0];
    const ok = u && u.active && await auth.verifyPassword(password, u.pass_hash);
    if (!ok) { auth.failed(req, username); return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غلط' }); }
    auth.succeeded(req, username);
    auth.setCookie(req, res, auth.issue(u));
    audit.log({ user: { id: u.id, name: u.display_name || u.username } }, 'login', null, '', '');
    res.json({ ok: true, user: { id: u.id, username: u.username, name: u.display_name || u.username, role: u.role } });
  } catch (e) { res.status(500).json({ error: 'تعذر الدخول: ' + e.message }); }
});

router.post('/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }); });

/* من هنا لتحت: لازم دخول */
router.use(async (req, res, next) => {
  const t = auth.verify(auth.cookieOf(req, auth.COOKIE));
  if (!t) return res.status(401).json({ error: 'سجّل الدخول الأول' });
  try {
    const u = (await db.query('SELECT id, username, display_name, role, active FROM users WHERE id = ? LIMIT 1', [t.uid]))[0];
    if (!u || !u.active) return res.status(401).json({ error: 'الحساب موقوف' });
    req.user = { id: u.id, username: u.username, name: u.display_name || u.username, role: u.role };
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', (req, res) => res.json({ user: req.user }));

const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ده للمدير بس' }));

router.get('/users', admin, async (req, res) => {
  res.json({ users: await db.query('SELECT id, username, display_name, role, active, created_at FROM users ORDER BY id') });
});
router.post('/users', admin, async (req, res) => {
  try {
    const b = req.body || {};
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم 3 لـ 40 حرف إنجليزي/رقم' });
    if (String(b.password || '').length < 8) return res.status(400).json({ error: 'كلمة السر 8 حروف على الأقل' });
    await db.query('INSERT INTO users (username, display_name, pass_hash, role) VALUES (?, ?, ?, ?)', [username, String(b.name || '').trim().slice(0, 120), await auth.hashPassword(b.password), b.role === 'admin' ? 'admin' : 'user']);
    res.json({ ok: true });
  } catch (e) { res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: e.code === 'ER_DUP_ENTRY' ? 'الاسم ده موجود' : e.message }); }
});
router.put('/users/:id', admin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const b = req.body || {};
    const sets = [], vals = [];
    if (b.name !== undefined) { sets.push('display_name = ?'); vals.push(String(b.name).trim().slice(0, 120)); }
    if (b.active !== undefined) { if (id === req.user.id && !b.active) return res.status(400).json({ error: 'متوقفش حسابك' }); sets.push('active = ?'); vals.push(b.active ? 1 : 0); }
    if (b.role !== undefined) { if (id === req.user.id && b.role !== 'admin') return res.status(400).json({ error: 'متنزّلش صلاحية حسابك' }); sets.push('role = ?'); vals.push(b.role === 'admin' ? 'admin' : 'user'); }
    if (b.password) { if (String(b.password).length < 8) return res.status(400).json({ error: 'كلمة السر 8 حروف على الأقل' }); sets.push('pass_hash = ?'); vals.push(await auth.hashPassword(b.password)); }
    if (!sets.length) return res.json({ ok: true });
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
