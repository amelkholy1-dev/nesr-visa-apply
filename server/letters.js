'use strict';
/* خطابات الترشيح (Word .docx) بنفس تنسيق نماذج المكتب: «السويس» (خطاب للقنصل بالسويس) و«القاهرة» (استمارة بيانات صاحب العمل وطالب العمل).
   القوالب في server/letters/<kind>/ (ملفات docx مفكوكة، فيها علامات {{name}}…) والكود بيملاها ويحط الصورة الشخصية والباركود ويضغط الملف.
   مفيش أي بيانات حقيقية في القوالب. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const archiver = require('archiver');

const DIR = path.join(__dirname, 'letters');
const KINDS = {
  suez: { label: 'السويس', photoRid: 'rId2', barcodes: [{ rid: 'rId3', key: 'appNo', text: false, ratio: 1381125 / 209550, mod: 4 }, { rid: 'rId4', key: 'visaNo', text: true, ratio: 1714500 / 609600, mod: 3 }], required: [['name', 'الاسم'], ['job', 'المهنة'], ['visaNo', 'رقم التأشيرة'], ['visaDate', 'تاريخ التأشيرة'], ['sponsor', 'اسم جهة العمل'], ['appNo', 'رقم إنجاز (رقم الطلب)']] },
  cairo: { label: 'القاهرة', photoRid: 'rId8', barcodes: [], required: [['name', 'الاسم'], ['passport', 'رقم الجواز'], ['job', 'المهنة'], ['visaNo', 'رقم التأشيرة'], ['unifiedNo', 'رقم السجل (الرقم الموحد)'], ['sponsor', 'اسم جهة العمل'], ['appNo', 'رقم إنجاز (رقم الطلب)']], optional: [['box', 'رقم الصندوق'], ['agency', 'رقم الوكالة']] }
};

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/* ===== باركود Code 128 (B للحروف، C للأرقام الزوجية) ===== */
const PATTERNS = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
function code128Values(text) {
  const t = String(text || '');
  if (/^\d{4,}$/.test(t) && t.length % 2 === 0) { const v = [105]; for (let i = 0; i < t.length; i += 2) v.push(parseInt(t.slice(i, i + 2), 10)); return v; }
  const v = [104]; for (const ch of t) { const c = ch.charCodeAt(0) - 32; v.push(c >= 0 && c < 95 ? c : 0); } return v;
}
function code128Modules(text) { /* مصفوفة 0/1 (1 = أسود) */
  const v = code128Values(text); let sum = v[0]; for (let i = 1; i < v.length; i++) sum += v[i] * i; v.push(sum % 103); v.push(106);
  const bits = []; for (const c of v) { const p = PATTERNS[c]; for (let i = 0; i < p.length; i++) { const n = Number(p[i]); for (let k = 0; k < n; k++) bits.push(i % 2 === 0 ? 1 : 0); } }
  return bits;
}
/* ===== كاتب PNG (رمادي 8 بت) من غير مكتبات ===== */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function png(w, h, pix) {
  const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; pix.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const DIGITS = { 0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], 2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'], 4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'], 6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], 8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'] };
/* صورة باركود: كل خط عرضه عدد صحيح من البكسل (لازم، وإلا الماسح مبيقراش)، والارتفاع من نسبة المكان في الخطاب. text = رقم تحت الباركود (للأرقام بس) */
function barcodePng(value, ratio, text, mod) {
  const mods = code128Modules(value); const quiet = 2; const total = mods.length + quiet * 2; const m = mod || 3;
  const w = total * m; const h = Math.max(24, Math.round(w / ratio));
  const pix = Buffer.alloc(w * h, 255);
  const sc = Math.max(2, Math.round(h / 36)); const textH = text ? 7 * sc + 4 : 0; const barH = h - textH - (text ? 2 : 0);
  for (let i = 0; i < mods.length; i++) if (mods[i]) for (let x = (quiet + i) * m; x < (quiet + i + 1) * m; x++) for (let y = 0; y < barH; y++) pix[y * w + x] = 0;
  if (text) {
    const s = String(value).replace(/\D/g, ''); const gw = 6 * sc; const tw = s.length * gw; let x0 = Math.max(0, Math.floor((w - tw) / 2)); const y0 = barH + 2;
    for (const ch of s) { const g = DIGITS[ch]; if (g) for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '1') for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) { const px = x0 + c * sc + dx; const py = y0 + r * sc + dy; if (px < w && py < h) pix[py * w + px] = 0; } x0 += gw; }
  }
  return png(w, h, pix);
}
/* ===== حجم الصورة (JPEG/PNG) ===== */
function imageInfo(buf) {
  if (buf.length > 24 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2; while (i + 9 < buf.length) { if (buf[i] !== 0xFF) { i++; continue; } const m = buf[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { ext: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + buf.readUInt16BE(i + 2); }
    return { ext: 'jpeg', w: 3, h: 4 };
  }
  return null;
}

/* ===== القوالب ===== */
const cache = {};
function template(kind) {
  if (cache[kind]) return cache[kind];
  const base = path.join(DIR, kind); const files = new Map();
  (function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else files.set(path.relative(base, p).split(path.sep).join('/'), fs.readFileSync(p)); } })(base);
  return (cache[kind] = files);
}
const drawingOf = (xml, rid) => { const re = /<w:drawing>(?:(?!<\/w:drawing>)[\s\S])*?<\/w:drawing>/g; let m; while ((m = re.exec(xml))) if (m[0].includes('r:embed="' + rid + '"')) return m[0]; return null; };
/* بنشيل الرسمة وعلاقتها بملف الصورة (الملف نفسه مش موجود في القالب) عشان Word ميقولش إن الملف تالف */
function removeDrawing(files, xml, rid) {
  const rels = files.get('word/_rels/document.xml.rels').toString('utf8');
  files.set('word/_rels/document.xml.rels', Buffer.from(rels.replace(new RegExp('<Relationship [^>]*Id="' + rid + '"[^>]*/>'), '')));
  const d = drawingOf(xml, rid); return d ? xml.replace(d, '') : xml;
}
function setImage(files, xml, rid, buf, ext, keepHeight) {
  const d = drawingOf(xml, rid); if (!d) return xml;
  const name = 'media/' + rid + '.' + ext; files.set('word/' + name, buf);
  let rels = files.get('word/_rels/document.xml.rels').toString('utf8');
  rels = rels.replace(new RegExp('(<Relationship [^>]*Id="' + rid + '"[^>]*Target=")[^"]*(")'), '$1' + name + '$2').replace(new RegExp('(<Relationship [^>]*Target=")[^"]*("[^>]*Id="' + rid + '")'), '$1' + name + '$2');
  files.set('word/_rels/document.xml.rels', Buffer.from(rels));
  let nd = d.replace(/<a:srcRect[^>]*\/>/g, '');
  if (keepHeight) { /* الصورة الشخصية: نثبّت الارتفاع ونحسب العرض من نسبة الصورة (من غير تمطيط) */
    const info = imageInfo(buf); const cy = Number((/<a:ext cx="\d+" cy="(\d+)"/.exec(nd) || [])[1]); if (info && cy) { const cx = Math.round(cy * info.w / info.h); nd = nd.replace(/(<wp:extent cx=")\d+(" cy=")\d+/, '$1' + cx + '$2' + cy).replace(/(<a:ext cx=")\d+(" cy=")\d+/, '$1' + cx + '$2' + cy); }
  }
  return xml.replace(d, nd);
}
function ensureContentTypes(files) {
  let ct = files.get('[Content_Types].xml').toString('utf8');
  for (const [ext, type] of [['png', 'image/png'], ['jpeg', 'image/jpeg']]) if (!new RegExp('Extension="' + ext + '"', 'i').test(ct)) ct = ct.replace('<Override', '<Default Extension="' + ext + '" ContentType="' + type + '"/><Override');
  files.set('[Content_Types].xml', Buffer.from(ct));
}

/* vars: name, passport, job, degree, visaNo, visaDate, sponsor, unifiedNo, box, agency, appNo ؛ photo: Buffer (اختياري) */
function check(kind, vars) {
  const k = KINDS[kind]; const issues = [], warns = [];
  for (const [key, label] of k.required) if (!String(vars[key] || '').trim()) issues.push(label);
  for (const [key, label] of (k.optional || [])) if (!String(vars[key] || '').trim()) warns.push(label + ' فاضي (هيتساب فاضي في الخطاب)');
  return { issues, warns };
}
function build(kind, vars, photo) {
  if (!KINDS[kind]) return Promise.reject(new Error('نوع الخطاب مش معروف'));
  const k = KINDS[kind]; const files = new Map(template(kind)); /* نسخة */
  let xml = files.get('word/document.xml').toString('utf8');
  /* الصورة الشخصية: لو مفيش، بنشيلها (مش بنسيب صورة شخص تاني) */
  const info = photo && imageInfo(photo);
  xml = info ? setImage(files, xml, k.photoRid, photo, info.ext, true) : removeDrawing(files, xml, k.photoRid);
  for (const b of k.barcodes) { const val = String(vars[b.key] || '').trim(); xml = val ? setImage(files, xml, b.rid, barcodePng(val, b.ratio, b.text, b.mod), 'png', false) : removeDrawing(files, xml, b.rid); }
  /* القاهرة: الجداول عايمة، فلو اسم جهة العمل طويل بنصغّر الخط عشان يفضل في سطر واحد (زي النموذج الأصلي) */
  if (kind === 'cairo') { const n = String(vars.sponsor || '').length; const sz = n > 44 ? 16 : n > 36 ? 18 : n > 28 ? 20 : 0; if (sz) xml = xml.replace('<w:rtl/></w:rPr><w:t>{{sponsor}}</w:t>', '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:rtl/></w:rPr><w:t>{{sponsor}}</w:t>'); }
  for (const [key, val] of Object.entries(vars)) xml = xml.split('{{' + key + '}}').join(esc(String(val == null ? '' : val).trim()));
  xml = xml.replace(/\{\{\w+\}\}/g, '');
  files.set('word/document.xml', Buffer.from(xml));
  ensureContentTypes(files);
  return new Promise((resolve, reject) => {
    const zip = archiver('zip', { zlib: { level: 6 } }); const chunks = [];
    zip.on('data', (d) => chunks.push(d)); zip.on('end', () => resolve(Buffer.concat(chunks))); zip.on('error', reject);
    const names = [...files.keys()].sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : a.localeCompare(b)));
    for (const n of names) zip.append(files.get(n), { name: n });
    zip.finalize();
  });
}
module.exports = { build, check, KINDS, code128Values, barcodePng, imageInfo };
