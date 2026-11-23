'use strict';
/* كاتب XLSX بسيط (من غير مكتبات إضافية): كذا ورقة (ممكن ورقة مخفية)، نصوص وأرقام وتواريخ حقيقية، عرض أعمدة، وقوائم اختيار (data validation).
   الخلية: نص | رقم | { date: 'YYYY-MM-DD' } (تاريخ إكسل حقيقي بشكل d/mmm/yyyy) */
const archiver = require('archiver');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const safeName = (n, fb) => String(n || '').replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || fb;
/* تاريخ ISO ← رقم تسلسلي في إكسل (الأيام من 1899-12-30) */
const serial = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) + 25569 : null; };

/* sheet: { name, hidden, headers, rows, widths?, lists?: [{ col, source }] }  ← lists: قايمة اختيار لعمود (source: "Male,Female" أو مدى زي hiddenSheet!$A$1:$A$240) */
function sheetXml(sh) {
  const headers = sh.headers || []; const rows = sh.rows || [];
  const n = Math.max(headers.length, ...rows.slice(0, 500).map((r) => r.length), 1);
  const widths = sh.widths || Array.from({ length: n }, (_, i) => Math.min(40, Math.max(12, String(headers[i] == null ? '' : headers[i]).length + 2, ...rows.slice(0, 200).map((r) => (r[i] && typeof r[i] === 'object' ? 12 : String(r[i] == null ? '' : r[i]).length + 2)))));
  const cell = (v, ref, isHead) => {
    if (v && typeof v === 'object' && v.date) { const s = serial(v.date); return s == null ? '' : `<c r="${ref}" s="2"><v>${s}</v></c>`; }
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${isHead ? ' s="1"' : ''}><v>${v}</v></c>`;
    if (v == null || v === '') return isHead ? `<c r="${ref}" s="1"/>` : '';
    return `<c r="${ref}" t="inlineStr"${isHead ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const all = headers.length ? [headers, ...rows] : rows;
  const body = all.map((r, ri) => `<row r="${ri + 1}">` + Array.from({ length: n }, (_, ci) => cell(r[ci], colName(ci) + (ri + 1), headers.length > 0 && ri === 0)).join('') + '</row>').join('');
  const dv = (sh.lists || []).length ? `<dataValidations count="${sh.lists.length}">` + sh.lists.map((l) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(l.col)}2:${colName(l.col)}${Math.max(rows.length + 1, 1001)}"><formula1>${esc(l.source.includes(',') ? '"' + l.source + '"' : l.source)}</formula1></dataValidation>`).join('') + '</dataValidations>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${dv}</worksheet>`;
}

function build(sheets) {
  /* توافق مع الشكل القديم: build(headers, rows, name) */
  if (Array.isArray(sheets) && arguments.length >= 2 && !(sheets[0] && sheets[0].rows)) sheets = [{ name: arguments[2], headers: arguments[0], rows: arguments[1] }];
  sheets = [].concat(sheets).map((s, i) => ({ ...s, name: safeName(s.name, 'Sheet' + (i + 1)) }));
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    /* الأنماط: 0 عادي · 1 العنوان (خلفية زرقاء فاتحة زي ملف تساهيل) · 2 تاريخ d/mmm/yyyy */
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[$-409]d/mmm/yyyy;@"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9999FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });
  return new Promise((resolve, reject) => {
    const zip = archiver('zip', { zlib: { level: 6 } }); const chunks = [];
    zip.on('data', (d) => chunks.push(d)); zip.on('end', () => resolve(Buffer.concat(chunks))); zip.on('error', reject);
    for (const [name, content] of Object.entries(files)) zip.append(content, { name });
    zip.finalize();
  });
}
module.exports = { build, serial };
