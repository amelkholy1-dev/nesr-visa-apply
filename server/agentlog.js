'use strict';
/* آخر طلبات برنامج الطباعة (في الذاكرة): عشان لو البرنامج مش بيتصل تشوف هو بيطلب إيه بالظبط */
const buf = [];
const push = (e) => { buf.unshift({ t: Date.now(), ...e }); if (buf.length > 60) buf.length = 60; };
const list = () => buf.slice();
module.exports = { push, list };
