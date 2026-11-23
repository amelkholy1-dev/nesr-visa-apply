'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');
const F = require('../fields');
const mrz = require('../mrz');
const names = require('../names');
const ocr = require('../ocr');
const audit = require('../audit');
const S = require('../stages');
const wafid = require('../wafid');
const lab = require('../lab');
const letters = require('../letters');
const R = require('../readiness');
const { letterVars } = R;
const readiness = (row, profile) => R.readiness(row, profile, sizeOf(row.id, row.personal_photo));

const router = express.Router();
const P = require('../perms');
/* صلاحية كل مسار (أول قاعدة تنطبق) */
const RULES = [
  ['GET', /^\/(\d+\/(payload|wafid|lab|appno-lookup|letter\/.*)|letters-bundle)$/, 'people.fill'], ['POST', /^\/(\d+\/result|result-by-passport)$/, 'people.fill'],
  ['PUT', /^\/\d+\/stages\//, 'people.mark'], ['POST', /^\/bulk\//, 'people.mark'],
  ['DELETE', /^\/\d+$/, 'people.delete'], ['GET', /./, 'people.view'], ['*', /./, 'people.edit']
];
router.use((req, res, next) => { for (const [m, re, perm] of RULES) if ((m === '*' || m === req.method) && re.test(req.path)) return P.need(perm)(req, res, next); next(); });
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxPassportBytes + 1 } });

const peopleDir = (id) => path.join(config.dataDir, 'people', String(id));
const fileOf = (row, kind) => (kind === 'photo' ? row.personal_photo : row.passport_image);
const fullPath = (id, name) => path.join(peopleDir(id), path.basename(String(name)));
const sizeOf = (id, name) => { try { return name ? fs.statSync(fullPath(id, name)).size : 0; } catch (e) { return 0; } };

async function loadProfile(id) {
  if (!id) return null;
  const p = (await db.query('SELECT id, name, data, archived FROM profiles WHERE id = ?', [id]))[0];
  return p ? { id: p.id, name: p.name, data: json(p.data), archived: !!p.archived } : null;
}
const A = require('../accounts');
function brief(row, profile, pays) {
  const r = F.resolve(json(row.data), profile && profile.data, { personalPhoto: row.personal_photo, personalPhotoSize: sizeOf(row.id, row.personal_photo), passportImage: row.passport_image });
  return { id: row.id, name: row.name_ar, passportNo: row.passport_no, status: row.status, profileId: row.profile_id, profileName: profile ? profile.name : '',
    appNumber: row.app_number, visaKind: r.values.visaKind || '', embassy: r.values.embassy || '', visaNumber: (profile && profile.data && profile.data.visaNumber) || '', hasPhoto: !!row.personal_photo, hasPassport: !!row.passport_image, issues: r.issues.length, ready: r.ready, updatedAt: row.updated_at, filledAt: row.filled_at,
    stages: S.parse(row.stages), service: readiness(row, profile),
    expiry: F.expiryInfo(json(row.data).expiryDate, json(row.data).expectedEntryDate || (profile && profile.data && profile.data.expectedEntryDate)), archived: !!(profile && profile.archived),
    ...(pays ? { pay: A.balance(A.feeOf(json(row.data), profile && profile.data).fee, pays.get(row.id) || 0) } : {}) };
}

router.get('/', async (req, res) => {
  try {
    const where = [], vals = [];
    if (req.query.status) { where.push('status = ?'); vals.push(String(req.query.status)); }
    if (req.query.profile) { where.push('profile_id = ?'); vals.push(parseInt(req.query.profile, 10)); }
    if (req.query.q) { where.push('(name_ar LIKE ? OR passport_no LIKE ? OR app_number LIKE ?)'); const q = `%${String(req.query.q).trim().replace(/[%_]/g, '')}%`; vals.push(q, q, q); }
    /* الدفعات المؤرشفة مش بتظهر إلا لو طلبتها (archived=1 للمؤرشف بس، archived=all للكل) */
    if (req.query.archived === '1') where.push('profile_id IN (SELECT id FROM profiles WHERE archived = 1)');
    else if (req.query.archived !== 'all') where.push('(profile_id IS NULL OR profile_id NOT IN (SELECT id FROM profiles WHERE archived = 1))');
    const rows = await db.query(`SELECT * FROM people ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`, vals);
    const profs = new Map((await db.query('SELECT id, name, data, archived FROM profiles')).map(p => [p.id, { id: p.id, name: p.name, data: json(p.data), archived: !!p.archived }]));
    const pays = P.has(req, 'payments.view') ? new Map((await db.query('SELECT person_id, SUM(amount) AS s FROM payments GROUP BY person_id')).map((r) => [r.person_id, Number(r.s)])) : null;
    res.json({ people: rows.map(r => brief(r, profs.get(r.profile_id), pays)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id(\\d+)', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id);
    const files = { personalPhoto: row.personal_photo, personalPhotoSize: sizeOf(row.id, row.personal_photo), passportImage: row.passport_image };
    res.json({ person: { id: row.id, profileId: row.profile_id, status: row.status, appNumber: row.app_number, data: json(row.data), hasPhoto: !!row.personal_photo, hasPassport: !!row.passport_image, photoSize: files.personalPhotoSize, stages: S.parse(row.stages), service: readiness(row, profile), profileName: profile ? profile.name : '' },
      profile, resolved: F.resolve(json(row.data), profile && profile.data, files) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function save(req, res, id) {
  try {
    const b = req.body || {};
    const data = F.sanitizePerson(b.data);
    const profileId = b.profileId ? parseInt(b.profileId, 10) : null;
    if (profileId && !(await loadProfile(profileId))) return res.status(400).json({ error: 'ملف الضبط مش موجود' });
    const nameAr = String(data.nameAr || '').slice(0, 255), passportNo = String(data.passportNo || '').toUpperCase().replace(/\s+/g, '').slice(0, 30);
    data.passportNo = passportNo || data.passportNo;
    if (id) {
      await db.query('UPDATE people SET profile_id = ?, name_ar = ?, passport_no = ?, data = ? WHERE id = ?', [profileId, nameAr, passportNo, JSON.stringify(data), id]);
      audit.log(req, 'update', id, nameAr, passportNo);
      return res.json({ ok: true, id });
    }
    if (passportNo) {
      const dup = (await db.query('SELECT id, name_ar FROM people WHERE passport_no = ? LIMIT 1', [passportNo]))[0];
      if (dup && !b.allowDuplicate) return res.status(409).json({ error: `رقم الجواز ده متسجّل قبل كده (${dup.name_ar || '#' + dup.id})`, duplicateId: dup.id });
    }
    const r = await db.query('INSERT INTO people (profile_id, name_ar, passport_no, data, created_by) VALUES (?, ?, ?, ?, ?)', [profileId, nameAr, passportNo, JSON.stringify(data), req.user.id]);
    audit.log(req, b.bulk ? 'bulk' : 'create', r.insertId, nameAr, b.bulk ? 'رفع جماعي: ' + passportNo : passportNo);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
router.post('/', (req, res) => save(req, res, null));
router.put('/:id(\\d+)', (req, res) => save(req, res, parseInt(req.params.id, 10)));

router.delete('/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = (await db.query('SELECT id, created_by, name_ar, passport_no FROM people WHERE id = ?', [id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    if (!['admin', 'manager'].includes(req.user.role) && row.created_by !== req.user.id) return res.status(403).json({ error: 'الحذف للمدير أو لمن أضافه' });
    await db.query('DELETE FROM people WHERE id = ?', [id]);
    audit.log(req, 'delete', id, row.name_ar, row.passport_no);
    fs.rmSync(peopleDir(id), { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* الصور: photo (الشخصية، لازم أقل من 1 ميجا) و passport (صورة الجواز) */
router.post('/:id(\\d+)/files/:kind(photo|passport)', upload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10), kind = req.params.kind;
    const row = (await db.query('SELECT id FROM people WHERE id = ?', [id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'مفيش ملف' });
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png' })[f.mimetype] || (kind === 'passport' && f.mimetype === 'application/pdf' ? 'pdf' : '');
    if (!ext) return res.status(400).json({ error: kind === 'photo' ? 'الصورة الشخصية JPG أو PNG بس' : 'صورة الجواز JPG أو PNG أو PDF' });
    const max = kind === 'photo' ? config.maxPhotoBytes : config.maxPassportBytes;
    if (f.size > max) return res.status(413).json({ error: `الملف ${(f.size / 1048576).toFixed(2)} ميجا وأكبر من المسموح (${(max / 1048576).toFixed(0)} ميجا). صغّره.` });
    fs.mkdirSync(peopleDir(id), { recursive: true });
    const name = `${kind}-${Date.now()}.${ext}`;
    fs.writeFileSync(fullPath(id, name), f.buffer);
    const col = kind === 'photo' ? 'personal_photo' : 'passport_image';
    const old = (await db.query(`SELECT ${col} AS f FROM people WHERE id = ?`, [id]))[0].f;
    await db.query(`UPDATE people SET ${col} = ? WHERE id = ?`, [name, id]);
    if (old && old !== name) { try { fs.unlinkSync(fullPath(id, old)); } catch (e) { /* مش مهم */ } }
    audit.log(req, kind, id, '', name);
    res.json({ ok: true, file: name, size: f.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id(\\d+)/files/:kind(photo|passport)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const col = req.params.kind === 'photo' ? 'personal_photo' : 'passport_image';
    const row = (await db.query(`SELECT ${col} AS f FROM people WHERE id = ?`, [id]))[0];
    if (row && row.f) { try { fs.unlinkSync(fullPath(id, row.f)); } catch (e) { /* مش مهم */ } await db.query(`UPDATE people SET ${col} = NULL WHERE id = ?`, [id]); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id(\\d+)/file/:kind(photo|passport)', async (req, res) => {
  try {
    const row = (await db.query('SELECT id, personal_photo, passport_image FROM people WHERE id = ?', [req.params.id]))[0];
    const name = row && fileOf(row, req.params.kind);
    if (!name) return res.status(404).json({ error: 'مفيش ملف' });
    const p = fullPath(row.id, name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'الملف مش موجود على السيرفر' });
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* بيانات الإضافة: الحقول بأسماء المنصة + مشاكل (الإضافة بتملا حتى لو فيه مشاكل وبتعرضها) */
router.get('/:id(\\d+)/payload', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id);
    const r = F.resolve(json(row.data), profile && profile.data, { personalPhoto: row.personal_photo, personalPhotoSize: sizeOf(row.id, row.personal_photo), passportImage: row.passport_image });
    audit.log(req, 'fill', row.id, row.name_ar, '');
    res.json({ personId: row.id, name: row.name_ar, mofa: r.mofa, issues: r.issues, warns: r.warns, ready: r.ready, hasPhoto: !!row.personal_photo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* رقم الطلب: المنصة ساعات بتعرضه من غير حرف E (829944969) وفي الطباعة بالـ E (E829944969): بنخزّنه دايماً بالـ E */
const normApp = (v) => { const a = String(v || '').trim().toUpperCase().replace(/\s+/g, ''); return /^\d{6,12}$/.test(a) ? 'E' + a : a; };
async function recordResult(req, id, b) {
  const status = ['filled', 'submitted', 'ready', 'draft', 'waiting'].includes(b.status) ? b.status : null;
  if (!status) return { code: 400, body: { error: 'حالة غير معروفة' } };
  const app = b.appNumber ? normApp(b.appNumber) : null;
  if (app && !/^[A-Z]\d{6,12}$/.test(app)) return { code: 400, body: { error: 'رقم الطلب شكله غلط' } };
  const cur = (await db.query('SELECT name_ar, app_number, stages FROM people WHERE id = ?', [id]))[0];
  if (!cur) return { code: 404, body: { error: 'الشخص مش موجود' } };
  const stages = S.parse(cur.stages); let stagesChanged = false;
  const appDate = String(b.appDate || '').replace(/\//g, '-').match(/^\d{4}-\d{2}-\d{2}$/) ? String(b.appDate).replace(/\//g, '-') : '';
  /* «أحدث رقم طلب»: لو الرقم الجديد تاريخه أقدم من المسجّل، مبنغيّرش حاجة */
  if (app && appDate && cur.app_number && cur.app_number !== app && stages.sent.appDate && appDate < stages.sent.appDate) return { code: 200, body: { ok: true, ignored: true, reason: 'الرقم المسجّل (' + cur.app_number + ') أحدث (' + stages.sent.appDate + ')' } };
  if (app && appDate && stages.sent.appDate !== appDate) { stages.sent.appDate = appDate; stagesChanged = true; }
  if (app && cur.app_number && cur.app_number !== app) { stages.sent.history.unshift({ app: cur.app_number, at: new Date().toISOString().slice(0, 10) }); stagesChanged = true; } /* إعادة إرسال برقم طلب جديد: القديم بيتحفظ */
  if (status === 'submitted' && stages.sent.state !== 'done') { S.patch(stages, 'sent', { state: 'done' }); stagesChanged = true; }
  await db.query(`UPDATE people SET status = ?, app_number = COALESCE(?, app_number), filled_at = IF(? IN ('filled','submitted'), NOW(), filled_at)${stagesChanged ? ', stages = ?' : ''} WHERE id = ?`, stagesChanged ? [status, app, status, JSON.stringify(stages), id] : [status, app, status, id]);
  audit.log(req, status === 'filled' || status === 'submitted' ? status : 'status', id, cur.name_ar, app || status);
  return { code: 200, body: { ok: true, appNumber: app || cur.app_number || '' } };
}
/* نتيجة الإضافة: filled (اتملى) أو submitted (اتبعت + رقم الطلب) */
router.post('/:id(\\d+)/result', async (req, res) => {
  try { const r = await recordResult(req, parseInt(req.params.id, 10), req.body || {}); res.status(r.code).json(r.body); } catch (e) { res.status(500).json({ error: e.message }); }
});
/* الإضافة لقت رقم الطلب في صفحة المنصة من غير ما نعرف الشخص: بنطابقه برقم الجواز (لازم يتطابق مع شخص واحد بس) */
router.post('/result-by-passport', async (req, res) => {
  try {
    const b = req.body || {}; const pn = String(b.passportNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pn.length < 5) return res.status(400).json({ error: 'رقم الجواز ناقص' });
    const rows = await db.query('SELECT id FROM people WHERE passport_no = ? LIMIT 2', [pn]);
    if (!rows.length) return res.status(404).json({ error: 'مفيش شخص بالجواز ده في النظام', notFound: true });
    if (rows.length > 1) return res.status(409).json({ error: 'فيه أكتر من شخص بنفس رقم الجواز' });
    const r = await recordResult(req, rows[0].id, { ...b, status: 'submitted' }); res.status(r.code).json({ ...r.body, personId: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* «هات رقم إنجاز»: اللي محتاجه صفحة «البحث عن طلب مقدم» في المنصة (رقم الجواز + الجنسية + نوع التأشيرة + جهة القدوم) من بيانات الشخص وملف الضبط */
router.get('/:id(\\d+)/appno-lookup', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id);
    const m = F.resolve(json(row.data), profile && profile.data, {}).mofa;
    const st = S.parse(row.stages);
    res.json({ personId: row.id, name: row.name_ar, passportNo: m.PASSPORTnumber || '', nationality: m.NATIONALITY || 'EGY', visaType: m.VisaKind || '', visaTypeText: (F.OPT.visaKind.find((o) => String(o.v) === String(m.VisaKind)) || {}).t || '', embassy: m.EmbassyCode || '', appNumber: row.app_number || '', appDate: st.sent.appDate || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* خطابات الترشيح لكذا شخص مرة واحدة (ملف zip فيه Word لكل واحد): kind = suez | cairo | auto (حسب الممثلية: القاهرة 302، غير كده السويس) */
router.get('/letters-bundle', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 200); if (!ids.length) return res.status(400).json({ error: 'اختار أشخاص الأول' });
    const archiver = require('archiver'); const z = archiver('zip', { zlib: { level: 6 } }); const used = new Set();
    res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('nomination-letters.zip'));
    z.on('error', () => { try { res.destroy(); } catch (e) { /* مش مهم */ } }); z.pipe(res);
    for (const id of ids) {
      const row = (await db.query('SELECT * FROM people WHERE id = ?', [id]))[0]; if (!row) continue;
      const profile = await loadProfile(row.profile_id); const v = F.resolve(json(row.data), profile && profile.data, {}).values;
      const kind = ['suez', 'cairo'].includes(req.query.kind) ? req.query.kind : (String(v.embassy) === '302' ? 'cairo' : 'suez');
      let photo = null; try { if (row.personal_photo) photo = fs.readFileSync(fullPath(row.id, row.personal_photo)); } catch (e) { photo = null; }
      const buf = await letters.build(kind, letterVars(row, v), photo);
      let name = `${kind === 'cairo' ? 'القاهرة' : 'السويس'}-${String(v.passportNo || row.id).toUpperCase()}`; while (used.has(name)) name += '-' + row.id; used.add(name);
      z.append(buf, { name: name + '.docx' });
      audit.log(req, 'fill', row.id, row.name_ar, 'خطاب ترشيح ' + letters.KINDS[kind].label + ' (مجمّع)');
      try { await patchStage(row.id, 'letter', { state: 'done', note: letters.KINDS[kind].label }); } catch (e) { /* مش مهم */ }
    }
    z.finalize();
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); else try { res.destroy(); } catch (x) { /* مش مهم */ } }
});

/* بيانات حجز الفحص الطبي في وافد */
router.get('/:id(\\d+)/wafid', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id);
    const r = wafid.build(json(row.data), profile && profile.data);
    audit.log(req, 'fill', row.id, row.name_ar, 'وافد (الفحص الطبي)');
    res.json({ personId: row.id, name: row.name_ar, wafid: r.payload, issues: r.issues, warns: r.warns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* بيانات حجز المعمل (معامل الصحة العامة): رقم الطلب في إنجاز بيتكتب في «رقم الطلب (وثيقة إنجاز)» لو الموقع طلبه */
router.get('/:id(\\d+)/lab', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id);
    const r = lab.build(json(row.data), profile && profile.data, row.app_number);
    audit.log(req, 'fill', row.id, row.name_ar, 'حجز المعمل');
    res.json({ personId: row.id, name: row.name_ar, lab: r.payload, issues: r.issues, warns: r.warns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* خطابات الترشيح (Word): kind = suez | cairo ؛ ?check=1 بيرجّع النواقص بس */
router.get('/:id(\\d+)/letter/:kind(suez|cairo)', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id); const v = F.resolve(json(row.data), profile && profile.data, {}).values;
    const vars = letterVars(row, v);
    const c = letters.check(req.params.kind, vars);
    if (req.query.check) {
      /* رسائل واضحة: إيه الناقص، ومصدره فين، وإيه اللي هيختفي من الخطاب بسببه */
      const pn = profile ? profile.name : ''; const where = pn ? `ملف الضبط «${pn}»: اكتبه فيه ودوس حفظ` : 'الشخص مش مربوط بملف ضبط: اربطه بملف فيه البيانات';
      const H = { 'رقم التأشيرة': `رقم التأشيرة ناقص (${where}) — من غيره رقم التأشيرة والباركود التاني مش هيظهروا`, 'تاريخ التأشيرة': `تاريخ التأشيرة ناقص (${where})`, 'رقم إنجاز (رقم الطلب)': 'رقم إنجاز ناقص: رقم الطلب لسه مش مسجّل للشخص (بيتسجّل بعد «حفظ» في المنصة، أو اكتبه بإيدك في صفحة الشخص) — من غيره الباركود الأول مش هيظهر',
        'اسم جهة العمل': `اسم جهة العمل ناقص (${where})`, 'المهنة': `المهنة ناقصة (${where})`, 'رقم السجل (الرقم الموحد)': `الرقم الموحد ناقص (${where})`, 'الاسم': 'اسم الشخص بالعربي ناقص', 'رقم الجواز': 'رقم الجواز ناقص' };
      return res.json({ ...c, hints: c.issues.map((x) => H[x] || x + ' ناقص'), profileName: pn, hasPhoto: !!row.personal_photo });
    }
    let photo = null; try { if (row.personal_photo) photo = fs.readFileSync(fullPath(row.id, row.personal_photo)); } catch (e) { photo = null; }
    const buf = await letters.build(req.params.kind, vars, photo);
    audit.log(req, 'fill', row.id, row.name_ar, 'خطاب ترشيح ' + letters.KINDS[req.params.kind].label);
    try { await patchStage(row.id, 'letter', { state: 'done', note: letters.KINDS[req.params.kind].label }); } catch (e) { /* مش مهم */ }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('nomination-' + req.params.kind + '-' + (vars.passport || row.id) + '.docx'));
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* تعليم مرحلة لشخص (بيستخدمه الزرار الفردي والجماعي والخطابات) */
async function patchStage(id, key, body, req) {
  const row = (await db.query('SELECT name_ar, stages FROM people WHERE id = ?', [id]))[0]; if (!row) return null;
  const stages = S.parse(row.stages); if (!S.patch(stages, key, body || {})) return false;
  await db.query('UPDATE people SET stages = ? WHERE id = ?', [JSON.stringify(stages), id]);
  if (req) { const st = S.STAGES.find((x) => x.k === key); const c = stages[key]; audit.log(req, 'stage', id, row.name_ar, st.label + ': ' + (c.state === 'done' ? 'تم' : c.state === 'booked' ? 'محجوز' : 'لسه') + (c.date ? ' ' + c.date : '')); }
  return stages;
}
/* ===== تعليم جماعي: POST /bulk/stage | /bulk/status | /bulk/profile | /bulk/delete  body: { ids:[…], … } ===== */
const idsOf = (req) => [...new Set((Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map((x) => parseInt(x, 10)).filter(Boolean))].slice(0, 2000);
router.post('/bulk/stage', async (req, res) => {
  try {
    const ids = idsOf(req); const b = req.body || {}; if (!ids.length) return res.status(400).json({ error: 'اختار أشخاص الأول' });
    if (!S.STAGES.some((x) => x.k === b.key)) return res.status(400).json({ error: 'المرحلة مش صحيحة' });
    let ok = 0, skipped = 0;
    for (const id of ids) { const r = await patchStage(id, b.key, { state: b.state, ...(b.date !== undefined ? { date: b.date } : {}), ...(b.note !== undefined ? { note: b.note } : {}) }, req); if (r) ok++; else skipped++; }
    if (!ok && skipped) return res.status(400).json({ error: 'الحالة دي مش مسموحة للمرحلة دي' });
    res.json({ ok: true, updated: ok, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/bulk/status', async (req, res) => {
  try {
    const ids = idsOf(req); const status = String((req.body || {}).status || ''); if (!ids.length) return res.status(400).json({ error: 'اختار أشخاص الأول' });
    if (!['draft', 'ready', 'waiting', 'filled', 'submitted'].includes(status)) return res.status(400).json({ error: 'الحالة مش صحيحة' });
    await db.query(`UPDATE people SET status = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [status, ...ids]);
    audit.log(req, 'status', null, ids.length + ' شخص', 'تغيير الحالة جماعي: ' + status);
    res.json({ ok: true, updated: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/bulk/profile', P.need('people.edit'), async (req, res) => {
  try {
    const ids = idsOf(req); const pid = parseInt((req.body || {}).profileId, 10) || null; if (!ids.length) return res.status(400).json({ error: 'اختار أشخاص الأول' });
    if (pid && !(await loadProfile(pid))) return res.status(400).json({ error: 'ملف الضبط مش موجود' });
    await db.query(`UPDATE people SET profile_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [pid, ...ids]);
    audit.log(req, 'update', null, ids.length + ' شخص', 'نقل لملف ضبط جماعي');
    res.json({ ok: true, updated: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/bulk/delete', P.need('people.delete'), async (req, res) => {
  try {
    const ids = idsOf(req); if (!ids.length) return res.status(400).json({ error: 'اختار أشخاص الأول' });
    let n = 0;
    for (const id of ids) {
      const row = (await db.query('SELECT * FROM people WHERE id = ?', [id]))[0]; if (!row) continue;
      if (!['admin', 'manager'].includes(req.user.role) && row.created_by !== req.user.id) continue;
      await db.query('DELETE FROM people WHERE id = ?', [id]); try { fs.rmSync(peopleDir(id), { recursive: true, force: true }); } catch (e) { /* مش مهم */ }
      audit.log(req, 'delete', id, row.name_ar, 'حذف جماعي'); n++;
    }
    res.json({ ok: true, deleted: n, skipped: ids.length - n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* مراحل الطلب: state = '' | booked | done */
router.put('/:id(\\d+)/stages/:key', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = (await db.query('SELECT name_ar, stages FROM people WHERE id = ?', [id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const stages = S.parse(row.stages);
    if (!S.patch(stages, req.params.key, req.body || {})) return res.status(400).json({ error: 'المرحلة أو الحالة مش صحيحة' });
    await db.query('UPDATE people SET stages = ? WHERE id = ?', [JSON.stringify(stages), id]);
    const st = S.STAGES.find((x) => x.k === req.params.key); const c = stages[req.params.key];
    audit.log(req, 'stage', id, row.name_ar, st.label + ': ' + (c.state === 'done' ? 'تم' : c.state === 'booked' ? 'محجوز' : 'لسه') + (c.date ? ' ' + c.date : ''));
    res.json({ ok: true, stages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* MRZ: لصق سطرين ← بيانات جاهزة (مع فحص أرقام التحقق) */
/* تاريخ الإصدار مش في MRZ. الجواز المصري صلاحيته 7 سنين: الإصدار = الانتهاء − 7 سنين + يوم. تقدير بس ولازم يتراجع */
function issueGuess(m) {
  if (!m || m.nationality !== 'EGY' || !m.expiryDate) return {};
  const d = new Date(m.expiryDate + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - 7); d.setUTCDate(d.getUTCDate() + 1);
  return { issueDate: d.toISOString().slice(0, 10) };
}
function fromMrz(m, extra = {}) {
  if (!m) return null;
  const en = names.splitEnglish(m.surname, m.given);
  const nid = /^\d{14}$/.test(m.personalNumber) ? m.personalNumber : '';
  return {
    confidence: m.confidence, checks: m.checks, corrected: m.corrected, lines: m.lines,
    suggest: {
      passportNo: m.passportNumber, birthDate: m.birthDate, expiryDate: m.expiryDate, sex: m.sex === 'M' ? '1' : m.sex === 'F' ? '2' : '',
      nameEnFirst: en.first, nameEnFather: en.father, nameEnGrand: en.grand, nameEnFamily: en.family, nationalId: nid, ...extra
    },
    guess: issueGuess(m),
    warnings: names.lengthWarnings({ first: en.first, father: en.father, grand: en.grand, family: en.family }, { first: 'English First', father: 'English Father', grand: 'English Grand', family: 'English Family' })
  };
}
router.post('/mrz', (req, res) => {
  const m = mrz.parseMrzText(String((req.body && req.body.text) || ''));
  if (!m) return res.status(422).json({ error: 'مش لاقي سطري MRZ في النص. الصق السطرين (44 حرف كل واحد) زي ما هم.' });
  res.json(fromMrz(m));
});
router.post('/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'مفيش صورة' });
    const r = await ocr.readPassport(req.file.buffer, req.file.mimetype);
    const m = mrz.parseMrzText([r.mrz1, r.mrz2].filter(Boolean).join('\n'));
    const extra = {};
    if (r.nameAr) extra.nameAr = r.nameAr;
    if (r.birthPlaceEn || r.birthPlaceAr) extra.birthPlace = String(r.birthPlaceEn || r.birthPlaceAr).slice(0, 20);
    if (r.issueDate) extra.issueDate = r.issueDate;
    if (r.nationalId) extra.nationalId = r.nationalId;
    const warn = [];
    if (m && r.expiryDate && m.expiryDate && r.expiryDate !== m.expiryDate) warn.push('تاريخ الانتهاء المطبوع مختلف عن اللي في MRZ: راجعه');
    let out = fromMrz(m, extra);
    if (out && r.issueDate) out.guess = {};
    if (!out) out = { confidence: 'low', checks: {}, corrected: false, lines: ['', ''], suggest: extra, guess: {}, warnings: [] };
    out.warnings = (out.warnings || []).concat(warn);
    res.json({ mrz: out, mrzOk: !!m, printed: r });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
