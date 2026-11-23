'use strict';
/* كاتب XLS حقيقي (Excel 97-2003 / BIFF8 جوه حاوية OLE) من غير مكتبات: كذا ورقة (ممكن مخفية)، نصوص وأرقام وتواريخ حقيقية بشكل d/mmm/yyyy،
   عنوان بخلفية زرقاء فاتحة، وعرض أعمدة. مفيش قوايم اختيار (data validation) هنا.
   الخلية: نص | رقم | { date: 'YYYY-MM-DD' } */

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xFFFF); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const f64 = (n) => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; };
const rec = (type, ...parts) => { const d = Buffer.concat(parts); return Buffer.concat([u16(type), u16(d.length), d]); };
/* نص يونيكود: لو كله Latin-1 بيتخزّن مضغوط (بايت لكل حرف) وإلا UTF-16 */
function ustr(s, lenBytes) {
  s = String(s == null ? '' : s); const wide = /[^\u0000-ÿ]/.test(s);
  return Buffer.concat([lenBytes === 1 ? Buffer.from([s.length & 0xFF]) : u16(s.length), Buffer.from([wide ? 1 : 0]), Buffer.from(s, wide ? 'utf16le' : 'latin1')]);
}
const safeName = (n, fb) => String(n || '').replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || fb;
/* تاريخ ISO ← رقم تسلسلي في إكسل */
const serial = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) + 25569 : null; };

const XF_DEFAULT = 15, XF_HEADER = 16, XF_DATE = 17;
const BOF = (type) => rec(0x0809, u16(0x0600), u16(type), u16(0x0DBB), u16(0x07CC), u32(0), u32(6));
const EOF = () => rec(0x000A);

function xf(font, fmt, style, opts = {}) {
  /* 20 بايت: خط، شكل رقم، علامات (النمط/الأب)، محاذاة، دوران، مسافة، خصائص مستخدمة، حدود، لون وتعبئة */
  return rec(0x00E0, u16(font), u16(fmt), u16(style ? 0xFFF5 : 0x0001), Buffer.from([opts.wrap ? 0x28 : 0x20, 0, 0, style ? 0xF4 : 0xFC]),
    u16(0), u16(0), u32(opts.fill ? (1 << 26) : 0), u16(opts.fill ? (24 | (0x41 << 7)) : (0x40 | (0x41 << 7))));
}
function font(bold) {
  const name = 'Calibri';
  return rec(0x0031, u16(220), u16(0), u16(0x7FFF), u16(bold ? 700 : 400), u16(0), Buffer.from([0, 0, 0, 0]), Buffer.from([name.length, 0]), Buffer.from(name, 'latin1'));
}

function sheetStream(sh) {
  const headers = sh.headers || []; const rows = sh.rows || [];
  const all = headers.length ? [headers, ...rows] : rows;
  const n = Math.max(headers.length, ...rows.slice(0, 500).map((r) => r.length), 1);
  const widths = sh.widths || Array.from({ length: n }, (_, i) => Math.min(40, Math.max(12, String(headers[i] == null ? '' : headers[i]).length + 2, ...rows.slice(0, 200).map((r) => (r[i] && typeof r[i] === 'object' ? 12 : String(r[i] == null ? '' : r[i]).length + 2)))));
  const parts = [BOF(0x0010)];
  widths.forEach((w, i) => parts.push(rec(0x007D, u16(i), u16(i), u16(Math.min(65535, Math.round(w * 256))), u16(XF_DEFAULT), u16(0), u16(0))));
  parts.push(rec(0x0200, u32(0), u32(all.length), u16(0), u16(n), u16(0)));
  all.forEach((r, ri) => {
    parts.push(rec(0x0208, u16(ri), u16(0), u16(n), u16(255), u16(0), u16(0), u32(0x100)));
    const isHead = headers.length > 0 && ri === 0;
    for (let ci = 0; ci < n; ci++) {
      const v = r[ci]; const xfi = isHead ? XF_HEADER : XF_DEFAULT;
      if (v && typeof v === 'object' && v.date) { const s = serial(v.date); if (s != null) parts.push(rec(0x0203, u16(ri), u16(ci), u16(XF_DATE), f64(s))); }
      else if (typeof v === 'number' && isFinite(v)) parts.push(rec(0x0203, u16(ri), u16(ci), u16(xfi), f64(v)));
      else if (v == null || v === '') { if (isHead) parts.push(rec(0x0201, u16(ri), u16(ci), u16(xfi))); }
      else parts.push(rec(0x0204, u16(ri), u16(ci), u16(xfi), ustr(String(v).slice(0, 32000), 2)));
    }
  });
  parts.push(rec(0x023E, u16(0x06B6), u16(0), u16(0), u32(0x40), u16(0), u16(0), u32(0)), EOF());
  return Buffer.concat(parts);
}

function workbookStream(sheets) {
  const globals = (offsets) => Buffer.concat([
    BOF(0x0005), rec(0x0042, u16(1200)), rec(0x0022, u16(0)),
    font(false), font(false), font(false), font(false), font(false), font(true), /* 0..4 عادي (4 محجوز) و5 عريض */
    rec(0x041E, u16(164), ustr('[$-409]d/mmm/yyyy;@', 2)),
    ...Array.from({ length: 15 }, () => xf(0, 0, true)), xf(0, 0, false), xf(0, 0, false, { fill: true, wrap: true }), xf(0, 164, false),
    rec(0x0293, u16(0x8000), Buffer.from([0, 0xFF])),
    rec(0x003D, u16(0x0168), u16(0x005A), u16(0x3FFC), u16(0x2000), u16(0x0038), u16(0), u16(0), u16(1), u16(600)),
    ...sheets.map((s, i) => rec(0x0085, u32(offsets[i]), Buffer.from([s.hidden ? 1 : 0, 0]), Buffer.from([s.name.length, 0]), Buffer.from(s.name, 'latin1'))),
    EOF()
  ]);
  /* أسماء الأوراق لازم تكون ASCII (اسم يونيكود محتاج علامة تانية): بنحوّل أي حرف غير ASCII لـ _ */
  sheets.forEach((s) => { s.name = s.name.replace(/[^\x20-\x7e]/g, '_'); });
  const streams = sheets.map(sheetStream);
  const glen = globals(sheets.map(() => 0)).length;
  const offsets = []; let pos = glen; for (const s of streams) { offsets.push(pos); pos += s.length; }
  return Buffer.concat([globals(offsets), ...streams]);
}

/* حاوية OLE2 (CFB) فيها stream واحد اسمه Workbook */
function cfb(stream) {
  const SEC = 512, END = 0xFFFFFFFE, FATSEC = 0xFFFFFFFD, FREE = 0xFFFFFFFF;
  if (stream.length < 4096) stream = Buffer.concat([stream, Buffer.alloc(4096 - stream.length)]); /* أقل من 4096 بيتخزّن بطريقة تانية: بنكبّره بأصفار */
  const dataSecs = Math.ceil(stream.length / SEC);
  let fatSecs = 1; while (fatSecs * 128 < dataSecs + 1 + fatSecs) fatSecs++;
  const total = dataSecs + 1 + fatSecs; const dirSec = dataSecs;
  const fat = Buffer.alloc(fatSecs * SEC, 0xFF);
  for (let i = 0; i < dataSecs; i++) fat.writeUInt32LE(i === dataSecs - 1 ? END : i + 1, i * 4);
  fat.writeUInt32LE(END, dirSec * 4);
  for (let i = 0; i < fatSecs; i++) fat.writeUInt32LE(FATSEC, (dataSecs + 1 + i) * 4);
  const head = Buffer.alloc(SEC, 0);
  Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]).copy(head, 0);
  head.writeUInt16LE(0x003E, 24); head.writeUInt16LE(3, 26); head.writeUInt16LE(0xFFFE, 28); head.writeUInt16LE(9, 30); head.writeUInt16LE(6, 32);
  head.writeUInt32LE(fatSecs, 44); head.writeUInt32LE(dirSec, 48); head.writeUInt32LE(4096, 56); head.writeUInt32LE(END, 60); head.writeUInt32LE(0, 64); head.writeUInt32LE(END, 68); head.writeUInt32LE(0, 72);
  for (let i = 0; i < 109; i++) head.writeUInt32LE(i < fatSecs ? dataSecs + 1 + i : FREE, 76 + i * 4);
  const entry = (name, type, child, start, size) => {
    const e = Buffer.alloc(128, 0); if (name) { Buffer.from(name, 'utf16le').copy(e, 0); e.writeUInt16LE((name.length + 1) * 2, 64); }
    e[66] = type; e[67] = 1; e.writeUInt32LE(FREE, 68); e.writeUInt32LE(FREE, 72); e.writeUInt32LE(child, 76); e.writeUInt32LE(start, 116); e.writeUInt32LE(size, 120); return e;
  };
  const empty = () => { const e = Buffer.alloc(128, 0); e.writeUInt32LE(FREE, 68); e.writeUInt32LE(FREE, 72); e.writeUInt32LE(FREE, 76); return e; };
  const dir = Buffer.concat([entry('Root Entry', 5, 1, END, 0), entry('Workbook', 2, FREE, 0, stream.length), empty(), empty()]);
  const padded = Buffer.concat([stream, Buffer.alloc(dataSecs * SEC - stream.length)]);
  const out = Buffer.concat([head, padded, dir, fat]);
  if (out.length !== SEC * (1 + total)) throw new Error('xls: حجم الحاوية غلط');
  return out;
}

function build(sheets) {
  sheets = [].concat(sheets).map((s, i) => ({ ...s, name: safeName(s.name, 'Sheet' + (i + 1)) }));
  return Promise.resolve(cfb(workbookStream(sheets)));
}
module.exports = { build, serial };
