'use strict';
/* تعريف حقول النظام (للواجهة) + تجهيز بيانات الشخص لفورم «طلب تأشيرة» في المنصة (resolve) + فحص النواقص.
   «ملف الضبط» (profile) فيه القيم المشتركة للدفعة (جهة العمل، نوع التأشيرة، الممثلية…) والشخص ممكن يغلبها بقيمته. */
const MOFA = require('./mofa-data.json');
const names = require('./names');

const OPT = {
  visaKind: MOFA.VisaKind, embassy: MOFA.EmbassyCode, passportType: MOFA.PASSPORType, religion: MOFA.RELIGION, social: MOFA.SOCIAL_STATUS,
  sex: MOFA.Sex, comingThrough: MOFA.COMING_THROUGH, entryPoint: MOFA.ENTRY_POINT, jobClass: MOFA.Classify_Occupations_Id,
  country: MOFA.PASSPORT_ISSUE_PLACE, nationality: [{ v: 'EGY', t: 'مصر' }],
  autoDeclare: [{ v: '1', t: 'أيوه — علّم الإقرارين تلقائياً (أنا موافق عليهم بنفسي)' }]
};

/* scope: profile = بتتظبط في ملف الضبط · person = لكل شخص · both = افتراضي في الملف ويتغلب في الشخص */
const GROUPS = [
  { id: 'visa', title: 'بيانات التأشيرة', fields: [
    { k: 'visaKind', label: 'نوع التأشيرة', type: 'select', opt: 'visaKind', scope: 'profile', req: true },
    { k: 'nationality', label: 'الجنسية', type: 'select', opt: 'nationality', scope: 'profile', req: true },
    { k: 'embassy', label: 'أقرب ممثلية', type: 'select', opt: 'embassy', scope: 'profile', req: true },
    { k: 'entriesText', label: 'عدد مرات الدخول (زي ما بتظهر في المنصة)', type: 'text', scope: 'profile', hint: 'مثلاً: سفرة واحدة' },
    { k: 'entryDays', label: 'صلاحية التأشيرة (يوم)', type: 'text', scope: 'profile', hint: 'مثلاً: 365' },
    { k: 'residence', label: 'مدة الإقامة', type: 'text', scope: 'profile', hint: 'مثلاً: 90' }
  ] },
  { id: 'declare', title: 'الإقرارات', fields: [
    { k: 'autoDeclare', label: 'تعليم «أقر بأن المعلومات صحيحة» و«أوافق على سياسة الخصوصية» تلقائياً', type: 'select', opt: 'autoDeclare', scope: 'profile', hint: 'لو سيبته فاضي الإضافة مش هتعلّمهم' }
  ] },
  { id: 'sponsor', title: 'جهة العمل', fields: [
    { k: 'sponsorName', label: 'اسم الجهة', type: 'text', scope: 'profile', max: 100 },
    { k: 'sponsorNumber', label: 'رقم السجل/الهوية', type: 'text', scope: 'profile', max: 10 },
    { k: 'sponsorAddress', label: 'عنوان الجهة', type: 'text', scope: 'profile', max: 150 },
    { k: 'sponsorPhone', label: 'هاتف الجهة', type: 'text', scope: 'profile', max: 20 }
  ] },
  { id: 'entry', title: 'الوصول', fields: [
    { k: 'comingThrough', label: 'وسيلة الوصول', type: 'select', opt: 'comingThrough', scope: 'both' },
    { k: 'entryPoint', label: 'منفذ الدخول', type: 'select', opt: 'entryPoint', scope: 'both', req: true },
    { k: 'expectedEntryDate', label: 'التاريخ المتوقع للدخول', type: 'date', scope: 'both', req: true },
    { k: 'purpose', label: 'الغرض', type: 'text', scope: 'both', max: 100 },
    { k: 'carNumber', label: 'رقم الرحلة/السيارة', type: 'text', scope: 'both', max: 20 }
  ] },
  { id: 'defaults', title: 'قيم افتراضية للأشخاص', fields: [
    { k: 'passportType', label: 'نوع الجواز', type: 'select', opt: 'passportType', scope: 'both', req: true },
    { k: 'issueCountry', label: 'دولة الإصدار', type: 'select', opt: 'country', scope: 'both', req: true },
    { k: 'religion', label: 'الديانة', type: 'select', opt: 'religion', scope: 'both', req: true },
    { k: 'social', label: 'الحالة الاجتماعية', type: 'select', opt: 'social', scope: 'both', req: true },
    { k: 'degree', label: 'المؤهل العلمي', type: 'text', scope: 'both', max: 50, req: true },
    { k: 'degreeSource', label: 'مصدر المؤهل', type: 'text', scope: 'both', max: 50, req: true },
    { k: 'homeAddress', label: 'عنوان السكن داخل السعودية', type: 'text', scope: 'both', max: 200, req: true },
    { k: 'email', label: 'البريد الإلكتروني', type: 'text', scope: 'both', req: true },
    { k: 'jobClass', label: 'التصنيف المهني', type: 'select', opt: 'jobClass', scope: 'both', req: true },
    { k: 'jobText', label: 'المهنة (اسمها زي ما بتظهر في المنصة)', type: 'text', scope: 'both', req: true }
  ] }
];

const PERSON_GROUPS = [
  { id: 'passport', title: 'الجواز', fields: [
    { k: 'passportNo', label: 'رقم الجواز', type: 'text', max: 10, req: true, ltr: true },
    { k: 'issueDate', label: 'تاريخ الإصدار', type: 'date', req: true },
    { k: 'expiryDate', label: 'تاريخ الانتهاء', type: 'date', req: true },
    { k: 'birthDate', label: 'تاريخ الميلاد', type: 'date', req: true },
    { k: 'birthPlace', label: 'مكان الميلاد', type: 'text', max: 20, req: true },
    { k: 'nationalId', label: 'الرقم القومي', type: 'text', max: 20, ltr: true },
    { k: 'phone', label: 'رقم الموبايل (للفحص الطبي وتسهيل)', type: 'text', max: 20, ltr: true },
    { k: 'sex', label: 'الجنس', type: 'select', opt: 'sex', req: true }
  ] },
  { id: 'names', title: 'الأسماء (كل خانة 15 حرف بالكتير)', fields: [
    { k: 'nameAr', label: 'الاسم بالعربي كامل', type: 'text', req: true },
    { k: 'nameArFirst', label: 'عربي: الاسم الأول', type: 'text', max: 15 }, { k: 'nameArFather', label: 'عربي: الأب', type: 'text', max: 15 },
    { k: 'nameArGrand', label: 'عربي: الجد', type: 'text', max: 15 }, { k: 'nameArFamily', label: 'عربي: العائلة', type: 'text', max: 15 },
    { k: 'nameEnFirst', label: 'English: First Name', type: 'text', max: 15, req: true, ltr: true }, { k: 'nameEnFather', label: 'English: Father', type: 'text', max: 15, ltr: true },
    { k: 'nameEnGrand', label: 'English: Grand Father', type: 'text', max: 15, ltr: true }, { k: 'nameEnFamily', label: 'English: Family Name', type: 'text', max: 15, req: true, ltr: true }
  ] }
];

const PROFILE_KEYS = GROUPS.flatMap(g => g.fields.map(f => f.k));
const PERSON_KEYS = [...PERSON_GROUPS.flatMap(g => g.fields.map(f => f.k)), ...GROUPS.flatMap(g => g.fields.filter(f => f.scope === 'both').map(f => f.k)), 'notes'];

const meta = () => ({ groups: GROUPS, personGroups: PERSON_GROUPS, options: OPT, maxName: names.MAX });

const pick = (src, keys) => { const o = {}; for (const k of keys) if (src && src[k] !== undefined && src[k] !== null) o[k] = typeof src[k] === 'string' ? src[k].trim() : src[k]; return o; };
const sanitizeProfile = (d) => pick(d, PROFILE_KEYS);
const sanitizePerson = (d) => pick(d, PERSON_KEYS);

/* التاريخ المخزّن YYYY-MM-DD ← yyyy/mm/dd (صيغة المنصة) */
const mofaDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).replace(/-/g, '/') : '');
const text = (list, v) => { const o = (list || []).find(x => String(x.v) === String(v)); return o ? o.t : ''; };

/* بيدمج ملف الضبط + بيانات الشخص ويرجّع: القيم النهائية + الحقول بأسماء المنصة + مشاكل (blocking) وتنبيهات */
function resolve(person, profile, files = {}) {
  const prof = profile || {};
  const p = person || {};
  const v = {};
  for (const k of new Set([...PROFILE_KEYS, ...PERSON_KEYS])) {
    const own = p[k]; v[k] = own !== undefined && own !== null && String(own).trim() !== '' ? String(own).trim() : (prof[k] !== undefined && prof[k] !== null ? String(prof[k]).trim() : '');
  }
  const ar = names.splitArabic(v.nameAr);
  const arParts = { first: v.nameArFirst || ar.first, father: v.nameArFather || ar.father, grand: v.nameArGrand || ar.grand, family: v.nameArFamily || ar.family };
  const enParts = { first: v.nameEnFirst, father: v.nameEnFather, grand: v.nameEnGrand, family: v.nameEnFamily };

  const mofa = {
    VisaKind: v.visaKind, NATIONALITY: v.nationality || 'EGY', EmbassyCode: v.embassy,
    AUTO_DECLARE: v.autoDeclare === '1' ? '1' : '',
    NUMBER_OF_ENTRIES: v.entriesText, Number_Entry_Day: v.entryDays, RESIDENCY_IN_KSA: v.residence,
    AFIRSTNAME: arParts.first, AFATHER: arParts.father, AGRAND: arParts.grand, AFAMILY: arParts.family,
    EFIRSTNAME: enParts.first, EFATHER: enParts.father, EGRAND: enParts.grand, EFAMILY: enParts.family,
    PASSPORTnumber: v.passportNo.toUpperCase(), PASSPORType: v.passportType, PASSPORT_ISSUE_PLACE: v.issueCountry,
    PASSPORT_ISSUE_DATE: mofaDate(v.issueDate), PASSPORT_EXPIRY_DATe: mofaDate(v.expiryDate),
    BIRTH_PLACE: v.birthPlace, BIRTH_DATE: mofaDate(v.birthDate), PersonId: v.nationalId,
    RELIGION: v.religion, SOCIAL_STATUS: v.social, Sex: v.sex,
    Classify_Occupations_Id: v.jobClass, jobText: v.jobText, DEGREE: v.degree, DEGREE_SOURCE: v.degreeSource,
    ADDRESS_HOME: v.homeAddress, Personal_Email: v.email,
    SPONSER_NAME: v.sponsorName, SPONSER_NUMBER: v.sponsorNumber, SPONSER_ADDRESS: v.sponsorAddress, SPONSER_PHONE: v.sponsorPhone,
    COMING_THROUGH: v.comingThrough, entryPointText: text(OPT.entryPoint, v.entryPoint) || v.entryPoint, ENTRY_POINT: v.entryPoint,
    ExpectedEntryDate: mofaDate(v.expectedEntryDate), porpose: v.purpose, car_number: v.carNumber
  };

  /* المشاكل المانعة (blocking) والتنبيهات */
  const issues = [], warns = [];
  const need = (k, label) => { if (!String(mofa[k] || '').trim()) issues.push(`${label} ناقص`); };
  const len = (k, label, max) => { if (String(mofa[k] || '').length > max) issues.push(`${label} أطول من ${max} حرف (${String(mofa[k]).length})`); };
  need('VisaKind', 'نوع التأشيرة'); need('EmbassyCode', 'الممثلية');
  need('EFIRSTNAME', 'الاسم الإنجليزي (الأول)'); need('EFAMILY', 'اسم العائلة بالإنجليزي');
  need('PASSPORTnumber', 'رقم الجواز'); need('PASSPORType', 'نوع الجواز'); need('PASSPORT_ISSUE_PLACE', 'دولة الإصدار');
  need('PASSPORT_ISSUE_DATE', 'تاريخ الإصدار'); need('PASSPORT_EXPIRY_DATe', 'تاريخ الانتهاء'); need('BIRTH_PLACE', 'مكان الميلاد'); need('BIRTH_DATE', 'تاريخ الميلاد');
  need('RELIGION', 'الديانة'); need('SOCIAL_STATUS', 'الحالة الاجتماعية'); need('Sex', 'الجنس');
  need('Classify_Occupations_Id', 'التصنيف المهني'); need('jobText', 'المهنة'); need('DEGREE', 'المؤهل'); need('DEGREE_SOURCE', 'مصدر المؤهل');
  need('ADDRESS_HOME', 'عنوان السكن'); need('Personal_Email', 'البريد الإلكتروني'); need('ENTRY_POINT', 'منفذ الدخول'); need('ExpectedEntryDate', 'تاريخ الدخول المتوقع');
  for (const [k, label, max] of [['AFIRSTNAME', 'الاسم الأول (عربي)', 15], ['AFATHER', 'الأب (عربي)', 15], ['AGRAND', 'الجد (عربي)', 15], ['AFAMILY', 'العائلة (عربي)', 15],
    ['EFIRSTNAME', 'First Name', 15], ['EFATHER', 'Father', 15], ['EGRAND', 'Grand Father', 15], ['EFAMILY', 'Family Name', 15],
    ['PASSPORTnumber', 'رقم الجواز', 10], ['BIRTH_PLACE', 'مكان الميلاد', 20], ['DEGREE', 'المؤهل', 50], ['DEGREE_SOURCE', 'مصدر المؤهل', 50], ['ADDRESS_HOME', 'عنوان السكن', 200],
    ['SPONSER_NAME', 'اسم الجهة', 100], ['SPONSER_NUMBER', 'رقم الجهة', 10], ['SPONSER_ADDRESS', 'عنوان الجهة', 150], ['SPONSER_PHONE', 'هاتف الجهة', 20]]) len(k, label, max);
  if (mofa.PASSPORTnumber && !/^[A-Z0-9]{1,10}$/.test(mofa.PASSPORTnumber)) issues.push('رقم الجواز لازم حروف وأرقام إنجليزي بس (حد أقصى 10)');
  if (mofa.Personal_Email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mofa.Personal_Email)) issues.push('البريد الإلكتروني غير صحيح');
  if (v.expiryDate && v.issueDate && v.expiryDate <= v.issueDate) issues.push('تاريخ الانتهاء قبل الإصدار');
  if (v.expiryDate && new Date(v.expiryDate) < new Date()) issues.push('الجواز منتهي');
  { const ex = expiryInfo(v.expiryDate, v.expectedEntryDate); if (!ex.expired && ex.short) warns.push('الجواز ينتهي بعد ' + ex.days + ' يوم، أقل من 6 شهور من تاريخ الدخول: المنصة غالباً هترفضه'); }
  if (!files.personalPhoto) issues.push('الصورة الشخصية ناقصة');
  else if (files.personalPhotoSize && files.personalPhotoSize > 1024 * 1024) issues.push('الصورة الشخصية أكبر من 1 ميجا');
  if (!files.passportImage) warns.push('صورة الجواز مش مرفوعة (مش بتتبعت للمنصة، للتوثيق بس)');
  if (/^\s*مطار/.test(mofa.entryPointText || '') && mofa.COMING_THROUGH && mofa.COMING_THROUGH !== '2') warns.push('منفذ الدخول مطار لكن وسيلة الوصول مش «جوا»: الإضافة هتختار «جوا» تلقائياً عشان المنصة تعرض المطارات');
  if (!mofa.NUMBER_OF_ENTRIES || !mofa.Number_Entry_Day || !mofa.RESIDENCY_IN_KSA) warns.push('عدد الدخول/الصلاحية/مدة الإقامة فاضيين: الإضافة هتاخد أول اختيار متاح، راجعه');
  if (!mofa.SPONSER_NAME) warns.push('بيانات جهة العمل فاضية');
  if (!mofa.COMING_THROUGH) warns.push('وسيلة الوصول فاضية');
  if (!v.nationalId) warns.push('الرقم القومي فاضي');
  return { values: v, mofa, issues, warns, ready: issues.length === 0 };
}

/* الجواز لازم يكون صالح 6 شهور على الأقل وقت الدخول: بنقارن بتاريخ الدخول المتوقع (أو النهارده لو مش موجود) */
function expiryInfo(expiryDate, entryDate, now = new Date()) {
  if (!expiryDate) return { days: null, short: false, expired: false };
  const exp = new Date(expiryDate + 'T00:00:00Z'); if (isNaN(exp)) return { days: null, short: false, expired: false };
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  let base = today; const en = entryDate ? new Date(entryDate + 'T00:00:00Z') : null; if (en && !isNaN(en) && en > today) base = en;
  const limit = new Date(base); limit.setUTCMonth(limit.getUTCMonth() + 6);
  return { days: Math.round((exp - today) / 86400000), short: exp < limit, expired: exp < today };
}

module.exports = { expiryInfo, meta, resolve, sanitizeProfile, sanitizePerson, PROFILE_KEYS, PERSON_KEYS, OPT, mofaDate };
