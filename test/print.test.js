'use strict';
/* اختبار طباعة: الباركود (Code 128) والصفحات */
const vm = require('vm'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'print.js'), 'utf8'), ctx);
const P = ctx.window.VaPrint;
const r = P.code128('E123456789');
assert.deepStrictEqual(Array.from(r.vals), [104, 37, 17, 18, 19, 20, 21, 22, 23, 24, 25, 99, 106], 'قيم Code128 (Start B + بيانات + checksum + Stop)');
assert.ok(r.svg.includes('<svg') && r.svg.includes('<rect'));
const o = { person: { appNumber: 'E123456789', data: { nameAr: 'عاطف <b>', sex: '1', phone: '010' } }, resolved: { mofa: { EFIRSTNAME: 'ATEF', EFAMILY: 'ELSHAHAWY', PASSPORTnumber: 'A45449365', SPONSER_NAME: 'شركة' } }, profile: { data: {} }, settings: { company: 'نسر الخليج', line2: '', undertaking: 'أتعهد {{name}} {{passport}} {{app}} {{date}}', letter: 'خطاب {{sponsor}} {{company}}' }, optText: (a, b) => b };
const sheet = P.sheet(o), und = P.undertaking(o), let_ = P.letter(o), lbl = P.labels([{ name: 'ATEF ELSHAHAWY', code: 'E123456789' }, { name: 'X', code: 'A1' }], o.settings);
assert.ok(sheet.includes('E123456789') && sheet.includes('<svg') && sheet.includes('A45449365'));
assert.ok(!sheet.includes('<b>') || sheet.includes('&lt;b&gt;'), 'الاسم بيتهرّب (مفيش HTML injection)');
assert.ok(und.includes('A45449365') && !und.includes('{{') && let_.includes('شركة'));
assert.strictEqual((lbl.match(/class="lb"/g) || []).length, 2); assert.ok(lbl.includes('size:50mm 25mm'));
fs.writeFileSync(path.join(require('os').tmpdir(), 'va-print-sheet.html'), sheet); fs.writeFileSync(path.join(require('os').tmpdir(), 'va-print-label.html'), lbl);
console.log('PRINT OK');
