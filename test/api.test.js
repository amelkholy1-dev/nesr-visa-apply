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
  assert.strictEqual(ldoc.status, 200); assert.strictEqual(ldb.slice(0, 2).toString(), 'PK'); assert.ok(String(ldoc.headers.get('content-disposition')).includes('nomination-suez-ST12345.docx'), 'اسم ملف الخطاب'); assert.ok(String(ldoc.headers.get('content-type')).includes('wordprocessingml'));
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

  // حماية: طلب من مصدر تاني
  const csrf = await fetch(base + '/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  assert.strictEqual(csrf.status, 403);
  // الإضافة مضغوطة
  const z = await fetch(base + '/api/extension.zip', { headers: { Cookie: cookie } });
  console.log('extension.zip status', z.status);

  console.log('API OK');
  server.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
