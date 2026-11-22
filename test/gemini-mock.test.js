'use strict';
/* اختبار مسار Gemini بخدمة وهمية (مش بنكلّم Google): بيتأكد إن الاسم العربي ومكان الميلاد والإصدار والـ MRZ بيرجعوا صح،
   وإن MRZ اللي فيه خرابيش آخر السطر بيعدّي، وإن الخدمة لو فشلت الرد بيبقى خطأ مفهوم. */
const assert = require('assert'); const http = require('http'); const os = require('os'); const path = require('path'); const fs = require('fs');
let answer = null;
const mock = http.createServer((req, res) => { req.resume(); req.on('end', () => { if (!answer) { res.statusCode = 500; return res.end('{}'); } res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })); }); });
mock.listen(3198, async () => {
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_NAME: process.env.TEST_DB_NAME || 'va1', DB_USER: process.env.TEST_DB_USER || 'u', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'p', AUTH_SECRET: 'g-secret-g-secret-g-secret', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin#12345', PORT: '3196', GEMINI_API_KEY: 'x', GEMINI_BASE_URL: 'http://127.0.0.1:3198', VISA_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'va-g-')) });
  const { server } = require('../server/server');
  const base = 'http://127.0.0.1:3196'; let cookie = '';
  for (let i = 0; i < 60; i++) { try { const j = await (await fetch(base + '/api/health')).json(); if (j.db && j.db.ready) break; } catch (e) { /* لسه */ } await new Promise((r) => setTimeout(r, 500)); }
  const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin#12345' }) });
  cookie = lg.headers.get('set-cookie').split(';')[0];
  const call = async () => { const fd = new FormData(); fd.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'p.jpg'); const r = await fetch(base + '/api/people/ocr', { method: 'POST', headers: { Cookie: cookie }, body: fd }); return { status: r.status, j: await r.json() }; };
  try {
    answer = { mrz1: 'P<EGYELSHAHAWY<<ATEF<FATHALLA<ABDELFATTAH<<L<L', mrz2: 'A454493650EGY8911012M3306231<<<<<<<<<K<<L<K<<', nameAr: 'عاطف فتح الله عبد الفتاح الشهاوي', birthPlaceEn: 'CAIRO', birthPlaceAr: 'القاهرة', issueDate: '2026-06-24', expiryDate: '2033-06-23', nationalId: '29001010100011' };
    let r = await call(); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.strictEqual(r.j.mrzOk, true); assert.strictEqual(r.j.mrz.confidence, 'high');
    const s = r.j.mrz.suggest;
    assert.strictEqual(s.nameAr, 'عاطف فتح الله عبد الفتاح الشهاوي'); assert.strictEqual(s.birthPlace, 'CAIRO'); assert.strictEqual(s.issueDate, '2026-06-24'); assert.strictEqual(s.nationalId, '29001010100011');
    assert.strictEqual(s.nameEnFirst, 'ATEF'); assert.strictEqual(s.nameEnFamily, 'ELSHAHAWY'); assert.strictEqual(s.passportNo, 'A45449365'); assert.deepStrictEqual(r.j.mrz.guess, {});
    /* MRZ ضايع: لسه الاسم العربي ومكان الميلاد بيرجعوا */
    answer = { mrz1: '', mrz2: '', nameAr: 'أحمد علي', birthPlaceEn: '', birthPlaceAr: 'الجيزة', issueDate: '', expiryDate: '' };
    r = await call(); assert.strictEqual(r.status, 200); assert.strictEqual(r.j.mrzOk, false); assert.strictEqual(r.j.mrz.suggest.nameAr, 'أحمد علي'); assert.strictEqual(r.j.mrz.suggest.birthPlace, 'الجيزة');
    /* الخدمة وقعت */
    answer = null; r = await call(); assert.strictEqual(r.status, 502);
    console.log('GEMINI MOCK OK');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { mock.close(); server.close(); setTimeout(() => process.exit(), 200); }
});
