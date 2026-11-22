'use strict';
const assert = require('assert');
const mrz = require('../server/mrz');
const names = require('../server/names');

/* جواز مصري تجريبي (بيانات وهمية): سطري MRZ بأرقام تحقق صحيحة بنحسبها هنا */
const cd = mrz.checkDigit;
function mk(surname, given, no, dob, sex, exp, nid) {
  const l1 = ('P<EGY' + surname + '<<' + given.join('<')).padEnd(44, '<');
  const noF = no.padEnd(9, '<'), per = (nid || '').padEnd(14, '<');
  const body = noF + cd(noF) + 'EGY' + dob + cd(dob) + sex + exp + cd(exp) + per + cd(per);
  const l2 = body + cd(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
  return [l1, l2];
}
const [L1, L2] = mk('ABOUELENIN', ['BADR', 'KHALIL', 'BADR'], 'A42014007', '830101', 'M', '320701', '29001010100011');
assert.strictEqual(L1.length, 44); assert.strictEqual(L2.length, 44);
let r = mrz.parseMrzText(L1 + '\n' + L2);
assert.ok(r, 'parsed');
assert.strictEqual(r.passportNumber, 'A42014007');
assert.strictEqual(r.birthDate, '1983-01-01');
assert.strictEqual(r.expiryDate, '2032-07-01');
assert.strictEqual(r.sex, 'M');
assert.strictEqual(r.surname, 'ABOUELENIN');
assert.deepStrictEqual(r.given, ['BADR', 'KHALIL', 'BADR']);
assert.strictEqual(r.confidence, 'high');
assert.strictEqual(r.personalNumber, '29001010100011');

/* لخبطة OCR: O بدل 0 في تاريخ الميلاد ← بيتصلّح بفحص الرقم */
const bad = L2.slice(0, 13) + '83O101' + L2.slice(19);
r = mrz.parseMrzText(L1 + '\n' + bad);
assert.strictEqual(r.birthDate, '1983-01-01'); /* O ← 0 بيتصلّح تلقائي */

/* حرف غلط في رقم الجواز من غير ما رقم التحقق يطابق ← مش high */
const wrong = 'B' + L2.slice(1);
r = mrz.parseMrzText(L1 + '\n' + wrong);
assert.notStrictEqual(r.confidence, 'high');

/* أسماء */
assert.deepStrictEqual(names.splitArabic('بدر خليل بدر ابو العنين'), { first: 'بدر', father: 'خليل', grand: 'بدر ابو', family: 'العنين' });
assert.deepStrictEqual(names.splitArabic('محمد احمد علي'), { first: 'محمد', father: 'احمد', grand: '', family: 'علي' });
assert.deepStrictEqual(names.splitEnglish('ABOUELENIN', ['BADR', 'KHALIL', 'BADR']), { first: 'BADR', father: 'KHALIL', grand: 'BADR', family: 'ABOUELENIN' });
assert.strictEqual(names.lengthWarnings({ family: 'ABDELRAHMANELSAYED' }, { family: 'Family' }).length, 1);
console.log('mrz/names OK');
