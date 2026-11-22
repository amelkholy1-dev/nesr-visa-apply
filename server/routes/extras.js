'use strict';
/* تصدير لتسهيل (Excel) + إعدادات الطباعة */
const express = require('express');
const db = require('../db');
const F = require('../fields');
const xlsx = require('../xlsx');
const audit = require('../audit');

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ده للمدير بس' }));

const DEFAULT_PRINT = {
  company: 'نسر الخليج', line2: '', dateFormat: 'DD/MM/YYYY'
};
async function printSettings() {
  const r = (await db.query("SELECT v FROM settings WHERE k = 'print'"))[0];
  const o = r ? json(r.v) : {};
  return { ...DEFAULT_PRINT, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k in DEFAULT_PRINT && typeof v === 'string')) };
}
router.get('/settings/print', async (req, res) => { try { res.json(await printSettings()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/settings/print', admin, async (req, res) => {
  try {
    const b = req.body || {}; const cur = await printSettings(); const out = {};
    for (const k of Object.keys(DEFAULT_PRINT)) out[k] = typeof b[k] === 'string' ? b[k].slice(0, 4000) : cur[k];
    if (!['DD/MM/YYYY', 'DD-Mon-YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].includes(out.dateFormat)) out.dateFormat = 'DD/MM/YYYY';
    await db.query("INSERT INTO settings (k, v) VALUES ('print', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(out)]);
    res.json({ ok: true, settings: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso, fmt) {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(String(iso || '')); if (!m) return '';
  const [, y, mo, d] = m;
  if (fmt === 'DD-Mon-YYYY') return `${d}-${MON[+mo - 1]}-${y}`;
  if (fmt === 'YYYY-MM-DD') return `${y}-${mo}-${d}`;
  if (fmt === 'MM/DD/YYYY') return `${mo}/${d}/${y}`;
  return `${d}/${mo}/${y}`;
}
const COUNTRY_EN = { 'مصر': 'Egypt', EGY: 'Egypt' };

/* تصدير لتسهيل: ?ids=1,2,3 أو ?status=… ، وبيرجّع ملف xlsx بورقة «Bio Applicant Details» */
router.get('/export/tasheel.xlsx', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 2000);
    const where = [], vals = [];
    if (ids.length) { where.push(`id IN (${ids.map(() => '?').join(',')})`); vals.push(...ids); }
    else if (req.query.status) { where.push('status = ?'); vals.push(String(req.query.status)); }
    const rows = await db.query(`SELECT * FROM people ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`, vals);
    const profs = new Map((await db.query('SELECT id, data FROM profiles')).map((p) => [p.id, json(p.data)]));
    const fmt = ['DD/MM/YYYY', 'DD-Mon-YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].includes(req.query.fmt) ? req.query.fmt : (await printSettings()).dateFormat;
    const head = ['First Name', 'Second Name', 'Last Name', 'Passport Number', 'Date of Birth', 'Nationality', 'Date of Issue', 'Date of Expiry', 'Gender', 'Place of Issue', 'Applicant Mobile No', 'Email ID'];
    const toIso = (v) => String(v || '').replace(/\//g, '-');
    const data = rows.map((r) => {
      const d = json(r.data); const m = F.resolve(d, profs.get(r.profile_id), {}).mofa;
      return [m.EFIRSTNAME || '', [m.EFATHER, m.EGRAND].filter(Boolean).join(' '), m.EFAMILY || '', m.PASSPORTnumber || '', fmtDate(toIso(m.BIRTH_DATE), fmt), COUNTRY_EN[m.NATIONALITY] || m.NATIONALITY || '',
        fmtDate(toIso(m.PASSPORT_ISSUE_DATE), fmt), fmtDate(toIso(m.PASSPORT_EXPIRY_DATe), fmt), m.Sex === '1' ? 'Male' : m.Sex === '2' ? 'Female' : '', COUNTRY_EN[m.PASSPORT_ISSUE_PLACE] || m.PASSPORT_ISSUE_PLACE || '', d.phone || '', m.Personal_Email || ''];
    });
    const buf = await xlsx.build(head, data, 'Bio Applicant Details');
    audit.log(req, 'export', null, '', 'تسهيل: ' + data.length + ' شخص');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('tasheel-' + new Date().toISOString().slice(0, 10) + '.xlsx'));
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
