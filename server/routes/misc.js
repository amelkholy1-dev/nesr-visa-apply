'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../db');
const F = require('../fields');
const config = require('../config');
const S = require('../stages');

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const P = require('../perms');
const admin = P.need('profiles.edit');

const A = require('../accounts');
const getSetting = async (k, def) => { const r = (await db.query('SELECT v FROM settings WHERE k = ?', [k]))[0]; if (!r) return def; try { return JSON.parse(r.v); } catch (e) { return def; } };
const setSetting = (k, v) => db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, JSON.stringify(v)]);
router.get('/meta', async (req, res) => {
  let photo = { mode: 'off' }; try { photo = await getSetting('photo', photo); } catch (e) { /* مش مهم */ }
  let theme = 'slate'; try { theme = await getSetting('theme', theme); } catch (e) { /* مش مهم */ }
  res.json({ ...F.meta(), ocr: !!config.geminiKey, stages: S.STAGES, brand: config.brand, brandTag: config.brandTag, perms: P.PERMS, payMethods: A.PAY_METHODS, photoProcess: photo.mode === 'clean' ? 'clean' : 'off', theme: ['slate', 'green', 'navy', 'warm'].includes(theme) ? theme : 'slate' });
});
router.put('/settings/theme', P.need('users.manage'), async (req, res) => {
  try { const t = ['slate', 'green', 'navy', 'warm'].includes(req.body && req.body.theme) ? req.body.theme : 'slate'; await setSetting('theme', t); require('../audit').log(req, 'settings', null, '', 'المظهر: ' + t); res.json({ ok: true, theme: t }); } catch (e) { res.status(500).json({ error: e.message }); }
});
/* معالجة الصورة الشخصية عند الرفع: off = زي ما هي (بتتصغّر بس) · clean = خلفية بيضاء + إزالة تشويش (بتتم في المتصفح) */
router.put('/settings/photo', P.need('users.manage'), async (req, res) => {
  try { const mode = req.body && req.body.mode === 'clean' ? 'clean' : 'off'; await setSetting('photo', { mode }); require('../audit').log(req, 'settings', null, '', 'معالجة الصورة: ' + (mode === 'clean' ? 'شغّالة' : 'زي ما هي')); res.json({ ok: true, mode }); } catch (e) { res.status(500).json({ error: e.message }); }
});
/* نماذج الدفعات: كل نموذج = اسم + قيم جاهزة بتتعبّى في أي دفعة جديدة */
router.get('/batch-templates', P.need('profiles.edit'), async (req, res) => { try { res.json({ templates: await getSetting('batchTemplates', []) }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/batch-templates', P.need('profiles.edit'), async (req, res) => {
  try {
    const list = (Array.isArray(req.body && req.body.templates) ? req.body.templates : []).slice(0, 30).map((t, i) => ({ id: String(t.id || ('t' + Date.now().toString(36) + i)).replace(/[^\w-]/g, '').slice(0, 24), name: String(t.name || '').trim().slice(0, 80) || 'نموذج ' + (i + 1), data: F.sanitizeProfile(t.data), isDefault: !!t.isDefault }));
    let seen = false; for (const t of list) { if (t.isDefault && seen) t.isDefault = false; if (t.isDefault) seen = true; }
    await setSetting('batchTemplates', list); require('../audit').log(req, 'settings', null, '', 'نماذج الدفعات: ' + list.length); res.json({ ok: true, templates: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ملفات الضبط (الدفعات): قيم مشتركة بتتطبّق على الأشخاص */
router.get('/profiles', async (req, res) => {
  const rows = await db.query('SELECT id, name, data, is_default, archived FROM profiles ORDER BY archived, is_default DESC, id');
  res.json({ profiles: rows.map(r => ({ id: r.id, name: r.name, isDefault: !!r.is_default, archived: !!r.archived, data: json(r.data) })) });
});
router.post('/profiles', P.need('profiles.edit'), async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 160);
    if (!name) return res.status(400).json({ error: 'اكتب اسم لملف الضبط' });
    const r = await db.query('INSERT INTO profiles (name, data) VALUES (?, ?)', [name, JSON.stringify(F.sanitizeProfile(req.body.data))]);
    if (req.body.isDefault) { await db.query('UPDATE profiles SET is_default = 0'); await db.query('UPDATE profiles SET is_default = 1 WHERE id = ?', [r.insertId]); }
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/profiles/:id(\\d+)', P.need('profiles.edit'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const b = req.body || {};
    await db.query('UPDATE profiles SET name = COALESCE(?, name), data = ? WHERE id = ?', [b.name ? String(b.name).trim().slice(0, 160) : null, JSON.stringify(F.sanitizeProfile(b.data)), id]);
    if (b.isDefault) { await db.query('UPDATE profiles SET is_default = 0'); await db.query('UPDATE profiles SET is_default = 1 WHERE id = ?', [id]); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/profiles/:id(\\d+)/archive', P.need('profiles.edit'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const on = !!(req.body && req.body.archived);
    const p = (await db.query('SELECT name FROM profiles WHERE id = ?', [id]))[0]; if (!p) return res.status(404).json({ error: 'الدفعة مش موجودة' });
    await db.query('UPDATE profiles SET archived = ?' + (on ? ', is_default = 0' : '') + ' WHERE id = ?', [on ? 1 : 0, id]);
    require('../audit').log(req, 'settings', null, '', (on ? 'أرشفة دفعة: ' : 'إلغاء أرشفة دفعة: ') + p.name); res.json({ ok: true, archived: on });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/profiles/:id(\\d+)', P.need('users.manage'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const n = (await db.query('SELECT COUNT(*) AS n FROM people WHERE profile_id = ?', [id]))[0].n;
    if (n > 0) return res.status(409).json({ error: `فيه ${n} شخص مربوطين بالملف ده. انقلهم لملف تاني الأول.` });
    await db.query('DELETE FROM profiles WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* إحصائيات سريعة للشاشة الرئيسية */
router.get('/stats', async (req, res) => {
  const rows = await db.query('SELECT status, COUNT(*) AS n FROM people GROUP BY status');
  res.json({ byStatus: Object.fromEntries(rows.map(r => [r.status, r.n])) });
});

/* تحميل إضافة Chrome (مضغوطة من فولدر extension) */
router.get('/extension.zip', (req, res) => {
  const dir = path.join(__dirname, '..', '..', 'extension');
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return res.status(404).json({ error: 'فولدر الإضافة مش موجود على السيرفر' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="nesr-visa-apply-extension.zip"');
  const z = archiver('zip', { zlib: { level: 6 } });
  z.on('error', () => { try { res.destroy(); } catch (e) { /* مش مهم */ } });
  z.pipe(res); z.directory(dir, 'nesr-visa-apply-extension'); z.finalize();
});
router.get('/extension-version', (req, res) => {
  try { res.json({ version: JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'manifest.json'), 'utf8')).version }); } catch (e) { res.json({ version: '' }); }
});

module.exports = router;
