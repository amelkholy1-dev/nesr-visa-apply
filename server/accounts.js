'use strict';
/* حسابات مبسّطة: تكلفة الفرد (من الشخص أو دفعته) − اللي اتدفع = المتبقي */
const PAY_METHODS = ['كاش', 'فودافون كاش', 'اتصالات كاش', 'أورنج كاش', 'انستا باي', 'تحويل بنكي', 'محفظة أخرى'];
const num = (v) => { const t = String(v == null ? '' : v).replace(/,/g, '').trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const round2 = (n) => Math.round(n * 100) / 100;
/* تكلفة الشخص: قيمته هو لو مكتوبة، وإلا من دفعته، وإلا مش محدّدة (null) */
function feeOf(personData, profileData) {
  const own = num(personData && personData.fee); if (own !== null) return { fee: own, source: 'person' };
  const prof = num(profileData && profileData.fee); if (prof !== null) return { fee: prof, source: 'batch' };
  return { fee: null, source: '' };
}
/* state: none (مفيش تكلفة محدّدة) · unpaid · partial · paid · over (دفع أكتر) */
function balance(fee, paid) {
  paid = round2(paid || 0);
  if (fee === null || fee === undefined) return { fee: null, paid, remaining: null, state: paid > 0 ? 'paid' : 'none' };
  const remaining = round2(fee - paid);
  return { fee, paid, remaining, state: fee <= 0 ? 'none' : paid <= 0 ? 'unpaid' : remaining > 0 ? 'partial' : remaining < 0 ? 'over' : 'paid' };
}
module.exports = { PAY_METHODS, num, round2, feeOf, balance };
