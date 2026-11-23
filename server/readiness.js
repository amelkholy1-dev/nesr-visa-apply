'use strict';
/* جاهزية الشخص لكل خدمة (المنصة / وافد / المعمل / خطاب السويس / خطاب القاهرة): بيرجّع قايمة النواقص لكل خدمة. بيستخدمه الأشخاص والإحصائيات. */
const F = require('./fields');
const wafidSvc = require('./wafid');
const labSvc = require('./lab');
const letters = require('./letters');

const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const SERVICES = [['mofa', 'المنصة'], ['wafid', 'وافد'], ['lab', 'المعمل'], ['suez', 'خطاب السويس'], ['cairo', 'خطاب القاهرة']];
function letterVars(row, v) {
  return { name: v.nameAr || row.name_ar || '', passport: String(v.passportNo || '').toUpperCase(), job: v.jobText || '', degree: v.degree || 'لايوجد', visaNo: v.visaNumber || '', visaDate: v.visaDate || '', sponsor: v.sponsorName || '',
    unifiedNo: v.unifiedNumber || v.sponsorNumber || '', box: v.boxNumber || '', agency: v.agencyNumber || '', appNo: row.app_number || '' };
}
function readiness(row, profile, photoSize) {
  const d = json(row.data); const pd = profile && profile.data; const out = {};
  const mofa = F.resolve(d, pd, { personalPhoto: row.personal_photo, personalPhotoSize: photoSize || 0, passportImage: row.passport_image });
  out.mofa = mofa.issues; out.wafid = wafidSvc.build(d, pd).issues; out.lab = labSvc.build(d, pd, row.app_number).issues;
  const vars = letterVars(row, mofa.values); out.suez = letters.check('suez', vars).issues; out.cairo = letters.check('cairo', vars).issues;
  return out;
}
module.exports = { readiness, letterVars, SERVICES };
