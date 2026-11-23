'use strict';
/* اختبار حقول ملف الضبط الجديدة (رقم التأشيرة والرقم الموحد) من غير قاعدة بيانات */
const assert = require('assert');
const F = require('../server/fields');

const g = F.meta().groups;
assert.strictEqual(g[0].id, 'lookup', 'مجموعة الرقمين أول مجموعة (تحت اسم الملف)');
assert.deepStrictEqual(g[0].fields.map((f) => f.k), ['visaNumber', 'unifiedNumber']);
const prof = F.sanitizeProfile({ visaNumber: ' 1000000001 ', unifiedNumber: '7000000001', zzz: 'x' });
assert.deepStrictEqual(prof, { visaNumber: '1000000001', unifiedNumber: '7000000001' }, 'بيتحفظوا في ملف الضبط');
const person = { passportNo: 'A1' };
assert.strictEqual(F.resolve(person, prof, {}).mofa.SPONSER_NUMBER, '7000000001', 'الرقم الموحد بيتكتب في رقم الجهة لو رقم الجهة فاضي');
assert.strictEqual(F.resolve(person, { ...prof, sponsorNumber: '7999999999' }, {}).mofa.SPONSER_NUMBER, '7999999999', 'رقم الجهة المكتوب بإيدك له الأولوية');
console.log('fields OK');
