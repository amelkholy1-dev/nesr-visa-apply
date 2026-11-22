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

  /* ورقة «طلب تأشيرة دخول» على نفس ترتيب نموذج منصة التأشيرات الرسمي (الحقول + الإقرار + الاسم/التوقيع/التاريخ) */
  const DECL = {"intro": "أنا الموقع أدناه أوافق على أخذ بصمة الأصابع وقزحية العين كإجراء للتقدم بطلب تأشيرة دخول للمملكة العربية السعودية وأقر بإدراك وحرية كاملة بما يلي:", "items": ["أن كل المعلومات التي دونتها صحيحة، وأتعهد بأنه خلال إقامتي في المملكة العربية السعودية سوف التزم بكافة قوانينها وأنظمتها واحترام العادات والتقاليد الإسلامية لشعبها ، وأقر بعلمي بأن من حق السلطات المختصة في المملكة عدم السماح لي بالدخول وإعادتي من حيث قدمت في حال مخالفتي للقوانين والانظمة أو ثبوت عدم صحة البيانات التي حصلت بموجبها على تأشيرة الدخول.", "أنني على علم تام بأن جميع المواد المسكرة والعقاقير المخدرة والمواد والمطبوعات المخلة بالآداب العامة وجميع المطبوعات التي لها مساس بأي معتقدات دينية أو أي اتجاهات سياسية وتتعارض مع الدين الإسلامي ممنوعة من دخول المملكة .", "أنني على علم تام بإجراءات وضوابط فسح الادوية المحتوية على مواد مخدرة أو مؤثرات عقلية التي بحوزة المرضى القادمين إلى المملكة أو المغادرين منها للاستعمال الشخصي والمدونة في الرابط التالي: http://www.sfda.gov.sa/ar/drug/drug_reg/pages/drug_reg.aspx وأن مخالفتي لذلك سوف يعرضني للجزاء وتطبيق العقوبات المنصوص عليها في نظام مكافحة المخدرات والمؤثرات العقلية ولائحته التنفيذية.", "أنه لم يسبق ترحيلي من المملكة العربية السعودية أو أي دولة من دول مجلس التعاون الخليجي، أو مخالفة الأنظمة المرعية بها.", "أتعهد بأن التزم بنوع التأشيرة الممنوحة لي وشروطها ومدتها ومغادرة المملكة قبل انتهاء مدة الإقامة المحددة في تأشيرة الدخول ، كما أنني على علم تام بان مخالفتي للأنظمة المرعية في المملكة أو ارتكابي لأحد المحظورات المذكورة أعلاه أو تلك المدونة على تأشيرة الدخول سوف يعرضني للجزاء وتطبيق العقوبات التي نص عليها تنظيم معاملة القادمين للمملكة بتأشيرات دخول للحج أو العمرة وغيرها الصادر بالمرسوم الملكي رقم (م/42) وتاريخ 18/10/1404هـ وكذلك عقوبات مخالفي أنظمة الإقامة والعمل الصادر بموجب قرار مجلس الوزراء رقم (140) وتاريخ 6/5/1434هـ.", "أقر بحق السلطات السعودية في إعادتي من منفذ الدخول على حسابي الخاص أو أبعادي من أراضي المملكة بعد دخولي إليها وأن تطبق بحقي العقوبات المنصوص عليها نظاماً في حال ثبت في أي وقت من الاوقات بعد حصولي على التأشيرة أو رخصة الاقامة بأنني قمت بتقديم أوراق أو مستندات غير صحيحة او الافادة بأقوال كاذبة لدى أي سلطة سعودية مختصة في الداخل او الخارج بقصد الحصول لنفسي أو لشخص أخر على سمة الدخول أو الاقامة أو أي تأشيرة رسمية أو كنت مساهماً أو شريكاً في تقديم هذه المعلومات او المستندات على خلاف الحقيقة والواقع.", "أقر بالعلم أن عقوبة تهريب المخدرات إلى المملكة أو ترويجها داخلها هي القتل.", "أتعهد بأن ألتزم بالإقرار عن المبالغ النقدية أو المعادن الثمينة وما في حكمها التي تصل قيمتها إلى (40,000) أربعون ألف ريال أو أكثر أو ما يعادلها من العملات الأجنبية، أثناء قدومي إلى المملكة أو مغادرتي منها، كما أتعهد بأن ألتزم بالإقرار عن أي امتعة ثمينة بصحبتي عند قدومي إلى المملكة واستعدادي لدفع الرسوم الجمركية والضرائب المستحقة عليها، وفي حال مخالفتي ذلك فإنه يعرضني للمساءلة القانونية وتطبيق ما تقضي به أنظمة المملكة بحقي", "أقر بالعلم ان الأنظمة بالمملكة تجرم دفع أي مبلغ رشوة بغض النظر عن مقداره وتعتبر قضية جنائية تعرض ممارسها لعقوبة السجن أو دفع غرامة أو كليهما معاً.", "أقر وأتعهد مجدداً بأن جميع المعلومات التي دونتها صحيحة وأتحمل كامل المسئولية عنها، وفي حال ثبوت خلاف ذلك -أو اتضح أنني مدرج على قائمة الممنوعين-فإنه سوف يتم رفض طلبي، أو إلغاء التأشيرة آليا في حال حصولي عليها، أو عدم السماح لي من دخول المملكة العربية السعودية في حال كان لدي تأشيرة سارية ،وأقر بحق السلطات السعودية في إعادتي من منفذ الدخول على حسابي الخاص وليس لي الحق في المطالبة بالتعويض."]};
  const dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  function sheet(o) {
    const { m, d, vars } = ctx(o); const v = (o.resolved && o.resolved.values) || {}; const ot = o.optText || ((a, b) => b);
    const entries = [v.entriesText, v.residence ? v.residence + ' يوم' : ''].filter(Boolean).join(' - ');
    const rows = [['رقم الجواز', m.PASSPORTnumber], ['نوع الجواز', ot('passportType', v.passportType)], ['الجنس', ot('sex', v.sex)], ['تاريخ الانتهاء', dmy(v.expiryDate)],
      ['الممثلية في', ot('embassy', v.embassy)], ['نوع التأشيرة', ot('visaKind', v.visaKind)], ['عدد مرات الدخول', entries], ['اسم الشخص/الجهة الطالبة', m.SPONSER_NAME],
      ['الاسم', vars.name], ['Name', nameEn(m)], ['المهنة', v.jobText], ['تاريخ الميلاد', dmy(v.birthDate)], ['مكان الميلاد', v.birthPlace], ['الجنسية الحالية', 'مصر'],
      ['الغرض', v.purpose || (m.SPONSER_NAME ? 'للعمل لدى /' + m.SPONSER_NAME : '')]];
    const app = o.person.appNumber || ''; const bc = app ? code128(app).svg : '';
    const css = `@page{size:A4;margin:9mm}body{font-size:12.5px;line-height:1.5}.evh{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-bottom:3px solid #1e5b61;padding-bottom:8px;margin-bottom:10px}.evh h1{margin:0;font-size:22px;text-align:center;flex:1;align-self:center}.evh .req{text-align:center;font-size:13px;min-width:62mm}.evh .req b{font-size:16px;display:block;direction:ltr}.evh .bc{height:11mm;width:56mm;margin:3px auto}.evh .co{min-width:40mm;color:#1e5b61;font-weight:700;font-size:15px}
      .evg{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #999}.evg>div{display:flex;border-bottom:1px solid #ccc;font-size:13px}.evg>div:nth-child(odd){border-inline-start:0}.evg .l{width:42%;background:#eef3f3;padding:5px 8px;font-weight:700}.evg .v{flex:1;padding:5px 8px}.evg .ltr{direction:ltr;text-align:left}
      .evt{margin-top:10px;font-size:10.8px;line-height:1.55}.evt .red{color:#b00020;font-weight:700;font-size:12.5px}.evt ol{padding-inline-start:20px;margin:6px 0}.evt li{margin-bottom:2px;text-align:justify}.evs{display:flex;gap:30px;margin-top:14px;font-size:13px}.evs div{flex:1;border-bottom:1px dotted #444;padding-bottom:14px}`;
    return page('طلب تأشيرة ' + vars.name, css, `<div class="evh"><div class="req"><span>رقم الطلب</span><b>${esc(app || '—')}</b>${bc ? `<div class="bc">${bc}</div>` : ''}<span>تاريخ الطلب: ${dmy(today())}</span></div><h1>طلب تأشيرة دخول</h1><div class="co">${esc(o.settings.company)}${o.settings.line2 ? '<br><small>' + esc(o.settings.line2) + '</small>' : ''}</div></div>
      <div class="evg">${rows.map((r) => `<div><span class="l">${esc(r[0])}</span><span class="v${r[0] === 'Name' ? ' ltr' : ''}">${esc(r[1] || '')}</span></div>`).join('')}</div>
      <div class="evt"><p class="red">${esc(DECL.intro)}</p><ol>${DECL.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div class="evs"><div>الاســم :</div><div>التوقيع :</div><div>التاريخ :</div></div>`);
  }

  /* ليبل 50×25 مم: الاسم + باركود + الرقم، لكل شخص صفحة ليبل */
  function labels(list, settings) {
    const css = `@page{size:50mm 25mm;margin:0}body{margin:0}.lb{width:50mm;height:25mm;padding:1.5mm 2mm;page-break-after:always;overflow:hidden;text-align:center;direction:ltr}.lb .n{font:700 8pt Arial;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lb .b{height:11mm;margin:0.8mm 0}.lb .c{font:7pt Arial}.no-print{display:none}`;
    const body = list.map((x) => { const code = x.code || '0'; return `<div class="lb"><div class="n">${esc(x.name)}</div><div class="b">${code128(code).svg}</div><div class="c">${esc(code)}</div></div>`; }).join('');
    return page('ليبلات', css + 'html{background:#fff}', body).replace(BASE_CSS, '').replace('@page{size:A4;margin:16mm}', '');
  }
  window.VaPrint = { code128, sheet, labels, fill };
})();
