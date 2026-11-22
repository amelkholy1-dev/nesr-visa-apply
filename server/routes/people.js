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

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxPassportBytes + 1 } });

const peopleDir = (id) => path.join(config.dataDir, 'people', String(id));
const fileOf = (row, kind) => (kind === 'photo' ? row.personal_photo : row.passport_image);
const fullPath = (id, name) => path.join(peopleDir(id), path.basename(String(name)));
const sizeOf = (id, name) => { try { return name ? fs.statSync(fullPath(id, name)).size : 0; } catch (e) { return 0; } };

async function loadProfile(id) {
  if (!id) return null;
  const p = (await db.query('SELECT id, name, data FROM profiles WHERE id = ?', [id]))[0];
  return p ? { id: p.id, name: p.name, data: json(p.data) } : null;
}
function brief(row, profile) {
  const r = F.resolve(json(row.data), profile && profile.data, { personalPhoto: row.personal_photo, personalPhotoSize: sizeOf(row.id, row.personal_photo), passportImage: row.passport_image });
  return { id: row.id, name: row.name_ar, passportNo: row.passport_no, status: row.status, profileId: row.profile_id, profileName: profile ? profile.name : '',
    appNumber: row.app_number, hasPhoto: !!row.personal_photo, hasPassport: !!row.passport_image, issues: r.issues.length, ready: r.ready, updatedAt: row.updated_at, filledAt: row.filled_at };
}

router.get('/', async (req, res) => {
  try {
    const where = [], vals = [];
    if (req.query.status) { where.push('status = ?'); vals.push(String(req.query.status)); }
    if (req.query.profile) { where.push('profile_id = ?'); vals.push(parseInt(req.query.profile, 10)); }
    if (req.query.q) { where.push('(name_ar LIKE ? OR passport_no LIKE ?)'); const q = `%${String(req.query.q).trim().replace(/[%_]/g, '')}%`; vals.push(q, q); }
    const rows = await db.query(`SELECT * FROM people ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`, vals);
    const profs = new Map((await db.query('SELECT id, name, data FROM profiles')).map(p => [p.id, { id: p.id, name: p.name, data: json(p.data) }]));
    res.json({ people: rows.map(r => brief(r, profs.get(r.profile_id))) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id(\\d+)', async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const profile = await loadProfile(row.profile_id);
    const files = { personalPhoto: row.personal_photo, personalPhotoSize: sizeOf(row.id, row.personal_photo), passportImage: row.passport_image };
    res.json({ person: { id: row.id, profileId: row.profile_id, status: row.status, appNumber: row.app_number, data: json(row.data), hasPhoto: !!row.personal_photo, hasPassport: !!row.passport_image, photoSize: files.personalPhotoSize },
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
      return res.json({ ok: true, id });
    }
    if (passportNo) {
      const dup = (await db.query('SELECT id, name_ar FROM people WHERE passport_no = ? LIMIT 1', [passportNo]))[0];
      if (dup && !b.allowDuplicate) return res.status(409).json({ error: `رقم الجواز ده متسجّل قبل كده (${dup.name_ar || '#' + dup.id})`, duplicateId: dup.id });
    }
    const r = await db.query('INSERT INTO people (profile_id, name_ar, passport_no, data, created_by) VALUES (?, ?, ?, ?, ?)', [profileId, nameAr, passportNo, JSON.stringify(data), req.user.id]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
router.post('/', (req, res) => save(req, res, null));
router.put('/:id(\\d+)', (req, res) => save(req, res, parseInt(req.params.id, 10)));

router.delete('/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = (await db.query('SELECT id, created_by FROM people WHERE id = ?', [id]))[0];
    if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    if (req.user.role !== 'admin' && row.created_by !== req.user.id) return res.status(403).json({ error: 'الحذف للمدير أو لمن أضافه' });
    await db.query('DELETE FROM people WHERE id = ?', [id]);
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
    res.json({ personId: row.id, name: row.name_ar, mofa: r.mofa, issues: r.issues, warns: r.warns, ready: r.ready, hasPhoto: !!row.personal_photo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* نتيجة الإضافة: filled (اتملى) أو submitted (اتبعت + رقم الطلب) */
router.post('/:id(\\d+)/result', async (req, res) => {
  try {
    const b = req.body || {}; const id = parseInt(req.params.id, 10);
    const status = ['filled', 'submitted', 'ready', 'draft', 'waiting'].includes(b.status) ? b.status : null;
    if (!status) return res.status(400).json({ error: 'حالة غير معروفة' });
    const app = b.appNumber ? String(b.appNumber).trim().toUpperCase() : null;
    if (app && !/^[A-Z]\d{6,12}$/.test(app)) return res.status(400).json({ error: 'رقم الطلب شكله غلط' });
    await db.query(`UPDATE people SET status = ?, app_number = COALESCE(?, app_number), filled_at = IF(? IN ('filled','submitted'), NOW(), filled_at) WHERE id = ?`, [status, app, status, id]);
    res.json({ ok: true });
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
