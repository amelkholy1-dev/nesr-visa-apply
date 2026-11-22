'use strict';
/* طباعة: ورقة بيانات الطلب، التعهد، خطاب الترشيح، وليبل الباركود. الدوال هنا بتبني HTML بس (من غير DOM) والصفحة هي اللي بتفتح نافذة الطباعة. */
(function () {
  /* Code 128 (مجموعة B) → SVG */
  const PAT = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
  function code128(text) {
    const vals = [104]; let sum = 104;
    String(text).split('').forEach((ch, i) => { let c = ch.charCodeAt(0) - 32; if (c < 0 || c > 94) c = 0; vals.push(c); sum += c * (i + 1); });
    vals.push(sum % 103, 106);
    let x = 10, bars = '';
    for (const v of vals) { const p = PAT[v]; for (let i = 0; i < p.length; i++) { const w = +p[i]; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="60"/>`; x += w; } }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 60" preserveAspectRatio="none" style="width:100%;height:100%"><g fill="#000">${bars}</g></svg>`, vals };
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const fill = (tpl, vars) => esc(String(tpl || '')).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? esc(vars[k]) : m)).replace(/\n/g, '<br>');

  const BASE_CSS = `@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font:14px/1.7 "Segoe UI",Tahoma,Arial,sans-serif;color:#111;direction:rtl}
  .hd{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1e5b61;padding-bottom:8px;margin-bottom:14px}.hd b{font-size:20px;color:#1e5b61}.hd span{color:#555;font-size:12px}
  h1{font-size:18px;margin:6px 0 12px;text-align:center}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px 9px;text-align:right;vertical-align:top}th{background:#eef3f3;width:22%;font-weight:700}
  .row{display:flex;gap:16px;align-items:flex-start}.ph{width:34mm;height:44mm;border:1px solid #777;object-fit:cover}.bc{height:16mm;width:70mm;margin:6px 0}.txt{font-size:15px;line-height:2.1}
  .no-print{margin:10px 0;text-align:center}.no-print button{padding:8px 18px;font-size:15px;cursor:pointer}@media print{.no-print{display:none}}`;
  const page = (title, css, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${css || ''}</style></head><body><div class="no-print"><button onclick="window.print()">طباعة</button></div>${body}<script>setTimeout(function(){try{window.focus();window.print()}catch(e){}},500)</script></body></html>`;
  const header = (s) => `<div class="hd"><b>${esc(s.company)}</b><span>${esc(s.line2 || '')}</span></div>`;

  function nameEn(m) { return [m.EFIRSTNAME, m.EFATHER, m.EGRAND, m.EFAMILY].filter(Boolean).join(' '); }
  function ctx(o) {
    const m = (o.resolved && o.resolved.mofa) || {}; const d = o.person.data || {};
    return { m, d, vars: { name: o.person.data.nameAr || nameEn(m), passport: m.PASSPORTnumber || d.passportNo || '', app: o.person.appNumber || '..........', date: today(), company: o.settings.company, sponsor: m.SPONSER_NAME || '' } };
  }

  function sheet(o) {
    const { m, d, vars } = ctx(o); const ot = o.optText || ((a, b) => b);
    const rows = [['الاسم بالعربي', vars.name], ['الاسم بالإنجليزي', nameEn(m)], ['رقم الجواز', m.PASSPORTnumber], ['تاريخ الميلاد', m.BIRTH_DATE], ['مكان الميلاد', m.BIRTH_PLACE], ['الرقم القومي', m.PersonId], ['الجنس', ot('sex', d.sex)],
      ['تاريخ إصدار الجواز', m.PASSPORT_ISSUE_DATE], ['تاريخ انتهاء الجواز', m.PASSPORT_EXPIRY_DATe], ['الجنسية', 'مصر'], ['المهنة', m.jobText], ['نوع التأشيرة', ot('visaKind', d.visaKind || (o.profile && o.profile.data.visaKind))], ['الممثلية', ot('embassy', (o.profile && o.profile.data.embassy))],
      ['جهة العمل', m.SPONSER_NAME], ['تاريخ الدخول المتوقع', m.ExpectedEntryDate], ['الجوال', d.phone], ['البريد الإلكتروني', m.Personal_Email]];
    const bc = o.person.appNumber ? code128(o.person.appNumber).svg : '';
    return page('ورقة طلب ' + vars.name, '', `${header(o.settings)}<h1>بيانات طلب التأشيرة</h1><div class="row"><div style="flex:1"><table>${rows.filter((r) => r[1]).map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table></div>${o.photoUrl ? `<img class="ph" src="${esc(o.photoUrl)}">` : ''}</div>
      <p><b>رقم الطلب:</b> <span dir="ltr">${esc(o.person.appNumber || '—')}</span></p>${bc ? `<div class="bc">${bc}</div>` : ''}<p style="color:#666;font-size:12px">طُبعت بتاريخ ${vars.date}</p>`);
  }
  function undertaking(o) { const { vars } = ctx(o); return page('تعهد ' + vars.name, '', `${header(o.settings)}<h1>تعهد</h1><div class="txt">${fill(o.settings.undertaking, vars)}</div>`); }
  function letter(o) { const { vars } = ctx(o); return page('خطاب ' + vars.name, '', `${header(o.settings)}<h1>خطاب ترشيح</h1><div class="txt">${fill(o.settings.letter, vars)}</div>`); }

  /* ليبل 50×25 مم: الاسم + باركود + الرقم، لكل شخص صفحة ليبل */
  function labels(list, settings) {
    const css = `@page{size:50mm 25mm;margin:0}body{margin:0}.lb{width:50mm;height:25mm;padding:1.5mm 2mm;page-break-after:always;overflow:hidden;text-align:center;direction:ltr}.lb .n{font:700 8pt Arial;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lb .b{height:11mm;margin:0.8mm 0}.lb .c{font:7pt Arial}.no-print{display:none}`;
    const body = list.map((x) => { const code = x.code || '0'; return `<div class="lb"><div class="n">${esc(x.name)}</div><div class="b">${code128(code).svg}</div><div class="c">${esc(code)}</div></div>`; }).join('');
    return page('ليبلات', css + 'html{background:#fff}', body).replace(BASE_CSS, '').replace('@page{size:A4;margin:16mm}', '');
  }
  window.VaPrint = { code128, sheet, undertaking, letter, labels, fill };
})();
