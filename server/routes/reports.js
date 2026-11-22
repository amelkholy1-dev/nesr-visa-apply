'use strict';
/* التقارير وسجل النشاط */
const express = require('express');
const db = require('../db');
const F = require('../fields');
const audit = require('../audit');

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ده للمدير بس' }));
const day = (v, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : fallback);
const isoDay = (d) => d.toISOString().slice(0, 10);

router.get('/reports/summary', async (req, res) => {
  try {
    const to = day(req.query.to, isoDay(new Date())); const from = day(req.query.from, isoDay(new Date(Date.now() - 29 * 86400000)));
    const byStatus = Object.fromEntries((await db.query('SELECT status, COUNT(*) AS n FROM people GROUP BY status')).map((r) => [r.status, Number(r.n)]));
    const dailyRows = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, action, COUNT(*) AS n FROM activity WHERE action IN ('create','bulk','fill','filled','submitted') AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY d, action ORDER BY d`, [from, to]);
    const daily = new Map();
    for (const r of dailyRows) { const o = daily.get(r.d) || { day: r.d, created: 0, filled: 0, submitted: 0 }; if (r.action === 'create' || r.action === 'bulk') o.created += Number(r.n); else if (r.action === 'filled') o.filled += Number(r.n); else if (r.action === 'submitted') o.submitted += Number(r.n); daily.set(r.d, o); }
    const userRows = await db.query(
      `SELECT user_name, action, COUNT(*) AS n FROM activity WHERE action IN ('create','bulk','filled','submitted') AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) GROUP BY user_name, action`, [from, to]);
    const users = new Map();
    for (const r of userRows) { const o = users.get(r.user_name) || { user: r.user_name || '—', created: 0, filled: 0, submitted: 0 }; if (r.action === 'create' || r.action === 'bulk') o.created += Number(r.n); else if (r.action === 'filled') o.filled += Number(r.n); else o.submitted += Number(r.n); users.set(r.user_name, o); }
    const people = await db.query('SELECT status, data, profile_id FROM people');
    const profs = new Map((await db.query('SELECT id, data FROM profiles')).map((p) => [p.id, json(p.data)]));
    let expiring = 0, expired = 0;
    for (const p of people) { if (p.status === 'submitted') continue; const d = json(p.data); const ex = F.expiryInfo(d.expiryDate, d.expectedEntryDate || (profs.get(p.profile_id) || {}).expectedEntryDate); if (ex.expired) expired++; else if (ex.short) expiring++; }
    res.json({ from, to, total: people.length, byStatus, expiring, expired, daily: [...daily.values()], users: [...users.values()] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* تصدير CSV (بيتفتح في Excel بالعربي): كل الأشخاص أو حسب الحالة والتاريخ */
const csvCell = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
const STATUS_AR = { draft: 'مسودة', ready: 'جاهز', waiting: 'مستني تأمين الجواز', filled: 'اتملى في المنصة', submitted: 'اتبعت' };
router.get('/reports/export.csv', async (req, res) => {
  try {
    const where = [], vals = [];
    if (req.query.status && STATUS_AR[req.query.status]) { where.push('p.status = ?'); vals.push(req.query.status); }
    if (day(req.query.from, '')) { where.push('p.created_at >= ?'); vals.push(req.query.from); }
    if (day(req.query.to, '')) { where.push('p.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); vals.push(req.query.to); }
    const rows = await db.query(`SELECT p.id, p.name_ar, p.passport_no, p.status, p.app_number, p.filled_at, p.created_at, p.data, pr.name AS profile_name, u.display_name, u.username
      FROM people p LEFT JOIN profiles pr ON pr.id = p.profile_id LEFT JOIN users u ON u.id = p.created_by ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC`, vals);
    const fmt = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '');
    const head = ['م', 'الاسم', 'رقم الجواز', 'ملف الضبط', 'الحالة', 'رقم الطلب', 'تاريخ انتهاء الجواز', 'أضافه', 'تاريخ الإضافة', 'آخر ملء/إرسال'];
    const lines = [head.map(csvCell).join(',')];
    rows.forEach((r, i) => { const d = json(r.data); lines.push([i + 1, r.name_ar, r.passport_no, r.profile_name || '', STATUS_AR[r.status] || r.status, r.app_number || '', d.expiryDate || '', r.display_name || r.username || '', fmt(r.created_at), fmt(r.filled_at)].map(csvCell).join(',')); });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('تقرير-الطلبات-' + isoDay(new Date()) + '.csv'));
    res.send('﻿' + lines.join('\r\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* سجل النشاط (للمدير) */
router.get('/activity', admin, async (req, res) => {
  try {
    const where = [], vals = [];
    if (req.query.user) { where.push('user_name = ?'); vals.push(String(req.query.user)); }
    if (req.query.action && audit.LABELS[req.query.action]) { where.push('action = ?'); vals.push(req.query.action); }
    if (req.query.person) { where.push('person_id = ?'); vals.push(parseInt(req.query.person, 10) || 0); }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const rows = await db.query(`SELECT id, user_name, action, person_id, person_name, detail, created_at FROM activity ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`, vals);
    const users = (await db.query('SELECT DISTINCT user_name FROM activity ORDER BY user_name')).map((r) => r.user_name).filter(Boolean);
    res.json({ labels: audit.LABELS, users, rows: rows.map((r) => ({ id: r.id, user: r.user_name, action: r.action, label: audit.LABELS[r.action] || r.action, personId: r.person_id, person: r.person_name, detail: r.detail, at: r.created_at })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
