'use strict';
/* اختبار مسار Gemini بخدمة وهمية (مش بنكلّم Google): بيتأكد إن الاسم العربي ومكان الميلاد والإصدار والـ MRZ بيرجعوا صح،
   وإن MRZ اللي فيه خرابيش آخر السطر بيعدّي، وإن الخدمة لو فشلت الرد بيبقى خطأ مفهوم. */
const assert = require('assert'); const http = require('http'); const os = require('os'); const path = require('path'); const fs = require('fs');
let answer = null;
const keysSeen = [];
const mock = http.createServer((req, res) => { req.resume(); req.on('end', () => {
  const key = String(req.headers['x-goog-api-key'] || ''); res.setHeader('Content-Type', 'application/json');
  if (key.startsWith('AIzaBAD')) { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })); }
  if (req.method === 'GET') return res.end(JSON.stringify({ name: 'models/x' })); /* تجربة المفتاح */
  keysSeen.push(key);
  if (key.startsWith('AIzaDAY')) { res.statusCode = 429; return res.end(JSON.stringify({ error: { message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, quota id: GenerateRequestsPerDayPerProjectPerModel-FreeTier', status: 'RESOURCE_EXHAUSTED' } })); }
  if (key.startsWith('AIzaMIN')) { res.statusCode = 429; return res.end(JSON.stringify({ error: { message: 'Quota exceeded, quota id: GenerateRequestsPerMinutePerProjectPerModel-FreeTier', status: 'RESOURCE_EXHAUSTED' } })); }
  if (!answer) { res.statusCode = 500; return res.end('{}'); }
  res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
}); });
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
    /* مفاتيح من «الإعدادات»: المجاني الأول، ولو خلصت كوتته (429 يومي) بيستريّح والمدفوع بيكمّل لوحده */
    const sapi = async (m, u, b) => { const r = await fetch(base + '/api' + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json(), text: JSON.stringify(await Promise.resolve(null)) }; };
    const DAY = 'AIzaDAYxxxxxxxxxxxxxxxxxxxxxxxxxxxxx01', PAID = 'AIzaPAIDxxxxxxxxxxxxxxxxxxxxxxxxxxxx2', BAD = 'AIzaBADxxxxxxxxxxxxxxxxxxxxxxxxxxxxx03', MIN = 'AIzaMINxxxxxxxxxxxxxxxxxxxxxxxxxxxxx04';
    let g = await sapi('POST', '/settings/gemini/keys', { label: 'مدفوع', key: PAID, paid: true }); assert.strictEqual(g.status, 200, JSON.stringify(g.j)); assert.ok(g.j.test.ok, 'المفتاح اتجرّب');
    g = await sapi('POST', '/settings/gemini/keys', { label: 'مجاني', key: DAY }); assert.strictEqual(g.status, 200);
    g = await sapi('POST', '/settings/gemini/keys', { label: 'غلط', key: BAD }); assert.strictEqual(g.j.test.ok, false, 'المفتاح الغلط باين'); const badId = g.j.id;
    assert.strictEqual((await sapi('POST', '/settings/gemini/keys', { label: 'تاني', key: DAY })).status, 409, 'المفتاح مكرر');
    assert.strictEqual((await sapi('POST', '/settings/gemini/keys', { key: 'short' })).status, 400);
    const ov = await sapi('GET', '/settings/gemini'); const raw = JSON.stringify(ov.j);
    assert.ok(!raw.includes(PAID) && !raw.includes(DAY) && /••••/.test(raw), 'المفاتيح مبترجعش للواجهة');
    const db = require('../server/db'); const stored = (await db.query("SELECT v FROM settings WHERE k = 'gemini'"))[0].v; assert.ok(!stored.includes(PAID) && !stored.includes(DAY), 'المفاتيح متخزّنة متشفّرة');
    await sapi('PUT', '/settings/gemini/keys/' + badId, { enabled: false });
    answer = { mrz1: '', mrz2: '', nameAr: 'تبديل', birthPlaceEn: '', birthPlaceAr: '', issueDate: '', expiryDate: '' }; keysSeen.length = 0;
    r = await call(); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.mrz.suggest.nameAr, 'تبديل');
    assert.deepStrictEqual(keysSeen, [DAY, PAID], 'المجاني الأول وبعده المدفوع: ' + JSON.stringify(keysSeen));
    let o2 = (await sapi('GET', '/settings/gemini')).j; const kDay = o2.keys.find((k) => k.label === 'مجاني'), kPaid = o2.keys.find((k) => k.label === 'مدفوع');
    assert.ok(kDay.resting && /اليوم/.test(kDay.lastError), 'المجاني مستريّح لحد بكرة: ' + JSON.stringify(kDay)); assert.strictEqual(kPaid.usedToday, 1);
    assert.ok(new Date(kDay.restUntil) - Date.now() > 60 * 1000, 'راحة لحد تجديد اليوم مش دقيقة');
    keysSeen.length = 0; r = await call(); assert.deepStrictEqual(keysSeen, [PAID], 'المستريّح مبيتجرّبش تاني');
    /* «المدفوع يتستخدم بس لما المجاني يخلص» مقفول ← الترتيب زي الجدول */
    await sapi('PUT', '/settings/gemini', { paidLast: false }); await sapi('PUT', '/settings/gemini/keys/' + kDay.id, { resetRest: true });
    keysSeen.length = 0; r = await call(); assert.deepStrictEqual(keysSeen, [PAID], 'الترتيب زي الجدول (المدفوع متضاف الأول)');
    /* كوتة الدقيقة: راحة دقيقة بس */
    g = await sapi('POST', '/settings/gemini/keys', { label: 'دقيقة', key: MIN }); await sapi('PUT', '/settings/gemini/keys/' + g.j.id, { move: 'up' }); await sapi('PUT', '/settings/gemini/keys/' + g.j.id, { move: 'up' }); await sapi('PUT', '/settings/gemini/keys/' + g.j.id, { move: 'up' });
    keysSeen.length = 0; r = await call(); assert.strictEqual(keysSeen[0], MIN); const kMin = (await sapi('GET', '/settings/gemini')).j.keys.find((k) => k.label === 'دقيقة');
    assert.ok(kMin.resting && new Date(kMin.restUntil) - Date.now() < 2 * 60 * 1000, 'كوتة الدقيقة: راحة قصيرة');
    assert.strictEqual((await sapi('PUT', '/settings/gemini', { model: 'bad model!' })).status, 400);
    assert.ok((await sapi('GET', '/meta')).j.ocr, 'القراءة التلقائية شغّالة');
    console.log('GEMINI MOCK OK');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { mock.close(); server.close(); setTimeout(() => process.exit(), 200); }
});
