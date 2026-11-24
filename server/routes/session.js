'use strict';
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const audit = require('../audit');
const P = require('../perms');
const config = require('../config');

const router = express.Router();

/* الدخول والخروج وبيانات المستخدم الحالي */
router.post('/login', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) return res.status(400).json({ error: 'اكتب اسم المستخدم وكلمة السر' });
    if (auth.throttled(req, username)) return res.status(429).json({ error: 'محاولات كتير غلط. استنى 10 دقايق وجرّب تاني' });
    const u = (await db.query('SELECT id, username, display_name, pass_hash, role, perms, active FROM users WHERE username = ? LIMIT 1', [username]))[0];
    const ok = u && u.active && await auth.verifyPassword(password, u.pass_hash);
    if (!ok) { auth.failed(req, username); return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غلط' }); }
    auth.succeeded(req, username);
    auth.setCookie(req, res, auth.issue(u));
    audit.log({ user: { id: u.id, name: u.display_name || u.username } }, 'login', null, '', '');
    res.json({ ok: true, user: { id: u.id, username: u.username, name: u.display_name || u.username, role: P.roleOf(u.role), perms: P.effective(u.role, u.perms) } });
  } catch (e) { res.status(500).json({ error: 'تعذر الدخول: ' + e.message }); }
});

router.post('/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }); });
/* اسم النظام (للشاشة قبل الدخول) */
router.get('/brand', async (req, res) => {
  /* الألوان (للصفحة الدخول كمان) */
  let look = { skin: 'petrol', dark: false };
  try { const r = (await db.query("SELECT v FROM settings WHERE k = 'look'"))[0]; if (r) look = JSON.parse(r.v) || look; } catch (e) { /* القاعدة لسه مش جاهزة */ }
  res.json({ brand: config.brand, tag: config.brandTag, look: { skin: look.skin === 'olive' ? 'olive' : 'petrol', dark: !!look.dark } });
});

/* من هنا لتحت: لازم دخول */
router.use(async (req, res, next) => {
  const t = auth.verify(auth.cookieOf(req, auth.COOKIE));
  if (!t) return res.status(401).json({ error: 'سجّل الدخول الأول' });
  try {
    const u = (await db.query('SELECT id, username, display_name, role, perms, active FROM users WHERE id = ? LIMIT 1', [t.uid]))[0];
    if (!u || !u.active) return res.status(401).json({ error: 'الحساب موقوف' });
    req.user = { id: u.id, username: u.username, name: u.display_name || u.username, role: P.roleOf(u.role), perms: P.effective(u.role, u.perms) };
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', (req, res) => res.json({ user: req.user }));

const manage = P.need('users.manage');
const roleList = () => Object.entries(P.ROLES).map(([k, v]) => ({ id: k, label: v.label, desc: v.desc, perms: v.perms }));
const userRow = (r) => ({ id: r.id, username: r.username, name: r.display_name, role: P.roleOf(r.role), roleLabel: P.roleOf(r.role) === 'custom' ? 'مخصّص' : (P.ROLES[P.roleOf(r.role)] || {}).label, custom: P.roleOf(r.role) === 'custom', perms: P.effective(r.role, r.perms), active: !!r.active, createdAt: r.created_at });
router.get('/users', manage, async (req, res) => {
  res.json({ users: (await db.query('SELECT id, username, display_name, role, perms, active, created_at FROM users ORDER BY id')).map(userRow), roles: roleList(), perms: P.PERMS });
});
/* الدور + الصلاحيات من الطلب: perms (قايمة) أو role (قالب جاهز). بيرجّع { role, perms } للتخزين (perms=null يعني قالب الدور) */
function rolePerms(b) {
  if (b.role === 'admin') return { role: 'admin', perms: null };
  if (Array.isArray(b.perms)) { const list = P.sanitize(b.perms); const r = P.roleFor(list); return r === 'custom' ? { role: 'custom', perms: JSON.stringify(list) } : { role: r, perms: null }; }
  if (P.ROLES[b.role]) return { role: b.role, perms: null };
  return { role: 'staff', perms: null };
}
router.post('/users', manage, async (req, res) => {
  try {
    const b = req.body || {};
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم 3 لـ 40 حرف إنجليزي/رقم' });
    if (String(b.password || '').length < 8) return res.status(400).json({ error: 'كلمة السر 8 حروف على الأقل' });
    const rp = rolePerms(b);
    await db.query('INSERT INTO users (username, display_name, pass_hash, role, perms) VALUES (?, ?, ?, ?, ?)', [username, String(b.name || '').trim().slice(0, 120), await auth.hashPassword(b.password), rp.role, rp.perms]);
    audit.log(req, 'settings', null, '', 'مستخدم جديد: ' + username + ' (' + rp.role + ')');
    res.json({ ok: true });
  } catch (e) { res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: e.code === 'ER_DUP_ENTRY' ? 'الاسم ده موجود' : e.message }); }
});
router.put('/users/:id', manage, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const b = req.body || {};
    const sets = [], vals = [];
    if (b.name !== undefined) { sets.push('display_name = ?'); vals.push(String(b.name).trim().slice(0, 120)); }
    if (b.active !== undefined) { if (id === req.user.id && !b.active) return res.status(400).json({ error: 'متوقفش حسابك' }); sets.push('active = ?'); vals.push(b.active ? 1 : 0); }
    if (b.role !== undefined || b.perms !== undefined) {
      const rp = rolePerms(b);
      if (id === req.user.id && !P.effective(rp.role, rp.perms).includes('users.manage')) return res.status(400).json({ error: 'متنزّلش صلاحية حسابك (إدارة المستخدمين)' });
      sets.push('role = ?', 'perms = ?'); vals.push(rp.role, rp.perms);
    }
    if (b.password) { if (String(b.password).length < 8) return res.status(400).json({ error: 'كلمة السر 8 حروف على الأقل' }); sets.push('pass_hash = ?'); vals.push(await auth.hashPassword(b.password)); }
    if (!sets.length) return res.json({ ok: true });
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    audit.log(req, 'settings', null, '', 'تعديل مستخدم #' + id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
