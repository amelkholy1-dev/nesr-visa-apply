'use strict';
/* اختبار كامل للـ API على قاعدة MySQL/MariaDB حقيقية (بيعمل جداول جديدة ويمسحها). التشغيل: TEST_DB_NAME=... TEST_DB_USER=... TEST_DB_PASSWORD=... node test/api.test.js */
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

Object.assign(process.env, {
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1', DB_NAME: process.env.TEST_DB_NAME || 'va1', DB_USER: process.env.TEST_DB_USER || 'u', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'p',
  AUTH_SECRET: 'test-secret-test-secret', PRINT_AGENT_KEY: 'test-print-key-0123456789abcdef', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin#12345', PORT: '3199',
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
  assert.strictEqual(pl.mofa.BIRTH_DATE, '1983/01/01'); assert.strictEqual(pl.mofa.ExpectedEntryDate, require('../server/fields').autoEntryDate().replace(/-/g, '/'), 'التاريخ المتوقع تلقائي: النهارده + 17');
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

  // مراحل الطلب + إعادة الإرسال + تصدير تساهيل + إعدادات الطباعة
  const sp = await api('POST', '/api/people', { data: { nameAr: 'مراحل تجربة', passportNo: 'ST12345', birthDate: '1990-02-03', issueDate: '2024-01-02', expiryDate: '2031-01-01', sex: '1', phone: '01000000000', nameEnFirst: 'ALI', nameEnFather: 'OMAR', nameEnFamily: 'SAID', birthPlace: 'Cairo', email: 'a@b.com' } });
  const spid = sp.json.id;
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/medical`, { state: 'booked', date: '2026-12-01', note: 'مستشفى كذا' })).status, 200);
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/sent`, { state: 'booked' })).status, 400, 'الحجز للفحص الطبي بس');
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/zzz`, { state: 'done' })).status, 400);
  assert.strictEqual((await api('PUT', `/api/people/${spid}/stages/sent`, { state: 'done' })).status, 200);
  const g1 = (await api('GET', `/api/people/${spid}`)).json.person.stages;
  assert.strictEqual(g1.medical.state, 'booked'); assert.strictEqual(g1.medical.date, '2026-12-01'); assert.strictEqual(g1.sent.state, 'done'); assert.ok(g1.sent.date, 'تاريخ تلقائي');
  await api('POST', `/api/people/${spid}/result`, { status: 'submitted', appNumber: 'E111111111' });
  await api('POST', `/api/people/${spid}/result`, { status: 'submitted', appNumber: 'E222222222' });
  const g2 = (await api('GET', `/api/people/${spid}`)).json.person;
  assert.strictEqual(g2.stages.sent.state, 'done'); assert.strictEqual(g2.appNumber, 'E222222222'); assert.deepStrictEqual(g2.stages.sent.history.map((h) => h.app), ['E111111111'], 'رقم الطلب القديم اتحفظ');
  assert.ok(((await api('GET', '/api/people')).json.people.find((p) => p.id === spid) || {}).stages.medical.state === 'booked', 'المراحل في القايمة');
  const tx = await fetch(base + `/api/export/tasaheel.xls?ids=${spid}&fmt=DD-Mon-YYYY`, { headers: { Cookie: cookie } }); const txb = Buffer.from(await tx.arrayBuffer());
  assert.strictEqual(tx.status, 200); assert.strictEqual(txb.slice(0, 4).toString('hex'), 'd0cf11e0'); fs.writeFileSync(path.join(os.tmpdir(), 'tasaheel-test.xls'), txb); assert.ok(txb.length > 4096 && txb.includes(Buffer.from('Bio_Applicant_Details', 'latin1')), 'ورقة تساهيل جوه الملف');
  const old = await fetch(base + `/api/export/tasheel.xlsx?ids=${spid}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.strictEqual(old.status, 302); assert.strictEqual(old.headers.get('location'), `/api/export/tasaheel.xls?ids=${spid}`, 'الرابط القديم بيودّي للجديد');
  assert.ok(String(tx.headers.get('content-disposition')).includes('ST12345.xls'), 'شخص واحد: اسم الملف رقم الجواز زي مثال تساهيل');
  const labp = await api('GET', `/api/people/${spid}/lab`); assert.strictEqual(labp.status, 200);
  assert.deepStrictEqual([labp.json.lab.natType, labp.json.lab.destination, labp.json.lab.passport, labp.json.lab.fullName, labp.json.lab.phone, labp.json.lab.netNumber], ['1', '2182', 'ST12345', 'ALI OMAR SAID', '+201000000000', 'E222222222'], 'بيانات حجز المعمل');
  assert.ok(labp.json.issues.some((x) => x.includes('الرقم القومي')), 'الرقم القومي ناقص بيتعلّم');
  assert.strictEqual((await api('GET', '/api/settings/profile-template')).json.auto, false, 'الافتراضي مقفول');
  assert.strictEqual((await api('PUT', '/api/settings/profile-template', { auto: true })).status, 200); assert.strictEqual((await api('GET', '/api/settings/profile-template')).json.auto, true);
  assert.strictEqual((await api('PUT', '/api/settings/profile-template', { auto: false })).status, 200);
  const lcheck = await api('GET', `/api/people/${spid}/letter/cairo?check=1`); assert.strictEqual(lcheck.status, 200); assert.ok(lcheck.json.issues.includes('رقم التأشيرة') && lcheck.json.issues.includes('رقم السجل (الرقم الموحد)'), 'نواقص خطاب القاهرة');
  const ldoc = await fetch(base + `/api/people/${spid}/letter/suez`, { headers: { Cookie: cookie } }); const ldb = Buffer.from(await ldoc.arrayBuffer());
  assert.strictEqual(ldoc.status, 200); assert.strictEqual(ldb.slice(0, 2).toString(), 'PK'); assert.ok(decodeURIComponent(String(ldoc.headers.get('content-disposition'))).includes('مراحل تجربة - خطاب السويس.docx'), 'اسم ملف الخطاب = اسم الشخص + خطاب السويس: ' + decodeURIComponent(String(ldoc.headers.get('content-disposition')))); assert.ok(String(ldoc.headers.get('content-type')).includes('wordprocessingml'));
  assert.strictEqual((await api('GET', `/api/people/${spid}/letter/zzz`)).status, 404, 'نوع خطاب مش معروف');
  assert.strictEqual((await api('GET', `/api/people/${spid}`)).json.person.stages.letter.state, 'done', 'تحميل الخطاب علّم مرحلة «خطاب الترشيح» لوحده'); assert.ok(lcheck.json.hints.length > 0);
  /* شخص مربوط بملف ضبط فيه بيانات التأشيرة: الخطاب لازم يطلع فيه رقم التأشيرة والباركودين */
  const lprof = await api('POST', '/api/profiles', { name: 'ملف خطابات', data: { visaNumber: '1306311796', unifiedNumber: '7001185532', sponsorName: 'شركة تجربة للنقل', visaDate: '1448/02/30', jobText: 'سائق حافلة', degree: 'دبلوم', boxNumber: '464', agencyNumber: '30000001' } });
  const lperson = await api('POST', '/api/people', { profileId: lprof.json.id, data: { nameAr: 'محمد أحمد علي', passportNo: 'LT1234567' } });
  await api('POST', `/api/people/${lperson.json.id}/result`, { status: 'submitted', appNumber: 'E823565987' });
  assert.deepStrictEqual((await api('GET', `/api/people/${lperson.json.id}/letter/suez?check=1`)).json.issues, [], 'مفيش نواقص لو الملف فيه البيانات');
  assert.ok(lcheck.json.hints.some((h) => h.includes('رقم التأشيرة ناقص') && h.includes('الباركود')), 'رسالة النواقص بتقول المصدر وإيه اللي هيختفي');
  for (const kind of ['suez', 'cairo']) {
    const r = await fetch(base + `/api/people/${lperson.json.id}/letter/${kind}`, { headers: { Cookie: cookie } }); const b = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(os.tmpdir(), `letter-${kind}-test.docx`), b); assert.strictEqual(r.status, 200);
  }
  await api('DELETE', `/api/people/${lperson.json.id}`);
  const ps = await api('GET', '/api/settings/print'); assert.strictEqual(ps.status, 200); assert.ok(ps.json.dateFormat);
  assert.strictEqual((await api('PUT', '/api/settings/print', { company: 'شركة تجربة', dateFormat: 'YYYY-MM-DD' })).status, 200);
  assert.strictEqual((await api('GET', '/api/settings/print')).json.company, 'شركة تجربة');
  const rs = await api('GET', '/api/reports/summary'); assert.ok(rs.json.stages && rs.json.stages.medical.booked >= 1);
  const wp = await api('GET', `/api/people/${spid}/wafid`); assert.strictEqual(wp.status, 200);
  assert.deepStrictEqual([wp.json.wafid.first, wp.json.wafid.last, wp.json.wafid.passport, wp.json.wafid.gender, wp.json.wafid.dob, wp.json.wafid.phone], ['ALI', 'SAID', 'ST12345', 'male', '1990-02-03', '+201000000000']);
  assert.strictEqual(wp.json.wafid.autoDeclare, false, 'الإقرار مش متفعّل من غير الإعداد');
  assert.ok(wp.json.issues.some((x) => x.includes('مدينة الفحص')), 'مدينة الفحص ناقصة بتتعلّم');
  await api('DELETE', `/api/people/${spid}`);


  // ===== تعليم جماعي + جاهزية الخدمات + إحصائيات =====
  const mkp = async (n, pass) => (await api('POST', '/api/people', { profileId: lprof.json.id, data: { nameAr: n, passportNo: pass } })).json.id;
  const b1 = await mkp('جماعي واحد', 'BK0000001'); const b2 = await mkp('جماعي اتنين', 'BK0000002');
  let r = await api('POST', '/api/people/bulk/stage', { ids: [b1, b2], key: 'lab', state: 'booked', date: '2026-12-05' });
  assert.deepStrictEqual([r.status, r.json.updated], [200, 2]);
  const g3 = (await api('GET', `/api/people/${b1}`)).json.person.stages; assert.deepStrictEqual([g3.lab.state, g3.lab.date], ['booked', '2026-12-05']);
  assert.strictEqual((await api('POST', '/api/people/bulk/stage', { ids: [b1], key: 'sent', state: 'booked' })).status, 400, 'الحجز للمراحل اللي ليها حجز بس');
  assert.strictEqual((await api('POST', '/api/people/bulk/stage', { ids: [b1], key: 'zzz', state: 'done' })).status, 400);
  assert.strictEqual((await api('POST', '/api/people/bulk/status', { ids: [b1, b2], status: 'waiting' })).json.updated, 2);
  const lst = (await api('GET', '/api/people?status=waiting')).json.people; assert.ok(lst.length >= 2 && lst[0].service && Array.isArray(lst[0].service.wafid) && 'mofa' in lst[0].service && 'suez' in lst[0].service, 'جاهزية كل خدمة في القايمة');
  const st = await api('GET', '/api/stats/overview'); assert.strictEqual(st.status, 200);
  assert.ok(st.json.total >= 2 && st.json.stages.lab.booked >= 2 && st.json.byStatus.waiting >= 2 && Array.isArray(st.json.daily) && st.json.daily.length === 30, 'شكل الإحصائيات: ' + JSON.stringify({ t: st.json.total, lab: st.json.stages.lab, w: st.json.byStatus.waiting, d: st.json.daily.length }));
  const visaRow = st.json.visas.find((v) => v.id === lprof.json.id); assert.ok(visaRow && visaRow.total >= 2 && visaRow.visaNumber === '1306311796' && visaRow.stages.lab.booked >= 2 && visaRow.service.suez >= 0, 'صف التأشيرة في الإحصائيات');
  assert.strictEqual((await api('POST', '/api/people/bulk/profile', { ids: [b1], profileId: null })).json.updated, 1);
  r = await api('POST', '/api/people/bulk/delete', { ids: [b1, b2] }); assert.deepStrictEqual([r.json.deleted, r.json.skipped], [2, 0]);
  assert.strictEqual((await api('GET', '/api/brand')).json.brand.length > 0, true, 'اسم النظام');

  // ===== الصلاحيات =====
  const adminCookie2 = cookie; const pp = await mkp('شخص الصلاحيات', 'PP0000001');
  const um = await api('GET', '/api/users'); assert.ok(um.json.roles.length >= 4 && um.json.perms['people.view'] && um.json.users.find((u) => u.username === 'admin').perms.includes('users.manage'));
  const PW = 'Passw0rd!xx';
  assert.strictEqual((await api('POST', '/api/users', { username: 'viewer1', password: PW, name: 'مشاهد', role: 'viewer' })).status, 200);
  assert.strictEqual((await api('POST', '/api/users', { username: 'mark1', password: PW, name: 'معلّم', perms: ['people.view', 'people.mark'] })).status, 200);
  assert.strictEqual((await api('POST', '/api/users', { username: 'staff1', password: PW, name: 'موظف', role: 'staff' })).status, 200);
  const mk1 = (await api('GET', '/api/users')).json.users.find((u) => u.username === 'mark1'); assert.deepStrictEqual([mk1.role, mk1.custom], ['custom', true]);
  const loginAs = async (u) => { cookie = ''; const x = await api('POST', '/api/login', { username: u, password: PW }); assert.strictEqual(x.status, 200); return x.json.user; };
  let who = await loginAs('viewer1'); assert.strictEqual(who.role, 'viewer');
  assert.strictEqual((await api('GET', '/api/people')).status, 200); assert.strictEqual((await api('GET', '/api/stats/overview')).status, 200);
  for (const [m, u, b] of [['POST', '/api/people', { data: { nameAr: 'x', passportNo: 'ZZ1' } }], ['PUT', `/api/people/${pp}/stages/lab`, { state: 'done' }], ['POST', '/api/people/bulk/status', { ids: [pp], status: 'ready' }], ['GET', `/api/people/${pp}/letter/suez`], ['GET', `/api/people/${pp}/appno-lookup`], ['GET', '/api/activity'], ['GET', '/api/users'], ['POST', '/api/profiles', { name: 'x', data: {} }], ['GET', '/api/export/tasaheel.xls?ids=1']]) assert.strictEqual((await api(m, u, b)).status, 403, 'المشاهد ممنوع: ' + m + ' ' + u);
  await loginAs('mark1');
  assert.strictEqual((await api('POST', '/api/people/bulk/status', { ids: [pp], status: 'ready' })).status, 200, 'الصلاحية المخصّصة (تعليم) شغّالة');
  assert.strictEqual((await api('POST', '/api/people', { data: { nameAr: 'x', passportNo: 'ZZ2' } })).status, 403); assert.strictEqual((await api('GET', `/api/people/${pp}/letter/suez`)).status, 403);
  who = await loginAs('staff1'); assert.strictEqual(who.role, 'staff');
  const al = await api('GET', `/api/people/${pp}/appno-lookup`); assert.strictEqual(al.status, 200, 'الموظف يقدر يجيب بيانات رقم إنجاز');
  assert.strictEqual(al.json.passportNo, 'PP0000001'); assert.strictEqual(al.json.nationality, 'EGY'); assert.ok('visaType' in al.json && 'embassy' in al.json && 'appNumber' in al.json);
  assert.strictEqual((await api('GET', `/api/people/${pp}/letter/suez?check=1`)).status, 200); assert.strictEqual((await api('GET', '/api/activity')).status, 403); assert.strictEqual((await api('GET', '/api/users')).status, 403);
  cookie = adminCookie2;
  assert.strictEqual((await api('PUT', `/api/users/${um.json.users.find((u) => u.username === 'admin').id}`, { role: 'viewer' })).status, 400, 'المدير مينزّلش صلاحية نفسه');
  assert.strictEqual((await api('PUT', `/api/users/${mk1.id}`, { role: 'staff' })).status, 200); assert.strictEqual((await api('GET', '/api/users')).json.users.find((u) => u.username === 'mark1').role, 'staff');

  /* ===== الحسابات / الأرشفة / النماذج / معالجة الصورة / أحدث رقم طلب ===== */
  const bp = await api('POST', '/api/profiles', { name: 'دفعة الحسابات', data: { fee: '4500', visaKind: '38' } }); assert.strictEqual(bp.status, 200);
  const ap1 = (await api('POST', '/api/people', { profileId: bp.json.id, data: { nameAr: 'شخص حسابات ١', passportNo: 'AC0000001' } })).json.id;
  const ap2 = (await api('POST', '/api/people', { profileId: bp.json.id, data: { nameAr: 'شخص حسابات ٢', passportNo: 'AC0000002', fee: '3000' } })).json.id;
  let pb = (await api('GET', `/api/people/${ap1}/payments`)).json; assert.deepStrictEqual([pb.fee, pb.feeSource, pb.paid, pb.remaining, pb.state], [4500, 'batch', 0, 4500, 'unpaid']);
  pb = (await api('GET', `/api/people/${ap2}/payments`)).json; assert.deepStrictEqual([pb.fee, pb.feeSource], [3000, 'person'], 'تكلفة الشخص بتغلب تكلفة الدفعة');
  assert.strictEqual((await api('POST', `/api/people/${ap1}/payments`, { amount: 'abc' })).status, 400); assert.strictEqual((await api('POST', `/api/people/${ap1}/payments`, { amount: 0 })).status, 400);
  /* الخزينة: أول تشغيل بيعمل «الخزينة - نقدي»، ونضيف محفظة فودافون كاش */
  let tr = (await api('GET', '/api/treasury')).json; assert.ok(tr.wallets.some((w) => w.name === 'الخزينة - نقدي'), 'محفظة نقدي افتراضية'); const cashW = tr.wallets.find((w) => w.name === 'الخزينة - نقدي').id;
  assert.strictEqual((await api('POST', '/api/treasury/wallets', { name: '' })).status, 400); assert.strictEqual((await api('POST', `/api/people/${ap1}/payments`, { amount: 5, walletId: 99999 })).status, 400, 'محفظة مش موجودة');
  const vfW = (await api('POST', '/api/treasury/wallets', { name: 'فودافون كاش', kind: 'wallet', number: '01000000000', opening: 100 })).json.id;
  assert.ok((await api('GET', `/api/people/${ap1}/payments`)).json.wallets.some((w) => w.id === vfW), 'المحافظ ظاهرة في الدفع');
  const pay1 = await api('POST', `/api/people/${ap1}/payments`, { amount: 2000, walletId: vfW, note: 'عربون', date: '2026-11-20' }); assert.strictEqual(pay1.status, 200); assert.deepStrictEqual([pay1.json.paid, pay1.json.remaining, pay1.json.state], [2000, 2500, 'partial']);
  assert.strictEqual((await api('POST', `/api/people/${ap1}/payments`, { amount: 2500 })).json.state, 'paid'); /* طريقة مش معروفة بتترجّع «كاش» */
  pb = (await api('GET', `/api/people/${ap1}/payments`)).json; assert.deepStrictEqual([pb.paid, pb.remaining, pb.state, pb.payments.length], [4500, 0, 'paid', 2]); assert.ok(pb.payments.some((x) => x.method === 'فودافون كاش' && x.date === '2026-11-20' && x.note === 'عربون') && pb.payments.some((x) => x.method === 'الخزينة - نقدي'));
  const lst2 = (await api("GET", "/api/people")).json.people; assert.strictEqual(lst2.find((x) => x.id === ap1).pay.state, "paid"); assert.strictEqual(lst2.find((x) => x.id === ap2).pay.remaining, 3000);
  let acc = (await api('GET', '/api/accounts/summary')).json; assert.ok(acc.totals.paid >= 4500 && acc.totals.remaining >= 3000 && acc.batches.some((x) => x.id === bp.json.id && x.paid === 4500 && x.due === 7500) && acc.debtors.some((x) => x.id === ap2) && acc.byMethod.some((x) => x.method === 'فودافون كاش') && acc.recent.length >= 2, 'ملخص الحسابات');
  const refund = await api('POST', `/api/people/${ap1}/payments`, { amount: -500, walletId: cashW, note: 'استرجاع' }); assert.strictEqual(refund.json.remaining, 500);
  assert.strictEqual((await api('DELETE', `/api/payments/${pb.payments[0].id}`)).status, 200); assert.strictEqual((await api('GET', `/api/people/${ap1}/payments`)).json.payments.length, 2);
  const so = (await api('GET', '/api/stats/overview')).json; assert.ok(so.accounts && so.accounts.paid >= 0 && so.visas.find((v) => v.id === bp.json.id).due === 7500, 'الحسابات في لوحة التحكم');
  /* الصلاحيات: المشاهد مبيشوفش الفلوس، والموظف بيسجّل */
  who = await loginAs('viewer1'); assert.strictEqual((await api('GET', `/api/people/${ap1}/payments`)).status, 403); assert.strictEqual((await api('GET', '/api/accounts/summary')).status, 403);
  assert.ok(!('pay' in (await api('GET', '/api/people')).json.people[0]) && (await api('GET', '/api/stats/overview')).json.accounts === null && !('due' in (await api('GET', '/api/stats/overview')).json.visas[0]), 'المشاهد مبيشوفش أي فلوس');
  await loginAs('staff1'); assert.strictEqual((await api('POST', `/api/people/${ap2}/payments`, { amount: 100 })).status, 200); cookie = adminCookie2;
  /* أرشفة دفعة: الناس بتختفي من القايمة والإحصائيات وبترجع لما تلغي الأرشفة */
  const totBefore = (await api('GET', '/api/stats/overview')).json.total;
  assert.strictEqual((await api('PUT', `/api/profiles/${bp.json.id}/archive`, { archived: true })).status, 200);
  assert.ok(!(await api('GET', '/api/people')).json.people.some((x) => x.id === ap1), 'مؤرشف: مش في القايمة'); assert.ok((await api('GET', '/api/people?archived=1')).json.people.some((x) => x.id === ap1), 'archived=1 بيعرض المؤرشف'); assert.ok((await api('GET', '/api/people?archived=all')).json.people.some((x) => x.id === ap1));
  const so2 = (await api('GET', '/api/stats/overview')).json; assert.strictEqual(so2.total, totBefore - 2); assert.ok(so2.archived.batches >= 1 && so2.archived.people === 2 && !so2.visas.some((v) => v.id === bp.json.id), 'مؤرشف: خارج الإحصائيات');
  assert.ok(!(await api('GET', '/api/accounts/summary')).json.batches.some((x) => x.id === bp.json.id));
  assert.strictEqual((await api('GET', '/api/profiles')).json.profiles.find((x) => x.id === bp.json.id).archived, true);
  await api('PUT', `/api/profiles/${bp.json.id}/archive`, { archived: false }); assert.ok((await api('GET', '/api/people')).json.people.some((x) => x.id === ap1));
  /* نماذج الدفعات (أكتر من نموذج + افتراضي واحد بس) */
  assert.deepStrictEqual((await api('GET', '/api/batch-templates')).json.templates, []);
  const tp = await api('PUT', '/api/batch-templates', { templates: [{ name: 'عمرة', data: { visaKind: '13', degree: 'دبلوم', hack: 'x' }, isDefault: true }, { name: 'حج', data: { visaKind: '4' }, isDefault: true }] });
  assert.strictEqual(tp.status, 200); assert.deepStrictEqual(tp.json.templates.map((t) => [t.name, t.isDefault, t.data.visaKind, 'hack' in t.data]), [['عمرة', true, '13', false], ['حج', false, '4', false]]);
  assert.strictEqual((await api('GET', '/api/batch-templates')).json.templates.length, 2);
  /* معالجة الصورة: إعداد عام (للمدير بس) */
  assert.strictEqual((await api('GET', '/api/meta')).json.photoProcess, 'off'); assert.strictEqual((await api('PUT', '/api/settings/photo', { mode: 'clean' })).status, 200); assert.strictEqual((await api('GET', '/api/meta')).json.photoProcess, 'clean');
  await loginAs('staff1'); assert.strictEqual((await api('PUT', '/api/settings/photo', { mode: 'off' })).status, 403); cookie = adminCookie2; await api('PUT', '/api/settings/photo', { mode: 'off' });
  /* رقم الطلب الأحدث: الأقدم مبيغلبش الأحدث */
  const al2 = (await api('GET', `/api/people/${ap2}/appno-lookup`)).json; assert.strictEqual(al2.visaType, '38'); assert.ok(al2.visaTypeText && al2.visaTypeText.length > 2, 'نص نوع التأشيرة للمقارنة');
  assert.strictEqual((await api('POST', `/api/people/${ap2}/result`, { status: 'submitted', appNumber: 'E200000002', appDate: '2026/05/10' })).json.ignored, undefined);
  const oldApp = await api('POST', `/api/people/${ap2}/result`, { status: 'submitted', appNumber: 'E200000001', appDate: '2026/04/01' }); assert.strictEqual(oldApp.json.ignored, true, 'الرقم الأقدم اتجاهل');
  assert.strictEqual((await api('GET', `/api/people/${ap2}`)).json.person.appNumber, 'E200000002');
  assert.strictEqual((await api('POST', `/api/people/${ap2}/result`, { status: 'submitted', appNumber: 'E200000003', appDate: '2026/06/01' })).json.ignored, undefined); assert.strictEqual((await api('GET', `/api/people/${ap2}/appno-lookup`)).json.appDate, '2026-06-01');
  assert.strictEqual((await api('GET', `/api/people/${ap2}`)).json.person.appNumber, 'E200000003', 'الأحدث بيغلب');

  /* رقم الطلب من غير E بيتخزّن بـ E، وبيتطابق بالجواز */
  const nb = await api('POST', '/api/people', { data: { nameAr: 'شخص رقم بدون E', passportNo: 'NE0000001' } }); const nid = nb.json.id;
  /* «املاه في الخلفية» من الإعدادات */
  assert.deepStrictEqual((await api('GET', '/api/meta')).json.bgTabs, { mofa: false, wafid: false, lab: false });
  assert.strictEqual((await api('PUT', '/api/settings/tabs', { wafid: true, lab: 1 })).status, 200); assert.deepStrictEqual((await api('GET', '/api/meta')).json.bgTabs, { mofa: false, wafid: true, lab: true });
  await api('PUT', '/api/settings/tabs', {});
  /* نتيجة الكشف الطبي من وافد: Fit ← «تم الفحص الطبي» بتاريخ الفحص؛ Unfit ← ملاحظة بس؛ جواز تاني ← مرفوض */
  const wr1 = await api('POST', `/api/people/${nid}/wafid-result`, { status: 'unfit', examDate: '2026-08-20', center: 'Test Clinic', passportNo: 'NE0000001' });
  assert.strictEqual(wr1.status, 200); let stg = (await api('GET', `/api/people/${nid}`)).json.person.stages.medical; assert.ok(stg.state !== 'done' && /Unfit/.test(stg.note), 'Unfit ملاحظة بس: ' + JSON.stringify(stg));
  assert.strictEqual((await api('POST', `/api/people/${nid}/wafid-result`, { status: 'fit', examDate: '2026-08-23', passportNo: 'XX9999999' })).status, 409, 'جواز تاني مرفوض');
  const wr2 = await api('POST', `/api/people/${nid}/wafid-result`, { status: 'fit', examDate: '2026-08-23', center: 'Test Clinic', passportNo: 'NE0000001' }); assert.strictEqual(wr2.json.status, 'fit');
  stg = (await api('GET', `/api/people/${nid}`)).json.person.stages.medical; assert.deepStrictEqual([stg.state, stg.date], ['done', '2026-08-23'], 'Fit اتعلّم: ' + JSON.stringify(stg)); assert.ok(/Fit — Test Clinic/.test(stg.note));
  assert.strictEqual((await api('POST', `/api/people/${nid}/result`, { status: 'submitted', appNumber: '830068985' })).json.appNumber, 'E830068985'); assert.strictEqual((await api('GET', `/api/people/${nid}`)).json.person.appNumber, 'E830068985');
  assert.strictEqual((await api('POST', `/api/people/${nid}/result`, { status: 'submitted', appNumber: 'e830068985' })).status, 200); assert.strictEqual((await api('GET', `/api/people/${nid}`)).json.person.stages.sent.history.length, 0, 'نفس الرقم بصيغتين مش «رقم سابق»');
  assert.strictEqual((await api('POST', `/api/people/${nid}/result`, { status: 'submitted', appNumber: '12' })).status, 400);
  const byp = await api('POST', '/api/people/result-by-passport', { passportNo: 'ne0000001', appNumber: '829944969' }); assert.deepStrictEqual([byp.status, byp.json.personId, byp.json.appNumber], [200, nid, 'E829944969']);
  assert.strictEqual((await api('POST', '/api/people/result-by-passport', { passportNo: 'ZZ9999999', appNumber: '829944969' })).status, 404);
  /* ===== الطباعة: بروتوكول Masar Print Agent (نفس مسارات نظام الجوازات) + تجهيز الطباعة ===== */
  const KEY = 'test-print-key-0123456789abcdef'; const AG = '/api/passports/barcode';
  const raw = (m, u, b, key) => fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Agent-Key': key } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
  assert.strictEqual((await raw('POST', AG + '/agents/register', { agentId: 'PC1' })).status, 403, 'من غير مفتاح مرفوض'); assert.strictEqual((await raw('POST', AG + '/agents/register', { agentId: 'PC1' }, 'wrong-key-wrong-key-xx')).status, 403);
  const reg = await raw('POST', AG + '/agents/register', { agentId: 'PC1', agentName: 'جهاز المكتب', computerName: 'OFFICE', printers: [{ name: 'BIXOLON XD5-40d', isDefault: true }, 'PDF'], defaultPrinter: 'BIXOLON XD5-40d', agentVersion: '25', capabilities: ['barcode_label'] }, KEY);
  assert.deepStrictEqual([reg.status, reg.json.success, reg.json.agentId], [200, true, 'PC1']);
  assert.strictEqual((await raw('POST', `/print-agent/${KEY}/api/passports/barcode/agents/register`, { agentId: 'PC1', printers: [{ name: 'BIXOLON XD5-40d' }] })).status, 200, 'العنوان اللي فيه المفتاح (/print-agent/<المفتاح>/…) شغّال زي نظام الجوازات');
  assert.strictEqual((await raw('GET', `/print-agent/wrongkeywrongkey12345/api/passports/barcode/print-agent/health`)).status, 403); assert.strictEqual((await raw('GET', AG + '/print-agent/health', null, KEY)).json.success, true); assert.strictEqual((await raw('GET', AG + '/print-server/health', null, KEY)).json.success, true);
  assert.strictEqual((await raw('GET', AG + '/agents/PC1/jobs/next', null, KEY)).json.job, null, 'مفيش أوامر');
  const pinfo = (await api('GET', '/api/print/info')).json; assert.ok(pinfo.configured && pinfo.agentUrl.endsWith('/print-agent/' + KEY) && pinfo.agents.some((a) => a.agentId === 'PC1' && a.isOnline) && pinfo.settings.labelWidthMm === 52 && pinfo.settings.barcodeNarrow === 2 && pinfo.settings.dpi === 203, 'بيانات الطباعة والإعدادات الافتراضية زي نظام الجوازات');
  assert.ok(pinfo.agents.find((x) => x.agentId === 'PC1').agoSec <= 10 && pinfo.agentLog.some((x) => /agents\/register$/.test(x.path) && x.status === 200) && pinfo.agentLog.some((x) => x.status === 403), 'سجل اتصال البرنامج + آخر ظهور');
  const lblPayload = { version: 4, type: 'passport_barcode_label', printMode: 'native-first', code: 'E830068985', nativeLabelJson: '{"id":1,"functions":{}}', label: { widthMm: 52, heightMm: 31, dpi: 203 }, settings: {}, passport: null };
  assert.strictEqual((await api('POST', '/api/print/jobs', { payload: 'x' })).status, 400);
  const j1 = await api('POST', '/api/print/jobs', { payload: lblPayload, copies: 2, label: 'باركود رقم الطلب', personId: nid }); assert.deepStrictEqual([j1.status, j1.json.ok, j1.json.printerName], [200, true, 'BIXOLON XD5-40d'], 'جهاز واحد متصل: بيتختار لوحده');
  assert.strictEqual((await api('GET', `/api/print/jobs/${j1.json.jobId}`)).json.status, 'pending');
  const nx = (await raw('GET', AG + '/agents/PC1/jobs/next', null, KEY)).json.job; assert.ok(nx && nx.jobId === j1.json.jobId && nx.copies === 2 && nx.printerName === 'BIXOLON XD5-40d' && nx.payload.code === 'E830068985' && nx.payload.type === 'passport_barcode_label' && nx.jobType === 'barcode_label', 'الأمر وصل للبرنامج بنفس الصيغة');
  assert.strictEqual((await raw('GET', AG + '/agents/PC1/jobs/next', null, KEY)).json.job, null, 'الأمر بيتسحب مرة واحدة'); assert.strictEqual((await api('GET', `/api/print/jobs/${j1.json.jobId}`)).json.status, 'printing');
  assert.strictEqual((await raw('POST', AG + `/agents/PC1/jobs/${nx.jobId}/status`, { status: 'weird' }, KEY)).status, 400); assert.strictEqual((await raw('POST', AG + `/agents/PC1/jobs/${nx.jobId}/status`, { status: 'printed' }, KEY)).json.success, true); assert.strictEqual((await api('GET', `/api/print/jobs/${j1.json.jobId}`)).json.status, 'printed');
  const j2 = await api('POST', '/api/print/jobs', { payload: lblPayload }); const nx2 = (await raw('GET', AG + '/agents/PC1/jobs/next', null, KEY)).json.job; await raw('POST', AG + `/agents/PC1/jobs/${nx2.jobId}/status`, { status: 'failed', errorMessage: 'الطابعة مفصولة' }, KEY); const fj = (await api('GET', `/api/print/jobs/${j2.json.jobId}`)).json; assert.deepStrictEqual([fj.status, fj.error], ['failed', 'الطابعة مفصولة']);
  assert.strictEqual((await api('PUT', '/api/print/settings', { printAgentId: 'NOPE', labelWidthMm: 60, barcodeNarrow: 9 })).json.settings.barcodeNarrow, 4, 'القيم بتتظبط في حدودها');
  assert.strictEqual((await api('POST', '/api/print/jobs', { payload: lblPayload })).status, 400, 'جهاز مختار مش موجود'); await api('PUT', '/api/print/settings', { printAgentId: 'PC1', printAgentPrinterName: 'مش موجودة' }); assert.strictEqual((await api('POST', '/api/print/jobs', { payload: lblPayload })).status, 400, 'طابعة مش على الجهاز'); await api('PUT', '/api/print/settings', { printAgentId: 'PC1' });
  /* تجهيز الطباعة: الناقص + نوع الخطاب حسب الممثلية */
  const pbat = (await api('POST', '/api/profiles', { name: 'دفعة الطباعة', data: { visaNumber: '1306311796', embassy: '302', visaKind: '13', unifiedNumber: '7001185532', sponsorName: 'شركة', jobText: 'سائق', visaDate: '1448/02/30' } })).json.id;
  const pk1 = (await api('POST', '/api/people', { profileId: pbat, data: { nameAr: 'شخص للطباعة', passportNo: 'PK0000001' } })).json.id;
  let pk = (await api('GET', `/api/print/pack/${pk1}`)).json; assert.deepStrictEqual([pk.letterKind, pk.visaNumber, pk.appNumber], ['cairo', '1306311796', '']); assert.ok(pk.missing.some((x) => /رقم الطلب/.test(x)));
  await api('POST', `/api/people/${pk1}/result`, { status: 'submitted', appNumber: '830068985' }); pk = (await api('GET', `/api/print/pack/${pk1}`)).json; assert.strictEqual(pk.appNumber, 'E830068985'); assert.ok(!pk.missing.some((x) => /رقم الطلب/.test(x)));
  const bz = await fetch(base + `/api/people/letters-bundle?ids=${pk1}&kind=auto`, { headers: { Cookie: cookie } }); const bzb = Buffer.from(await bz.arrayBuffer()); assert.deepStrictEqual([bz.status, bz.headers.get('content-type'), bzb.slice(0, 2).toString()], [200, 'application/zip', 'PK'], 'خطابات مجمّعة zip');
  who = await loginAs('viewer1'); assert.strictEqual((await api('POST', '/api/print/jobs', { payload: lblPayload })).status, 403); assert.strictEqual((await api('GET', `/api/print/pack/${pk1}`)).status, 403); assert.strictEqual((await api('GET', `/api/people/letters-bundle?ids=${pk1}`)).status, 403); cookie = adminCookie2;
  /* ===== الخزينة: أرصدة، إيراد/مصروف/تحويل، سجل المعاملات ===== */
  tr = (await api('GET', '/api/treasury')).json; const bal = (id) => tr.wallets.find((w) => w.id === id).balance;
  assert.strictEqual(bal(vfW), 2100, 'فودافون: 100 أول المدة + 2000 دفعة');
  const cashBal0 = bal(cashW);
  assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'expense', walletId: cashW, amount: 0 })).status, 400); assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'weird', walletId: cashW, amount: 5 })).status, 400);
  assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'expense', walletId: cashW, amount: 300, category: 'انتقالات', note: 'مواصلات', date: '2026-11-20' })).status, 200);
  assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'income', walletId: cashW, amount: 50, category: 'إيداع' })).status, 200);
  assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'transfer', walletId: vfW, toWalletId: vfW, amount: 10 })).status, 400, 'تحويل لنفس المحفظة');
  const trf = await api('POST', '/api/treasury/tx', { kind: 'transfer', walletId: vfW, toWalletId: cashW, amount: 1000, note: 'سحب' }); assert.strictEqual(trf.status, 200);
  tr = (await api('GET', '/api/treasury')).json; assert.strictEqual(bal(vfW), 1100); assert.strictEqual(bal(cashW), cashBal0 - 300 + 50 + 1000);
  assert.strictEqual(tr.total, tr.wallets.filter((w) => !w.archived).reduce((a, w) => a + w.balance, 0));
  let tlg = (await api('GET', `/api/treasury/tx?wallet=${cashW}`)).json; assert.ok(tlg.rows.some((x) => x.kind === 'expense' && x.amount === -300 && x.desc.includes('انتقالات')) && tlg.rows.some((x) => x.kind === 'transfer' && x.amount === 1000 && /تحويل من فودافون/.test(x.kindLabel)) && tlg.rows.some((x) => x.kind === 'client'), 'سجل المحفظة فيه كل الأنواع');
  tlg = (await api('GET', '/api/treasury/tx?kind=client')).json; assert.ok(tlg.rows.length >= 3 && tlg.rows.every((x) => x.kind === 'client') && tlg.rows.some((x) => x.personId === ap1));
  tlg = (await api('GET', '/api/treasury/tx?kind=expense&from=2026-11-20&to=2026-11-20')).json; assert.deepStrictEqual([tlg.count, tlg.out], [1, 300]);
  tlg = (await api('GET', '/api/treasury/tx?q=' + encodeURIComponent('مواصلات'))).json; assert.strictEqual(tlg.count, 1);
  assert.strictEqual((await api('DELETE', `/api/treasury/wallets/${vfW}`)).status, 409, 'محفظة فيها معاملات ما تتمسحش');
  const tid = (await api('GET', `/api/treasury/tx?wallet=${vfW}&kind=transfer`)).json.rows[0].txId; assert.strictEqual((await api('DELETE', `/api/treasury/tx/${tid}`)).status, 200);
  tr = (await api('GET', '/api/treasury')).json; assert.strictEqual(bal(vfW), 2100, 'مسح التحويل بيرجّع المحفظتين');
  assert.strictEqual((await api('PUT', `/api/treasury/wallets/${vfW}`, { archived: true })).status, 200); assert.ok(!(await api('GET', `/api/people/${ap1}/payments`)).json.wallets.some((w) => w.id === vfW), 'المقفولة مش بتظهر في الدفع');
  assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'income', walletId: vfW, amount: 5 })).status, 400); await api('PUT', `/api/treasury/wallets/${vfW}`, { archived: false });
  const emptyW = (await api('POST', '/api/treasury/wallets', { name: 'مؤقتة' })).json.id; assert.strictEqual((await api('DELETE', `/api/treasury/wallets/${emptyW}`)).status, 200);
  who = await loginAs('viewer1'); assert.strictEqual((await api('GET', '/api/treasury')).status, 403); assert.strictEqual((await api('POST', '/api/treasury/tx', { kind: 'income', walletId: cashW, amount: 5 })).status, 403); cookie = adminCookie2;
  // حماية: طلب من مصدر تاني
  const csrf = await fetch(base + '/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  assert.strictEqual(csrf.status, 403);
  // الإضافة مضغوطة
  const z = await fetch(base + '/api/extension.zip', { headers: { Cookie: cookie } });
  console.log('extension.zip status', z.status);

  console.log('API OK');
  server.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
