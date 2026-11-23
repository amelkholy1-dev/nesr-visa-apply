'use strict';
/* اختبار خطابات الترشيح (Word) من غير قاعدة بيانات: القوالب بتتملي، الصورة والباركود بيتحطوا، ومفيش بيانات من القالب الأصلي بتفضل */
const assert = require('assert');
const zlib = require('zlib');
const L = require('../server/letters');

/* قارئ zip بسيط (STORE/DEFLATE) للاختبار بس */
function unzip(buf) {
  const out = new Map(); let i = 0;
  while (i + 30 < buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const flags = buf.readUInt16LE(i + 6); const method = buf.readUInt16LE(i + 8); let csize = buf.readUInt32LE(i + 18); const nlen = buf.readUInt16LE(i + 26); const xlen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nlen).toString('utf8'); const start = i + 30 + nlen + xlen;
    if (flags & 8) { /* الحجم بعد البيانات (data descriptor): بندوّر على التوقيع */ let j = start; while (j + 16 < buf.length && !(buf.readUInt32LE(j) === 0x08074b50 && buf.readUInt32LE(j + 8) > 0 && j - start === buf.readUInt32LE(j + 8))) j++; csize = j - start; const data = buf.slice(start, start + csize); out.set(name, method === 8 ? zlib.inflateRawSync(data) : data); i = j + 16; continue; }
    const data = buf.slice(start, start + csize); out.set(name, method === 8 ? zlib.inflateRawSync(data) : data); i = start + csize;
  }
  return out;
}
const PHOTO = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const vars = { name: 'محمد أحمد علي حسن', passport: 'A12345678', job: 'سائق حافلة', degree: 'دبلوم', visaNo: '1306311796', visaDate: '1448/02/30', sponsor: 'شركة تجربة & للنقل <اختبار>', unifiedNo: '7001185532', box: '464', agency: '30000001', appNo: 'E823565987' };

(async () => {
  /* Code 128: رقم زوجي ← Code C، وغيره ← Code B */
  assert.deepStrictEqual(L.code128Values('1306311796'), [105, 13, 6, 31, 17, 96]);
  assert.strictEqual(L.code128Values('E823565987')[0], 104);
  const bc = L.barcodePng('1306311796', 1714500 / 609600, true, 3); assert.strictEqual(bc.slice(1, 4).toString(), 'PNG');

  /* كل خط في الباركود عرضه مضاعفات صحيحة من البكسل (وإلا الماسح مبيقراش): بنفك الـ PNG ونقيس */
  for (const [val, ratio, text, mod] of [['E823565987', 1381125 / 209550, false, 4], ['1306311796', 1714500 / 609600, true, 3]]) {
    const b = L.barcodePng(val, ratio, text, mod); let off = 8; const idat = []; let w = 0; let h = 0;
    while (off < b.length) { const len = b.readUInt32BE(off); const type = b.slice(off + 4, off + 8).toString(); if (type === 'IHDR') { w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12); } if (type === 'IDAT') idat.push(b.slice(off + 8, off + 8 + len)); off += 12 + len; }
    const raw = zlib.inflateSync(Buffer.concat(idat)); const row = raw.slice(1, 1 + w); let run = 1; const runs = [];
    for (let x = 1; x <= w; x++) { if (x < w && row[x] === row[x - 1]) run++; else { runs.push(run); run = 1; } }
    assert.ok(runs.every((r) => r % mod === 0), 'عرض كل خط مضاعف ' + mod + ' بكسل: ' + runs.slice(0, 8)); assert.ok(Math.abs(w / h - ratio) < 0.08, 'نسبة الصورة زي مكانها في الخطاب');
  }
  for (const kind of ['suez', 'cairo']) {
    const z = unzip(await L.build(kind, vars, PHOTO)); const doc = z.get('word/document.xml').toString('utf8');
    assert.ok(z.has('[Content_Types].xml') && z.has('word/document.xml'), kind + ': ملفات docx الأساسية');
    for (const s of ['محمد أحمد علي حسن', 'E823565987', '1306311796', 'سائق حافلة'].concat(kind === 'cairo' ? ['A12345678'] : [])) assert.ok(doc.includes(s), kind + ': فيه ' + s);
    assert.ok(doc.includes('شركة تجربة &amp; للنقل &lt;اختبار&gt;'), kind + ': الرموز الخاصة اتهربت');
    assert.ok(!doc.includes('{{'), kind + ': مفيش علامات فاضية');
    for (const old of ['حسام', 'المويلحي', 'احمد عبد', 'E825829522', '1907927075']) assert.ok(!doc.includes(old), kind + ': مفيش بيانات من القالب الأصلي: ' + old);
    const rels = z.get('word/_rels/document.xml.rels').toString('utf8');
    for (const t of rels.match(/Target="media\/[^"]+"/g) || []) assert.ok(z.has('word/' + t.slice(8, -1)), kind + ': ملف الصورة موجود ' + t);
    const photoRid = kind === 'suez' ? 'rId2' : 'rId8'; assert.ok([...z.keys()].some((n) => n.startsWith('word/media/' + photoRid + '.jpeg')), kind + ': الصورة الشخصية اتحطت');
    if (kind === 'suez') { assert.ok(z.has('word/media/rId3.png') && z.has('word/media/rId4.png'), 'باركودين'); assert.ok(doc.includes('1448/02/30')); }
    else { assert.ok(doc.includes('7001185532') && doc.includes('464') && doc.includes('30000001') && doc.includes('دبلوم'), 'بيانات القاهرة'); }
    /* من غير صورة: بنشيلها بدل ما نسيب صورة شخص تاني، ومن غير علاقات مكسورة */
    const z2 = unzip(await L.build(kind, vars, null)); const rels2 = z2.get('word/_rels/document.xml.rels').toString('utf8');
    assert.ok(![...z2.keys()].some((n) => n.startsWith('word/media/' + photoRid)), kind + ': من غير صورة');
    for (const t of rels2.match(/Target="media\/[^"]+"/g) || []) assert.ok(z2.has('word/' + t.slice(8, -1)), kind + ': من غير علاقات مكسورة ' + t);
    assert.ok(!z2.get('word/document.xml').toString('utf8').includes('r:embed="' + photoRid + '"'));
  }
  /* الاسم الطويل لجهة العمل في القاهرة بيصغّر الخط */
  const long = unzip(await L.build('cairo', { ...vars, sponsor: 'الشركة الوطنية الدولية لخدمات المعتمرين والحجاج' }, PHOTO)).get('word/document.xml').toString('utf8');
  assert.ok(/<w:sz w:val="16"\/><w:szCs w:val="16"\/><w:rtl\/><\/w:rPr><w:t>الشركة الوطنية الدولية/.test(long), 'تصغير خط الاسم الطويل');
  const c = L.check('cairo', { name: 'س' }); assert.ok(c.issues.includes('رقم التأشيرة') && c.warns.length === 2);
  assert.deepStrictEqual(L.check('suez', vars), { issues: [], warns: [] });
  console.log('letters OK');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
