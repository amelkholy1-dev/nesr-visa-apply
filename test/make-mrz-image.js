'use strict';
/* بيطبع سطري MRZ تجريبيين بأرقام تحقق صحيحة (لتوليد صورة اختبار للقراءة) */
const cd = require('../server/mrz').checkDigit;
const noF = 'A45449365', dob = '891101', ex = '330623', per = '29001010100011';
const body = noF + cd(noF) + 'EGY' + dob + cd(dob) + 'M' + ex + cd(ex) + per.padEnd(14, '<') + cd(per.padEnd(14, '<'));
const l2 = body + cd(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
const l1 = 'P<EGYELSHAWY<<ATEF<FATHALLA<ABDELFATTAH'.padEnd(44, '<');
console.log(l1); console.log(l2);
