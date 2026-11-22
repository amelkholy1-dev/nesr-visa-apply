'use strict';
/* بيانات حجز الفحص الطبي في موقع وافد (wafid.com): الأسماء الإنجليزية زي الجواز (الأول + العائلة)، والتواريخ ISO */
const F = require('./fields');

const MARITAL = (code) => (String(code) === '2' ? 'married' : 'unmarried'); /* وافد فيه متزوج / أعزب بس */
function build(data, profileData) {
  const r = F.resolve(data, profileData, {}); const v = r.values; const m = r.mofa;
  const issues = [], warns = [];
  const need = (val, label) => { if (!String(val || '').trim()) issues.push(label); };
  need(m.EFIRSTNAME, 'الاسم الأول بالإنجليزي'); need(m.EFAMILY, 'اسم العائلة بالإنجليزي'); need(m.PASSPORTnumber, 'رقم الجواز'); need(v.birthDate, 'تاريخ الميلاد');
  need(v.issueDate, 'تاريخ إصدار الجواز'); need(v.expiryDate, 'تاريخ انتهاء الجواز'); need(v.sex, 'الجنس'); need(v.email, 'البريد الإلكتروني'); need(v.phone, 'رقم الموبايل');
  need(v.nationalId, 'الرقم القومي'); need(v.medCity, 'مدينة الفحص (من ملف الضبط)'); need(v.medVisa, 'نوع التأشيرة في وافد (من ملف الضبط)');
  if (!v.issuePlace) warns.push('مكان إصدار الجواز فاضي: هنكتب Egypt، راجعه');
  if (v.phone && !/^[+\d][\d\s-]{7,14}$/.test(v.phone)) warns.push('رقم الموبايل شكله غير معتاد (وافد بيقبل لحد 14 رقم)');
  const payload = {
    country: 'EGY', city: v.medCity || '', traveled: 'SA', visa: v.medVisa || '',
    first: (m.EFIRSTNAME || '').slice(0, 50), last: (m.EFAMILY || '').slice(0, 50),
    dob: v.birthDate || '', nationalityText: 'مصري', gender: v.sex === '2' ? 'female' : v.sex === '1' ? 'male' : '', marital: MARITAL(v.social),
    passport: m.PASSPORTnumber || '', issueDate: v.issueDate || '', expiryDate: v.expiryDate || '', issuePlace: (v.issuePlace || 'Egypt').slice(0, 50),
    email: v.email || '', phone: String(v.phone || '').replace(/[\s-]/g, '').slice(0, 14), nationalId: v.nationalId || '', position: v.medPosition || ''
  };
  return { payload, issues, warns };
}
module.exports = { build };
