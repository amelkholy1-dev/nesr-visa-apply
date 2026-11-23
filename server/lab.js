'use strict';
/* بيانات حجز المعمل في موقع «معامل الصحة العامة» (clab.mohp.gov.eg/booking): للمصريين بالرقم القومي.
   الموقع بيطلع تاريخ الميلاد والجنس من الرقم القومي لوحده. تاريخ ويوم الحجز والتحاليل والدفع و«تأكيد» دايماً بإيد الموظف. */
const F = require('./fields');

const DEFAULT_DEST = '2182'; /* السعودية - KSA */
const intlPhone = require('./wafid').intlPhone;

/* الرقم القومي: أول رقم 2 ← 19xx، 3 ← 20xx، وبعده سنة/شهر/يوم الميلاد */
function nidBirth(nid) {
  const m = /^([23])(\d{2})(\d{2})(\d{2})\d{7}$/.exec(String(nid || '').trim()); if (!m) return '';
  const y = (m[1] === '2' ? 1900 : 2000) + Number(m[2]); const mo = Number(m[3]); const d = Number(m[4]);
  const dt = new Date(Date.UTC(y, mo - 1, d)); if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/* رقم المحافظة الفردي/الزوجي في الرقم القومي: الرقم قبل الأخير فردي = ذكر */
function nidSex(nid) { const t = String(nid || '').trim(); return /^\d{14}$/.test(t) ? (Number(t[12]) % 2 ? '1' : '2') : ''; }

function build(data, profileData, appNumber) {
  const r = F.resolve(data, profileData, {}); const v = r.values; const m = r.mofa;
  const issues = [], warns = [];
  const nid = String(v.nationalId || '').replace(/\s+/g, '');
  const fullName = [m.EFIRSTNAME, m.EFATHER, m.EGRAND, m.EFAMILY].map((x) => String(x || '').trim()).filter(Boolean).join(' ').toUpperCase();
  const phone = intlPhone(v.phone);
  if (!/^\d{14}$/.test(nid)) issues.push(nid ? 'الرقم القومي لازم 14 رقم' : 'الرقم القومي');
  need(m.PASSPORTnumber, 'رقم الجواز'); need(fullName, 'الاسم بالإنجليزي (طبقاً للجواز)'); need(v.phone, 'رقم الموبايل');
  function need(val, label) { if (!String(val || '').trim()) issues.push(label); }
  if (v.phone && !/^\+\d{8,13}$/.test(phone)) warns.push('رقم الموبايل شكله غير معتاد: المعمل بيطلبه بالصيغة +20…');
  if (nid && nidBirth(nid) && v.birthDate && nidBirth(nid) !== v.birthDate) warns.push('تاريخ الميلاد المسجّل مختلف عن اللي في الرقم القومي (' + nidBirth(nid) + '): الموقع هيحط اللي في الرقم القومي، راجع الرقم');
  if (nid && /^\d{14}$/.test(nid) && !nidBirth(nid)) warns.push('الرقم القومي شكله غلط (تاريخ الميلاد اللي جواه مش منطقي)');
  if (nid && v.sex && nidSex(nid) && nidSex(nid) !== v.sex) warns.push('الجنس المسجّل مختلف عن اللي في الرقم القومي: الموقع هيحط اللي في الرقم القومي، راجع الرقم');
  if (v.email && v.email.length > 20) warns.push('البريد أطول من 20 حرف والمعمل بيقبل 20 بس: هنكتب أول 20 وراجعه');
  if (!v.labJob) warns.push('الوظيفة (اختيارية في المعمل) فاضية: هنسيبها');
  if (!m.EFATHER && !m.EGRAND) warns.push('الاسم بالإنجليزي أول وعائلة بس: لو الجواز فيه اسم أب/جد لازم يتكتبوا كاملين في المعمل');
  const payload = {
    natType: '1', /* مصري */ destination: v.labDest || DEFAULT_DEST, nationalId: nid,
    passport: String(m.PASSPORTnumber || '').slice(0, 20), fullName: fullName.slice(0, 200), occupation: v.labJob || '',
    phone, email: String(v.email || '').slice(0, 20), netNumber: String(appNumber || '').slice(0, 20),
    dob: nidBirth(nid) || v.birthDate || '', sex: nidSex(nid) || v.sex || ''
  };
  return { payload, issues, warns };
}
module.exports = { build, nidBirth, nidSex, DEFAULT_DEST };
