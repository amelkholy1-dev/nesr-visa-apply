'use strict';
/* قراءة صفحة بيانات الجواز بـ Gemini (اختياري: مفاتيح من «الإعدادات» أو GEMINI_API_KEY، والتبديل بينهم في server/gemini.js). بنطلب منه سطري MRZ حرفياً وبعض البيانات المطبوعة،
   وبعدها السيرفر بيفحص MRZ بأرقام التحقق (server/mrz.js) فالقراءة الغلط مبتعدّيش من غير ما تتعلّم. */
const gemini = require('./gemini');

const PROMPT = `You are reading the data page of a passport. Return ONLY a JSON object with these keys:
- mrz1: first MRZ line exactly as printed (44 characters, use < for fillers)
- mrz2: second MRZ line exactly as printed (44 characters)
- nameAr: the holder's full name in Arabic as printed (empty string if none)
- birthPlaceEn: place of birth in English as printed
- birthPlaceAr: place of birth in Arabic as printed
- issueDate: date of issue as YYYY-MM-DD (empty if unreadable)
- expiryDate: date of expiry as YYYY-MM-DD (empty if unreadable)
- nationalId: the 14-digit national number printed in the data page if present (digits only, empty if none)
Do not guess characters you cannot read: copy the MRZ exactly. No explanations, JSON only.`;

async function readPassport(buffer, mimeType) {
  if (!/^image\/(jpeg|png)$/.test(mimeType)) { const e = new Error('الصورة لازم JPG أو PNG'); e.status = 400; throw e; }
  const body = { contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
  const { json: j } = await gemini.generate(body);
  const txt = (((j.candidates || [])[0] || {}).content || {}).parts;
  const raw = Array.isArray(txt) ? txt.map(p => p.text || '').join('') : '';
  let o = {};
  try { o = JSON.parse(raw.replace(/^```json\s*|```$/g, '')); } catch (e) { const er = new Error('رد خدمة القراءة مش مفهوم'); er.status = 502; throw er; }
  const s = (v) => String(v == null ? '' : v).trim();
  return { mrz1: s(o.mrz1), mrz2: s(o.mrz2), nameAr: s(o.nameAr), birthPlaceEn: s(o.birthPlaceEn), birthPlaceAr: s(o.birthPlaceAr), issueDate: /^\d{4}-\d{2}-\d{2}$/.test(s(o.issueDate)) ? s(o.issueDate) : '', nationalId: /^\d{14}$/.test(s(o.nationalId).replace(/\D/g, '')) ? s(o.nationalId).replace(/\D/g, '') : '', expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(s(o.expiryDate)) ? s(o.expiryDate) : '' };
}

module.exports = { readPassport };
