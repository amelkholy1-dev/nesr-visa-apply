'use strict';
/* سجل النشاط: مين عمل إيه ومتى. بيتكتب في الخلفية ومبيوقّفش أي عملية لو فشل. */
const db = require('./db');

function log(req, action, personId, personName, detail) {
  try {
    const u = (req && req.user) || {};
    db.query('INSERT INTO activity (user_id, user_name, action, person_id, person_name, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [u.id || null, String(u.name || u.username || '').slice(0, 120), String(action).slice(0, 30), personId || null, String(personName || '').slice(0, 255), String(detail || '').slice(0, 500)]).catch(() => {});
  } catch (e) { /* مش مهم */ }
}
const LABELS = {
  login: 'دخول', create: 'إضافة شخص', update: 'تعديل بيانات', delete: 'حذف شخص', photo: 'رفع صورة شخصية', passport: 'رفع صورة جواز', 'del-file': 'حذف صورة',
  fill: 'ملا الطلب في المنصة', filled: 'الفورم اتملى', submitted: 'الطلب اتبعت', status: 'تغيير حالة', bulk: 'رفع جماعي', stage: 'تحديث مرحلة', export: 'تصدير', print: 'طباعة'
};
module.exports = { log, LABELS };
