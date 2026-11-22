'use strict';
/* قراءة سطري MRZ في الجواز (TD3: سطرين × 44 حرف) مع فحص أرقام التحقق (check digits).
   القراءة اللي بتعدّي الفحص دقتها عالية جداً. اللي مبتعدّيش بنعلّمها «محتاجة مراجعة».
   بيطلّع: الاسم الإنجليزي (لقب + أسماء)، رقم الجواز، الجنسية، الميلاد، الانتهاء، النوع، الرقم الشخصي. */

const W = [7, 3, 1];
const val = (c) => (c >= '0' && c <= '9') ? c.charCodeAt(0) - 48 : (c >= 'A' && c <= 'Z') ? c.charCodeAt(0) - 55 : 0; // '<' = 0
function checkDigit(s) { let t = 0; for (let i = 0; i < s.length; i++) t += val(s[i]) * W[i % 3]; return t % 10; }

/* أشهر لخبطة بين الحروف والأرقام في القراءة الضوئية */
const TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };
const ALT = { '0': ['O', 'D', 'Q'], O: ['0'], D: ['0'], Q: ['0'], '1': ['I', 'L'], I: ['1'], L: ['1'], '2': ['Z'], Z: ['2'], '5': ['S'], S: ['5'], '8': ['B'], B: ['8'], '6': ['G'], G: ['6'], '7': ['T'], T: ['7'] };
const digitsOnly = (s) => s.split('').map(c => TO_DIGIT[c] || c).join('');
const okDigits = (s) => /^\d+$/.test(s);

/* يجرّب بدائل لحرف ملخبط (تبديل واحد بس) لحد ما رقم التحقق يطابق */
function fixByCheck(field, check, digitsOnlyField, maxSubs = 1) {
  const wantCheck = /^\d$/.test(check) ? Number(check) : -1;
  if (wantCheck < 0) return null;
  const pos = [];
  for (let i = 0; i < field.length; i++) if (ALT[field[i]]) pos.push(i);
  const tryRec = (idx, cur, left) => {
    if (checkDigit(cur) === wantCheck && (!digitsOnlyField || okDigits(cur))) return cur;
    if (left === 0) return null;
    for (let k = idx; k < pos.length; k++) {
      const i = pos[k];
      for (const alt of ALT[cur[i]] || []) { const r = tryRec(k + 1, cur.slice(0, i) + alt + cur.slice(i + 1), left - 1); if (r) return r; }
    }
    return null;
  };
  return tryRec(0, field, maxSubs);
}

const clean = (t) => String(t || '').toUpperCase().replace(/[«»]/g, '<').replace(/[^A-Z0-9<]/g, '');

/* YYMMDD ← YYYY-MM-DD (الميلاد في الماضي، الانتهاء ممكن يبقى في المستقبل) */
function ymd(s, kind) {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const nowY = new Date().getFullYear() % 100;
  const year = kind === 'birth' ? (yy > nowY ? 1900 + yy : 2000 + yy) : (yy <= nowY + 25 ? 2000 + yy : 1900 + yy);
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/* السطر الأول: P<EGYSURNAME<<GIVEN<NAMES<<< */
function parseLine1(l) {
  const out = { raw: l, docType: l.slice(0, 2).replace(/</g, ''), country: l.slice(2, 5).replace(/</g, ''), surname: '', given: [] };
  const names = l.slice(5);
  const i = names.indexOf('<<');
  const sur = (i >= 0 ? names.slice(0, i) : names).replace(/</g, ' ').trim();
  const giv = (i >= 0 ? names.slice(i + 2) : '').replace(/<+$/g, '').split('<').map(x => x.trim()).filter(Boolean);
  out.surname = sur; out.given = giv;
  return out;
}

/* السطر التاني (البيانات). بيظبط الإزاحة لو الحروف ملخبطة قدام الجنسية */
function alignLine2(l) {
  if (l.length === 44) return l;
  const i = l.search(/[A-Z]{3}\d{6}\d[MF<]\d{6}\d/);
  if (i >= 8 && i <= 12) {
    let s = l.slice(Math.max(0, i - 10));
    if (i < 10) s = '<'.repeat(10 - i) + l;
    return (s + '<'.repeat(44)).slice(0, 44);
  }
  if (l.length > 44) return l.slice(0, 44);
  return (l + '<'.repeat(44)).slice(0, 44);
}

function parseLine2(raw) {
  const l = alignLine2(raw);
  const out = { raw: l, checks: {} };
  const no = l.slice(0, 9), noC = digitsOnly(l[9]);
  const fixedNo = checkDigit(no) === +noC ? no : fixByCheck(no, noC, false);
  out.corrected = !!fixedNo && fixedNo !== no;
  out.checks.number = !!fixedNo && /^\d$/.test(noC);
  out.passportNumber = (fixedNo || no).replace(/</g, '');
  out.nationality = l.slice(10, 13).replace(/</g, '');
  if (out.nationality === 'EGY' && !/^[A-Z]\d{7,8}$/.test(out.passportNumber)) out.checks.number = false; // الجواز المصري: حرف + 7 أو 8 أرقام
  const dob = digitsOnly(l.slice(13, 19)), dobC = digitsOnly(l[19]);
  const fixedDob = checkDigit(dob) === +dobC ? dob : fixByCheck(dob, dobC, true);
  out.checks.birth = !!fixedDob && okDigits(dobC);
  const ex = digitsOnly(l.slice(21, 27)), exC = digitsOnly(l[27]);
  const fixedEx = checkDigit(ex) === +exC ? ex : fixByCheck(ex, exC, true);
  out.checks.expiry = !!fixedEx && okDigits(exC);
  out.sex = l[20] === 'M' || l[20] === 'F' ? l[20] : '';
  out.birthDate = ymd(fixedDob || dob, 'birth');
  out.expiryDate = ymd(fixedEx || ex, 'expiry');
  const per = l.slice(28, 42), perC = digitsOnly(l[42]);
  out.personalNumber = digitsOnly(per).replace(/</g, '');
  out.checks.personal = checkDigit(per) === +perC || /^<+$/.test(per);
  out.checks.composite = (() => {
    const c = (fixedNo || no) + l[9] + l.slice(13, 20) + l.slice(21, 28) + l.slice(28, 43);
    return checkDigit(c.replace(/[^A-Z0-9<]/g, '<')) === +digitsOnly(l[43]);
  })();
  if (!out.birthDate) out.checks.birth = false;
  if (!out.expiryDate) out.checks.expiry = false;
  const strong = out.checks.number && out.checks.birth && out.checks.expiry;
  out.corrected = out.corrected || (!!fixedDob && fixedDob !== dob) || (!!fixedEx && fixedEx !== ex);
  out.confidence = strong && out.checks.composite && !out.corrected ? 'high' : (out.checks.number && out.checks.expiry ? 'medium' : 'low');
  return out;
}

/* من نص كامل (قراءة ضوئية أو لصق): يلاقي سطري MRZ ويرجّع أحسن نتيجة (أو null) */
function parseMrzText(text) {
  const lines = String(text || '').split(/\r?\n/).map(clean).filter(l => l.length >= 28);
  const cands = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^P[<A-Z]/.test(l) && l.length >= 30 && /<</.test(l) && lines[i + 1]) cands.push({ l1: parseLine1(l), l2: parseLine2(lines[i + 1]) });
  }
  if (!cands.length) {
    for (let i = 0; i < lines.length; i++) if ((lines[i].match(/\d/g) || []).length >= 14 && !/<</.test(lines[i].slice(0, 20))) cands.push({ l1: i > 0 && /<</.test(lines[i - 1]) ? parseLine1(lines[i - 1]) : null, l2: parseLine2(lines[i]) });
  }
  const rank = { high: 3, medium: 2, low: 1 };
  cands.sort((a, b) => rank[b.l2.confidence] - rank[a.l2.confidence]);
  const best = cands[0];
  if (!best) return null;
  const { l1, l2 } = best;
  return {
    confidence: l2.confidence, checks: l2.checks, corrected: l2.corrected,
    surname: l1 ? l1.surname : '', given: l1 ? l1.given : [], country: l1 ? l1.country : '',
    passportNumber: l2.passportNumber, nationality: l2.nationality, sex: l2.sex,
    birthDate: l2.birthDate, expiryDate: l2.expiryDate, personalNumber: l2.personalNumber,
    lines: [l1 ? l1.raw : '', l2.raw]
  };
}

module.exports = { checkDigit, parseLine1, parseLine2, parseMrzText, ymd };
