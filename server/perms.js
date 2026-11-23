'use strict';
/* الصلاحيات: كل مستخدم ليه قايمة صلاحيات. الأدوار (مدير/مشرف/موظف/مشاهد) مجرد قوالب جاهزة، والمدير يقدر يضبط أي صلاحية لوحدها. */
const PERMS = {
  'people.view': 'عرض الأشخاص وملفاتهم',
  'people.edit': 'إضافة وتعديل الأشخاص ورفع الصور',
  'people.mark': 'تعليم المراحل والحالات (منصة / فحص طبي / معمل / خطاب)',
  'people.fill': 'استخدام الإضافة (منصة / وافد / معمل) وطباعة الخطابات',
  'people.delete': 'حذف الأشخاص (الموظف يحذف اللي هو أضافه بس)',
  'profiles.edit': 'إدارة ملفات الضبط (دفعات التأشيرات)',
  'payments.view': 'الحسابات: شوف التكلفة والمدفوع والمتبقي',
  'payments.edit': 'الحسابات: سجّل دفعة أو امسحها',
  'export': 'التصدير (تساهيل Excel / CSV)',
  'stats.view': 'الإحصائيات والتقارير',
  'activity.view': 'سجل النشاط',
  'users.manage': 'إدارة المستخدمين والإعدادات'
};
const ALL = Object.keys(PERMS);
const ROLES = {
  admin: { label: 'مدير', desc: 'كل الصلاحيات', perms: ALL },
  manager: { label: 'مشرف', desc: 'كل حاجة ما عدا المستخدمين', perms: ALL.filter((p) => p !== 'users.manage') },
  staff: { label: 'موظف', desc: 'يشتغل على الأشخاص ويستخدم الإضافة', perms: ['people.view', 'people.edit', 'people.mark', 'people.fill', 'people.delete', 'profiles.edit', 'stats.view', 'payments.view', 'payments.edit'] },
  viewer: { label: 'مشاهد', desc: 'يشوف بس', perms: ['people.view', 'stats.view'] }
};
const roleOf = (r) => (r === 'user' ? 'staff' : r === 'custom' ? 'custom' : ROLES[r] ? r : 'staff'); /* 'user' هو الدور القديم، و'custom' = صلاحيات مخصّصة */
function parse(raw) { try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((p) => ALL.includes(p)) : null; } catch (e) { return null; } }
/* الصلاحيات الفعلية: المدير كل حاجة دايماً، وغيره: المخزّنة لو موجودة وإلا قالب الدور */
function effective(role, rawPerms) {
  const r = roleOf(role); if (r === 'admin') return ALL.slice();
  const stored = parse(rawPerms); return stored || (ROLES[r] || ROLES.staff).perms.slice();
}
const sanitize = (list) => [...new Set((Array.isArray(list) ? list : []).filter((p) => ALL.includes(p)))];
/* قالب الدور المناسب لقايمة (لو مطابقة تمام لقالب بنرجّعه، وإلا 'custom') */
function roleFor(list) { const s = sanitize(list).sort().join(','); for (const [k, v] of Object.entries(ROLES)) if (v.perms.slice().sort().join(',') === s) return k; return 'custom'; }
/* ميدلوير: لازم صلاحية */
const need = (perm) => (req, res, next) => (req.user && req.user.perms && req.user.perms.includes(perm) ? next() : res.status(403).json({ error: 'مش مسموحلك بالعملية دي (محتاج صلاحية: ' + (PERMS[perm] || perm) + ')' }));
const has = (req, perm) => !!(req.user && req.user.perms && req.user.perms.includes(perm));
module.exports = { PERMS, ALL, ROLES, roleOf, effective, sanitize, roleFor, need, has, parse };
