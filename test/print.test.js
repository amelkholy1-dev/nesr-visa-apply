'use strict';
/* اختبار طباعة: الباركود (Code 128) وورقة طلب التأشيرة والليبل */
const vm = require('vm'); const fs = require('fs'); const path = require('path'); const assert = require('assert'); const os = require('os');
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'print.js'), 'utf8'), ctx);
const P = ctx.window.VaPrint;
const r = P.code128('E123456789');
assert.deepStrictEqual(Array.from(r.vals), [104, 37, 17, 18, 19, 20, 21, 22, 23, 24, 25, 99, 106], 'قيم Code128 (Start B + بيانات + checksum + Stop)');
assert.ok(r.svg.includes('<svg') && r.svg.includes('<rect'));
const ot = (a, b) => ({ sex: { 1: 'ذكر' }, passportType: { 1: 'عادي' }, embassy: { 320: 'القاهرة' }, visaKind: { 38: 'عمل' } }[a] || {})[b] || b;
const o = { person: { appNumber: 'E123456789', data: { nameAr: 'عاطف <b>', sex: '1', phone: '010' } },
  resolved: { mofa: { EFIRSTNAME: 'ATEF', EFATHER: 'FATHALLA', EFAMILY: 'ELSHAHAWY', PASSPORTnumber: 'A45449365', SPONSER_NAME: 'شركة' }, values: { passportType: '1', sex: '1', expiryDate: '2033-06-23', embassy: '320', visaKind: '38', entriesText: 'سفرة واحدة', residence: '90', jobText: 'سائق', birthDate: '1989-11-01', birthPlace: 'قنا' } },
  profile: { data: {} }, settings: { company: 'نسر الخليج', line2: '' }, optText: ot };
assert.ok(!P.undertaking && !P.letter, 'التعهد وخطاب الترشيح اتشالوا');
const sheet = P.sheet(o), lbl = P.labels([{ name: 'ATEF ELSHAHAWY', code: 'E123456789' }, { name: 'X', code: 'A1' }], o.settings);
assert.ok(sheet.includes('طلب تأشيرة دخول') && sheet.includes('E123456789') && sheet.includes('<svg') && sheet.includes('A45449365'));
for (const t of ['رقم الجواز', 'نوع الجواز', 'تاريخ الانتهاء', 'الممثلية في', 'عدد مرات الدخول', 'سفرة واحدة - 90 يوم', 'الجنسية الحالية', 'للعمل لدى /شركة', '23/06/2033', '01/11/1989', 'الاســم :', 'التوقيع :', 'التاريخ :']) assert.ok(sheet.includes(t), 'ناقص في الورقة: ' + t);
assert.strictEqual((sheet.match(/<li>/g) || []).length, 10, 'بنود الإقرار العشرة');
assert.ok(sheet.includes('&lt;b&gt;') && !sheet.includes('عاطف <b>'), 'الاسم بيتهرّب (مفيش HTML injection)');
assert.strictEqual((lbl.match(/class="lb"/g) || []).length, 2); assert.ok(lbl.includes('size:50mm 25mm'));
fs.writeFileSync(path.join(os.tmpdir(), 'va-print-sheet.html'), sheet); fs.writeFileSync(path.join(os.tmpdir(), 'va-print-label.html'), lbl);
console.log('PRINT OK');
