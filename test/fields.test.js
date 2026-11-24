'use strict';
/* اختبار حقول ملف الضبط الجديدة (رقم التأشيرة والرقم الموحد) من غير قاعدة بيانات */
const assert = require('assert');
const F = require('../server/fields');

const g = F.meta().groups;
assert.strictEqual(g[0].id, 'lookup', 'مجموعة الرقمين أول مجموعة (تحت اسم الملف)');
assert.deepStrictEqual(g[0].fields.map((f) => f.k), ['visaNumber', 'unifiedNumber', 'docNumber']);
const prof = F.sanitizeProfile({ visaNumber: ' 1000000001 ', unifiedNumber: '7000000001', zzz: 'x' });
assert.deepStrictEqual(prof, { visaNumber: '1000000001', unifiedNumber: '7000000001' }, 'بيتحفظوا في ملف الضبط');
const person = { passportNo: 'A1' };
assert.strictEqual(F.resolve(person, prof, {}).mofa.SPONSER_NUMBER, '7000000001', 'الرقم الموحد بيتكتب في رقم الجهة لو رقم الجهة فاضي');
assert.strictEqual(F.resolve(person, { ...prof, sponsorNumber: '7999999999' }, {}).mofa.SPONSER_NUMBER, '7999999999', 'رقم الجهة المكتوب بإيدك له الأولوية');
/* التاريخ المتوقع للدخول تلقائي = النهارده + 17 يوم (بتوقيت مصر)، و0 = يدوي */
{ const exp = new Date(Date.now() + 17 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }).replace(/-/g, '/');
  assert.strictEqual(F.resolve({}, { expectedEntryDate: '2020-01-01' }, {}).mofa.ExpectedEntryDate, exp, 'تلقائي بيغلب القيمة القديمة');
  F.setAutoEntryDays(0); assert.strictEqual(F.resolve({}, { expectedEntryDate: '2027-01-15' }, {}).mofa.ExpectedEntryDate, '2027/01/15', 'متقفل: بياخد المكتوب'); F.setAutoEntryDays(17); }
/* الغرض: «نوع التأشيرة لدى الجهة الطالبة» لو الشخص ما كتبش غرض */
assert.strictEqual(F.resolve({}, { visaKind: '38', sponsorName: 'شركة تجربة', purpose: 'قديم' }, {}).mofa.porpose, 'عمل مؤقت لدى شركة تجربة');
assert.strictEqual(F.resolve({}, { visaKind: '13', sponsorName: 'شركة' }, {}).mofa.porpose, 'تأشيرة العمل المؤقت لخدمات الحج والعمرة لدى شركة');
assert.strictEqual(F.resolve({ purpose: 'زيارة عمل' }, { visaKind: '38', sponsorName: 'شركة' }, {}).mofa.porpose, 'زيارة عمل', 'المكتوب للشخص بيغلب');
/* تأشيرة «عمل»: رقم مستند التأشيرة مطلوب وبيتبعت DocumentNumber */
assert.ok(F.resolve({}, { visaKind: '1' }, {}).issues.some((x) => /مستند التأشيرة/.test(x)));
assert.ok(!F.resolve({}, { visaKind: '38' }, {}).issues.some((x) => /مستند التأشيرة/.test(x)));
assert.strictEqual(F.resolve({}, { visaKind: '1', docNumber: '1306039380' }, {}).mofa.DocumentNumber, '1306039380');
console.log('fields OK');
