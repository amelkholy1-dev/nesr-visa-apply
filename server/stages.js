'use strict';
/* مراحل الطلب بعد الإرسال: كل مرحلة ليها حالة (لسه / محجوز / تم) وتاريخ وملاحظة */
const STAGES = [
  { k: 'sent', label: 'إرسال الطلب لإنجاز' },
  { k: 'insurance', label: 'التأمين الصحي' },
  { k: 'fee', label: 'سداد الرسوم' },
  { k: 'printed', label: 'الطباعة (طلب التأشيرة)' },
  { k: 'medical', label: 'الفحص الطبي', booking: true },
  { k: 'fingerprint', label: 'البصمة (تسهيل)', booking: true }
];
const STATES = ['', 'booked', 'done'];
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

function parse(raw) {
  let o = {}; try { o = JSON.parse(raw || '{}') || {}; } catch (e) { o = {}; }
  const out = {};
  for (const st of STAGES) {
    const v = o[st.k] || {};
    out[st.k] = { state: STATES.includes(v.state) ? v.state : '', date: iso(v.date), note: String(v.note || '').slice(0, 200) };
    if (st.k === 'sent') out[st.k].history = Array.isArray(v.history) ? v.history.slice(0, 20).map((h) => ({ app: String(h.app || '').slice(0, 20), at: iso(h.at) })) : [];
  }
  return out;
}
function patch(cur, key, body) {
  const st = STAGES.find((s) => s.k === key); if (!st) return null;
  const c = cur[key]; const state = STATES.includes(body.state) ? body.state : c.state;
  if (state === 'booked' && !st.booking) return null;
  c.state = state;
  if (body.date !== undefined) c.date = iso(body.date);
  if (body.note !== undefined) c.note = String(body.note || '').slice(0, 200);
  if (state === 'done' && !c.date) c.date = new Date().toISOString().slice(0, 10);
  return cur;
}
const progress = (stages) => ({ done: STAGES.filter((s) => stages[s.k].state === 'done').length, booked: STAGES.filter((s) => stages[s.k].state === 'booked').length, total: STAGES.length });
module.exports = { STAGES, parse, patch, progress };
