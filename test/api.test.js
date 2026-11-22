'use strict';
/* اختبار كامل للـ API على قاعدة MySQL/MariaDB حقيقية (بيعمل جداول جديدة ويمسحها). التشغيل: TEST_DB_NAME=... TEST_DB_USER=... TEST_DB_PASSWORD=... node test/api.test.js */
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

Object.assign(process.env, {
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1', DB_NAME: process.env.TEST_DB_NAME || 'va1', DB_USER: process.env.TEST_DB_USER || 'u', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'p',
  AUTH_SECRET: 'test-secret-test-secret', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin#12345', PORT: '3199',
  VISA_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'va-data-'))
});
const db = require('../server/db');
const { server } = require('../server/server');
const base = 'http://127.0.0.1:3199';
let cookie = '';
const api = async (method, url, body, extra = {}) => {
  const headers = { ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) };
  const r = await fetch(base + url, { method, headers, body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined, redirect: 'manual', ...extra });
  const sc = r.headers.get('set-cookie'); if (sc && sc.includes('va_sid=') && !sc.includes('Max-Age=0')) cookie = sc.split(';')[0];
  let j = null; try { j = await r.clone().json(); } catch (e) { /* مش JSON */ }
  return { status: r.status, json: j, res: r };
};

(async () => {
  for (const t of ['people', 'profiles', 'users']) await db.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  // نستنى القاعدة
  for (let i = 0; i < 40 && !db.isReady(); i++) { if (i === 3) await db.init().catch(() => {}); await new Promise(r => setTimeout(r, 250)); }
  assert.ok(db.isReady(), 'القاعدة جاهزة');

  assert.strictEqual((await api('GET', '/api/people')).status, 401, 'من غير دخول مرفوض');
  assert.strictEqual((await api('POST', '/api/login', { username: 'admin', password: 'x' })).status, 401);
  const lg = await api('POST', '/api/login', { username: 'admin', password: 'Admin#12345' });
  assert.strictEqual(lg.status, 200); assert.strictEqual(lg.json.user.role, 'admin');
  assert.strictEqual((await api('GET', '/api/me')).json.user.username, 'admin');

  const meta = await api('GET', '/api/meta'); assert.ok(meta.json.options.visaKind.length >= 5 && meta.json.groups.length);

  // ملف ضبط
  const pr = await api('POST', '/api/profiles', { name: 'دفعة تجريبية', data: { visaKind: '38', nationality: 'EGY', embassy: '320', entriesText: 'سفرة واحدة', entryDays: '365', residence: '90',
    sponsorName: 'شركة تجربة', sponsorNumber: '7001185532', sponsorAddress: 'جدة', sponsorPhone: '0500000000', comingThrough: '2', entryPoint: '17', expectedEntryDate: '2027-01-15', passportType: '1', issueCountry: 'مصر',
    religion: '1', social: '2', degree: 'دبلوم', degreeSource: 'مصر', homeAddress: 'جدة حي الصفا', email: 'hr@example.com', jobClass: '832', jobText: 'سائق حافلة', hacked: 'x' } });
  assert.strictEqual(pr.status, 200); const profId = pr.json.id;
  const lp = await api('GET', '/api/profiles'); assert.ok(!('hacked' in lp.json.profiles[0].data), 'حقول مش معروفة بتتشال');

  // شخص ناقص ← مشاكل
  const created = await api('POST', '/api/people', { profileId: profId, data: { nameAr: 'بدر خليل بدر ابو العنين', passportNo: 'a42014007', nameEnFirst: 'BADR', nameEnFather: 'KHALIL', nameEnGrand: 'BADR', nameEnFamily: 'ABOUELENIN' } });
  assert.strictEqual(created.status, 200); const id = created.json.id;
  assert.strictEqual((await api('POST', '/api/people', { profileId: profId, data: { nameAr: 'تاني', passportNo: 'A42014007' } })).status, 409, 'جواز مكرر');
  let pl = (await api('GET', `/api/people/${id}/payload`)).json;
  assert.strictEqual(pl.mofa.PASSPORTnumber, 'A42014007'); assert.strictEqual(pl.mofa.AFIRSTNAME, 'بدر'); assert.strictEqual(pl.mofa.VisaKind, '38');
  assert.ok(pl.issues.some(x => x.includes('الصورة الشخصية')), 'الصورة ناقصة'); assert.ok(pl.issues.some(x => x.includes('تاريخ الميلاد')));
  assert.strictEqual(pl.ready, false);

  // MRZ
  const cd = require('../server/mrz').checkDigit;
  const noF = 'A42014007', dob = '830101', ex = '320701', per = '29001010100011';
  const body = noF + cd(noF) + 'EGY' + dob + cd(dob) + 'M' + ex + cd(ex) + per + cd(per);
  const l2 = body + cd(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
  const l1 = 'P<EGYABOUELENIN<<BADR<KHALIL<BADR'.padEnd(44, '<');
  const m = await api('POST', '/api/people/mrz', { text: l1 + '\n' + l2 });
  assert.strictEqual(m.status, 200); assert.strictEqual(m.json.confidence, 'high'); assert.strictEqual(m.json.suggest.sex, '1'); assert.strictEqual(m.json.suggest.nameEnFamily, 'ABOUELENIN');
  assert.strictEqual((await api('POST', '/api/people/mrz', { text: 'hello' })).status, 422);
  assert.strictEqual((await api('POST', '/api/people/ocr', new FormData())).status, 400);

  // الصور
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const fd = new FormData(); fd.append('file', new Blob([jpg], { type: 'image/jpeg' }), 'p.jpg');
  assert.strictEqual((await api('POST', `/api/people/${id}/files/photo`, fd)).status, 200);
  const big = new FormData(); big.append('file', new Blob([Buffer.alloc(1100 * 1024, 1)], { type: 'image/jpeg' }), 'big.jpg');
  assert.strictEqual((await api('POST', `/api/people/${id}/files/photo`, big)).status, 413, 'أكبر من 1 ميجا مرفوض');
  const txt = new FormData(); txt.append('file', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
  assert.strictEqual((await api('POST', `/api/people/${id}/files/photo`, txt)).status, 400);
  const fr = await api('GET', `/api/people/${id}/file/photo`); assert.strictEqual(fr.status, 200); assert.ok(fr.res.headers.get('content-type').includes('image'));

  // تعديل بالبيانات الناقصة ← جاهز
  const up = await api('PUT', `/api/people/${id}`, { profileId: profId, data: { nameAr: 'بدر خليل بدر ابو العنين', passportNo: 'A42014007', nameEnFirst: 'BADR', nameEnFather: 'KHALIL', nameEnGrand: 'BADR', nameEnFamily: 'ABOUELENIN',
    issueDate: '2024-07-01', expiryDate: '2032-07-01', birthDate: '1983-01-01', birthPlace: 'Cairo', nationalId: '29001010100011', sex: '1' } });
  assert.strictEqual(up.status, 200);
  pl = (await api('GET', `/api/people/${id}/payload`)).json;
  assert.strictEqual(pl.ready, true, 'جاهز: ' + pl.issues.join('|'));
  assert.strictEqual(pl.mofa.BIRTH_DATE, '1983/01/01'); assert.strictEqual(pl.mofa.ExpectedEntryDate, '2027/01/15');
  // أسماء أطول من 15
  await api('PUT', `/api/people/${id}`, { profileId: profId, data: { nameAr: 'x', passportNo: 'A42014007', nameEnFamily: 'ABDELRAHMANELSAYEDX' } });
  assert.ok((await api('GET', `/api/people/${id}/payload`)).json.issues.some(x => x.includes('Family Name')), 'طول الاسم');

  // نتيجة الإضافة
  assert.strictEqual((await api('POST', `/api/people/${id}/result`, { status: 'submitted', appNumber: 'e828935966' })).status, 200);
  assert.strictEqual((await api('POST', `/api/people/${id}/result`, { status: 'submitted', appNumber: 'zzz' })).status, 400);
  const list = (await api('GET', '/api/people?status=submitted')).json.people; assert.strictEqual(list.length, 1); assert.strictEqual(list[0].appNumber, 'E828935966');
  assert.strictEqual((await api('GET', '/api/stats')).json.byStatus.submitted, 1);
  assert.strictEqual((await api('POST', `/api/people/${id}/result`, { status: 'waiting' })).status, 200);
  assert.ok(((await api('GET', '/api/people?status=waiting')).json.people || []).some((p) => p.id === id), 'فلتر مستني تأمين الجواز');

  // مستخدمين
  assert.strictEqual((await api('POST', '/api/users', { username: 'emp1', password: 'Employee#123', name: 'موظف' })).status, 200);
  const adminCookie = cookie; cookie = '';
  assert.strictEqual((await api('POST', '/api/login', { username: 'emp1', password: 'Employee#123' })).status, 200);
  assert.strictEqual((await api('GET', '/api/users')).status, 403, 'موظف مش مدير');
  assert.strictEqual((await api('DELETE', `/api/profiles/${profId}`)).status, 403);
  cookie = adminCookie;
  assert.strictEqual((await api('DELETE', `/api/profiles/${profId}`)).status, 409, 'ملف مربوط بأشخاص');
  assert.strictEqual((await api('DELETE', `/api/people/${id}`)).status, 200);
  assert.strictEqual((await api('DELETE', `/api/profiles/${profId}`)).status, 200);

  // سجل النشاط + التقارير + الانتهاء
  const F = require('../server/fields');
  assert.strictEqual(F.expiryInfo('2020-01-01', '2026-12-01').expired, true);
  assert.strictEqual(F.expiryInfo('2026-12-30', '2026-12-01', new Date('2026-11-01T10:00:00Z')).short, true, 'أقل من 6 شهور من الدخول');
  assert.strictEqual(F.expiryInfo('2031-01-01', '2026-12-01', new Date('2026-11-01T10:00:00Z')).short, false);
  await new Promise((r) => setTimeout(r, 400));
  const act = await api('GET', '/api/activity');
  assert.strictEqual(act.status, 200); assert.ok(act.json.rows.some((x) => x.action === 'create') && act.json.rows.some((x) => x.action === 'submitted'), 'السجل فيه الإضافة والإرسال');
  assert.ok(act.json.rows.some((x) => x.action === 'login'), 'الدخول اتسجّل');
  const evil = await api('POST', '/api/people', { data: { nameAr: '=HYPERLINK("http://x")', passportNo: 'ZZ99999', birthDate: '1990-01-01' } });
  const sum = await api('GET', '/api/reports/summary');
  assert.strictEqual(sum.status, 200); assert.ok(sum.json.total >= 1 && Array.isArray(sum.json.daily) && sum.json.users.length >= 1);
  const csvRes = await fetch(base + '/api/reports/export.csv', { headers: { Cookie: cookie } }); const csvBuf = Buffer.from(await csvRes.arrayBuffer()); const csv = csvBuf.toString('utf8');
  assert.strictEqual(csvRes.status, 200); assert.ok(csv.startsWith('﻿"م"'), 'CSV بـ BOM عشان Excel'); assert.ok(csv.split('\r\n').length >= 2);
  const csv2 = await (await fetch(base + '/api/reports/export.csv', { headers: { Cookie: cookie } })).text();
  assert.ok(csv2.includes('"\'=HYPERLINK') && !csv2.includes(',"=HYPERLINK'), 'حماية من صيغ Excel');
  await api('DELETE', `/api/people/${evil.json.id}`);

  // مراحل الطلب + إعادة الإرسال + تصدير تسهيل + إعدادات الطباعة
  const sp = await api('POST', '/api/people', { data: { nameAr: 'مراحل تجربة', passportNo: 'ST12345', birthDate: '1990-02-03', issueDate: '2024-01-02', expiryDate: '2031-01-01', sex: '1', phone: '01000000000', nameEnFirst: 'ALI', nameEnFather: 'OMAR', nameEnFamily: 'SAID', birthPlace: 'Cairo', email: 'a@b.com' } });
  const spid = sp.json.id;
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/medical`, { state: 'booked', date: '2026-12-01', note: 'مستشفى كذا' })).status, 200);
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/insurance`, { state: 'booked' })).status, 400, 'الحجز للفحص والبصمة بس');
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/zzz`, { state: 'done' })).status, 400);
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/fee`, { state: 'done' })).status, 200);
  const g1 = (await api('GET', `/api/people/${spid}`)).json.person.stages;
  assert.strictEqual(g1.medical.state, 'booked'); assert.strictEqual(g1.medical.date, '2026-12-01'); assert.strictEqual(g1.fee.state, 'done'); assert.ok(g1.fee.date, 'تاريخ تلقائي');
  await api('POST', `/api/people/${spid}/result`, { status: 'submitted', appNumber: 'E111111111' });
  await api('POST', `/api/people/${spid}/result`, { status: 'submitted', appNumber: 'E222222222' });
  const g2 = (await api('GET', `/api/people/${spid}`)).json.person;
  assert.strictEqual(g2.stages.sent.state, 'done'); assert.strictEqual(g2.appNumber, 'E222222222'); assert.deepStrictEqual(g2.stages.sent.history.map((h) => h.app), ['E111111111'], 'رقم الطلب القديم اتحفظ');
  assert.ok(((await api('GET', '/api/people')).json.people.find((p) => p.id === spid) || {}).stages.medical.state === 'booked', 'المراحل في القايمة');
  const tx = await fetch(base + `/api/export/tasheel.xlsx?ids=${spid}&fmt=DD-Mon-YYYY`, { headers: { Cookie: cookie } }); const txb = Buffer.from(await tx.arrayBuffer());
  assert.strictEqual(tx.status, 200); assert.strictEqual(txb.slice(0, 2).toString(), 'PK'); fs.writeFileSync(path.join(os.tmpdir(), 'tasheel-test.xlsx'), txb);
  const ps = await api('GET', '/api/settings/print'); assert.strictEqual(ps.status, 200); assert.ok(ps.json.undertaking.includes('{{name}}'));
  assert.strictEqual((await api('PUT', '/api/settings/print', { company: 'شركة تجربة', dateFormat: 'YYYY-MM-DD' })).status, 200);
  assert.strictEqual((await api('GET', '/api/settings/print')).json.company, 'شركة تجربة');
  const rs = await api('GET', '/api/reports/summary'); assert.ok(rs.json.stages && rs.json.stages.medical.booked >= 1);
  const wp = await api('GET', `/api/people/${spid}/wafid`); assert.strictEqual(wp.status, 200);
  assert.deepStrictEqual([wp.json.wafid.first, wp.json.wafid.last, wp.json.wafid.passport, wp.json.wafid.gender, wp.json.wafid.dob, wp.json.wafid.phone], ['ALI', 'SAID', 'ST12345', 'male', '1990-02-03', '+201000000000']);
  assert.ok(wp.json.issues.some((x) => x.includes('مدينة الفحص')), 'مدينة الفحص ناقصة بتتعلّم');
  await api('DELETE', `/api/people/${spid}`);

  // حماية: طلب من مصدر تاني
  const csrf = await fetch(base + '/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  assert.strictEqual(csrf.status, 403);
  // الإضافة مضغوطة
  const z = await fetch(base + '/api/extension.zip', { headers: { Cookie: cookie } });
  console.log('extension.zip status', z.status);

  console.log('API OK');
  server.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
