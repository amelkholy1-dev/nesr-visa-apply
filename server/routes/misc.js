'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../db');
const F = require('../fields');
const config = require('../config');

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ده للمدير بس' }));

router.get('/meta', (req, res) => res.json({ ...F.meta(), ocr: !!config.geminiKey }));

/* ملفات الضبط (الدفعات): قيم مشتركة بتتطبّق على الأشخاص */
router.get('/profiles', async (req, res) => {
  const rows = await db.query('SELECT id, name, data, is_default FROM profiles ORDER BY is_default DESC, id');
  res.json({ profiles: rows.map(r => ({ id: r.id, name: r.name, isDefault: !!r.is_default, data: json(r.data) })) });
});
router.post('/profiles', async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim().slice(0, 160);
    if (!name) return res.status(400).json({ error: 'اكتب اسم لملف الضبط' });
    const r = await db.query('INSERT INTO profiles (name, data) VALUES (?, ?)', [name, JSON.stringify(F.sanitizeProfile(req.body.data))]);
    if (req.body.isDefault) { await db.query('UPDATE profiles SET is_default = 0'); await db.query('UPDATE profiles SET is_default = 1 WHERE id = ?', [r.insertId]); }
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/profiles/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const b = req.body || {};
    await db.query('UPDATE profiles SET name = COALESCE(?, name), data = ? WHERE id = ?', [b.name ? String(b.name).trim().slice(0, 160) : null, JSON.stringify(F.sanitizeProfile(b.data)), id]);
    if (b.isDefault) { await db.query('UPDATE profiles SET is_default = 0'); await db.query('UPDATE profiles SET is_default = 1 WHERE id = ?', [id]); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/profiles/:id(\\d+)', admin, async (req, res) => {
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
