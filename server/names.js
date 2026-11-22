'use strict';
/* تقسيم الأسماء على خانات المنصة. كل خانة (عربي أو إنجليزي) حدها 15 حرف.
   المنصة: الاسم الأول · الأب · الجد · العائلة. الاسم الإنجليزي: First · Second/Father · Other/G.Father · Last/Family */

const MAX = 15;
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* عربي: «محمد أحمد علي حسن» ← أول / أب / جد / عيلة. لو الأسماء أكتر من 4 الأسماء اللي في النص بتتجمّع في خانة الجد.
   لو الاسم تلاتي: الأول/الأب/العيلة والجد فاضي. */
function splitArabic(full) {
  const w = norm(full).split(' ').filter(Boolean);
  if (!w.length) return { first: '', father: '', grand: '', family: '' };
  if (w.length === 1) return { first: w[0], father: '', grand: '', family: '' };
  if (w.length === 2) return { first: w[0], father: '', grand: '', family: w[1] };
  if (w.length === 3) return { first: w[0], father: w[1], grand: '', family: w[2] };
  return { first: w[0], father: w[1], grand: w.slice(2, -1).join(' '), family: w[w.length - 1] };
}

/* إنجليزي من MRZ: surname + given[] ← first = given[0]، father = given[1]، grand = الباقي، family = surname */
function splitEnglish(surname, given) {
  const g = (given || []).map(norm).filter(Boolean);
  return { first: g[0] || '', father: g[1] || '', grand: g.slice(2).join(' '), family: norm(surname) };
}

/* بيرجّع تحذيرات للخانات اللي أطول من 15 حرف (لازم تتقصّ أو تتظبط بإيدك) */
function lengthWarnings(parts, labels) {
  const out = [];
  for (const [k, v] of Object.entries(parts || {})) if (String(v || '').length > MAX) out.push(`${labels[k] || k}: ${String(v).length} حرف (الحد ${MAX})`);
  return out;
}

module.exports = { MAX, splitArabic, splitEnglish, lengthWarnings, norm };
