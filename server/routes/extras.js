'use strict';
/* تصدير لتساهيل (Excel) + إعدادات الطباعة */
const express = require('express');
const db = require('../db');
const F = require('../fields');
const xls = require('../xls');
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

const COUNTRY_EN = { 'مصر': 'Egypt', EGY: 'Egypt' };
const COUNTRIES = require('../tasaheel-countries.json'); /* قايمة الجنسيات اللي في ملف تساهيل الأصلي (ورقة hiddenSheet) */
const toIso = (v) => String(v || '').replace(/\//g, '-');
/* أعمدة ملف تساهيل الأصلي (Bio_Applicant_Details) بنفس الترتيب والأسماء */
const TASAHEEL_HEAD = ['E.No', 'First Name*', 'Second Name', 'Last Name*', 'Passport Number*', 'Date of Birth* ', 'Nationality*', 'Date of Issue*', 'Gender*', 'Place of Issue*', 'Expiry Date*', 'Applicant Mobile No.*', 'Email ID*'];

/* «ملف جديد يبدأ بالقيم الثابتة من الملف الافتراضي»: مفتاح تلقائي بيتفعّل من صفحة «ملفات الضبط» */
router.get('/settings/profile-template', async (req, res) => {
  try { const r = (await db.query("SELECT v FROM settings WHERE k = 'profileTemplate'"))[0]; res.json({ auto: !!(r && json(r.v).auto) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/settings/profile-template', admin, async (req, res) => {
  try {
    const auto = !!(req.body && req.body.auto);
    await db.query("INSERT INTO settings (k, v) VALUES ('profileTemplate', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify({ auto })]);
    audit.log(req, 'settings', null, '', 'ملف جديد من الافتراضي: ' + (auto ? 'شغّال' : 'مقفول'));
    res.json({ ok: true, auto });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* الرابط القديم (نسخة الصفحة القديمة المخزّنة في المتصفح): بنوديه للجديد بنفس الاختيارات */
router.get('/export/tasheel.xlsx', (req, res) => res.redirect(302, '/api/export/tasaheel.xls' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));

/* تصدير لتساهيل: ?ids=1,2,3 أو ?status=… ، وبيرجّع ملف Excel (.xls) بنفس شكل ملف تساهيل (ورقة Bio_Applicant_Details + ورقة hiddenSheet المخفية) */
router.get('/export/tasaheel.xls', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 2000);
    const where = [], vals = [];
    if (ids.length) { where.push(`id IN (${ids.map(() => '?').join(',')})`); vals.push(...ids); }
    else if (req.query.status) { where.push('status = ?'); vals.push(String(req.query.status)); }
    const rows = await db.query(`SELECT * FROM people ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`, vals);
    const profs = new Map((await db.query('SELECT id, data FROM profiles')).map((p) => [p.id, json(p.data)]));
    const passports = [];
    const data = rows.map((r, i) => {
      const d = json(r.data); const rs = F.resolve(d, profs.get(r.profile_id), {}); const m = rs.mofa; passports.push(m.PASSPORTnumber || '');
      return [i + 1, m.EFIRSTNAME || '', [m.EFATHER, m.EGRAND].filter(Boolean).join(' '), m.EFAMILY || '', m.PASSPORTnumber || '', { date: toIso(m.BIRTH_DATE) }, COUNTRY_EN[m.NATIONALITY] || m.NATIONALITY || '',
        { date: toIso(m.PASSPORT_ISSUE_DATE) }, m.Sex === '1' ? 'Male' : m.Sex === '2' ? 'Female' : '', rs.values.issuePlace || COUNTRY_EN[m.PASSPORT_ISSUE_PLACE] || m.PASSPORT_ISSUE_PLACE || 'Egypt', { date: toIso(m.PASSPORT_EXPIRY_DATe) },
        String(d.phone || '').replace(/\D/g, ''), m.Personal_Email || ''];
    });
    const buf = await xls.build([
      { name: 'Bio_Applicant_Details', headers: TASAHEEL_HEAD, rows: data, widths: [5.13, 15.28, 14.56, 12.28, 16.28, 11.7, 10.41, 12.56, 15.7, 13.56, 11.42, 19.14, 24] },
      { name: 'hiddenSheet', hidden: true, rows: COUNTRIES.map((c) => [c]), widths: [24] }
    ]);
    audit.log(req, 'export', null, '', 'تساهيل: ' + data.length + ' شخص');
    const fname = data.length === 1 && /^[A-Za-z0-9]+$/.test(passports[0]) ? passports[0] : 'tasaheel-' + new Date().toISOString().slice(0, 10); /* شخص واحد: باسم رقم جوازه زي مثال تساهيل */
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(fname + '.xls'));
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
