'use strict';
/* ضبط النموذج: نماذج جاهزة للدفعات الجديدة (أكتر من نموذج) + الإعدادات (معالجة الصورة) */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const collect = (root) => { const o = {}; root.querySelectorAll('[data-k]').forEach((el) => { if (typeof el.value === 'string' && el.value.trim() !== '') o[el.dataset.k] = el.value.trim(); }); return o; };

  NA.pages.templates = async function () {
    const { api, e, $, view, toast, fail, can } = NA;
    if (!can('profiles.edit')) { view.innerHTML = '<div class="card issues">مش مسموحلك.</div>'; return; }
    const r = await api('GET', '/batch-templates'); let list = r.templates || []; let sel = list.length ? list[0].id : null;
    const draw = () => {
      const cur = list.find((t) => t.id === sel);
      view.innerHTML = `<div class="page-head"><div><h1>ضبط النموذج</h1><div class="sub">النموذج = قيم جاهزة بتتعبّى لوحدها لما تفتح دفعة جديدة. اختار منها اللي عايزه وسيب الباقي فاضي. تقدر تعمل أكتر من نموذج. <a href="#/profiles">رجوع للدفعات</a></div></div><div class="sp"><button class="btn pri" id="tNew">+ نموذج جديد</button></div></div>
        <div class="split" style="grid-template-columns:minmax(220px,300px) minmax(0,1fr)"><div class="tpl-list">${list.map((t) => `<div class="tpl-item${t.id === sel ? ' on' : ''}" data-id="${e(t.id)}"><b>${e(t.name)}</b>${t.isDefault ? '<span class="chip">الأساسي</span>' : ''}<span class="small muted">${Object.keys(t.data || {}).length} خانة</span></div>`).join('') || '<div class="card muted">لسه مفيش نماذج. دوس «نموذج جديد».</div>'}</div>
        <div>${cur ? `<div class="card"><div class="row"><label class="f" style="flex:1;min-width:240px">اسم النموذج<input id="tName" value="${e(cur.name)}"></label><label style="display:flex;gap:6px;align-items:center;align-self:end;padding-bottom:9px"><input type="checkbox" id="tDef"${cur.isDefault ? ' checked' : ''}> الأساسي (بيتختار تلقائي في الدفعة الجديدة)</label></div></div>
          <div id="tForm">${NA.profileTabsHtml(cur.data || {}, { lookup: false })}</div>
          <div class="row actions"><button class="btn pri" id="tSave">حفظ النموذج</button>${list.length ? '<button class="btn danger" id="tDel" style="margin-inline-start:auto">حذف النموذج</button>' : ''}</div>` : (list.length ? '<div class="card muted">اختار نموذج من اليمين.</div>' : '')}</div></div>`;
      NA.wireTabs(view);
      view.querySelectorAll('.tpl-item').forEach((el) => { el.onclick = () => { if (cur && $('#tForm')) stash(cur); sel = el.dataset.id; draw(); }; });
      $('#tNew').onclick = () => { if (cur && $('#tForm')) stash(cur); const t = { id: 't' + Date.now().toString(36), name: 'نموذج ' + (list.length + 1), data: {}, isDefault: !list.length }; list.push(t); sel = t.id; draw(); };
      if (cur) { $('#tSave').onclick = save; $('#tDel').onclick = () => { if (!confirm('تحذف النموذج ده؟')) return; list = list.filter((t) => t.id !== sel); sel = list.length ? list[0].id : null; persist('اتحذف النموذج').then(draw).catch(fail); }; }
    };
    const stash = (cur) => { cur.name = ($('#tName') || {}).value || cur.name; cur.data = collect($('#tForm')); cur.isDefault = !!($('#tDef') || {}).checked; if (cur.isDefault) list.forEach((t) => { if (t !== cur) t.isDefault = false; }); };
    const persist = async (msg) => { const x = await api('PUT', '/batch-templates', { templates: list }); list = x.templates; toast(msg || 'اتحفظ', 'ok'); };
    const save = async () => { try { const cur = list.find((t) => t.id === sel); stash(cur); await persist('اتحفظ النموذج'); draw(); } catch (er) { fail(er); } };
    draw();
  };

  NA.pages.settings = async function () {
    const { api, e, $, view, toast, fail, can } = NA;
    if (!can('users.manage')) { view.innerHTML = '<div class="card issues">الإعدادات للمدير بس.</div>'; return; }
    const mode = NA.meta.photoProcess === 'clean' ? 'clean' : 'off';
    view.innerHTML = `<div class="page-head"><div><h1>الإعدادات</h1><div class="sub">إعدادات عامة على كل المستخدمين.</div></div></div>
      <div class="card"><h2>التاريخ المتوقع لدخول المملكة</h2><div class="muted small" style="margin-bottom:10px">بيتحسب لوحده وقت «عمل إنجاز»: تاريخ النهارده + عدد الأيام دي. اكتب 0 لو عايز تكتبه بإيدك في الدفعة/الشخص.</div>
        <div class="row"><label class="f" style="width:200px">عدد الأيام بعد يوم الطلب<input type="number" id="entDays" min="0" max="365" value="${NA.meta.autoEntryDays === undefined ? 17 : NA.meta.autoEntryDays}"></label><button class="btn pri" id="entSave" type="button" style="align-self:end">حفظ</button></div></div>
      <div class="card"><h2>المظهر (الألوان)</h2><div class="muted small" style="margin-bottom:10px">دوس على أي مظهر يتجرّب فوراً، ودوس «حفظ المظهر» عشان يثبت لكل المستخدمين.</div>
        <div class="seg" id="themeBox">${[['slate', 'رمادي هادي', '#3a4f63', '#fff'], ['green', 'أخضر فاتح', '#2f6b4f', '#f3f7f4'], ['navy', 'كحلي (قايمة غامقة)', '#16233b', '#f2f4f8'], ['warm', 'دافئ (بيج)', '#8a5a2b', '#faf6ef']].map(([k, l, c1, c2]) => `<label data-t="${k}"><input type="radio" name="th" value="${k}"${(NA.meta.theme || 'slate') === k ? ' checked' : ''}> <b>${l}</b><span style="display:flex;gap:6px;margin-top:6px"><i style="width:34px;height:16px;border-radius:5px;background:${c1};display:block"></i><i style="width:34px;height:16px;border-radius:5px;background:${c2};border:1px solid #ccc;display:block"></i></span></label>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn pri" id="thSave" type="button">حفظ المظهر</button></div></div>
      <div class="card"><h2>معالجة الصورة الشخصية</h2><div class="muted small" style="margin-bottom:10px">بتتطبّق على أي صورة شخصية بتترفع أو بتتقص من الجواز. المعالجة بتتم في المتصفح (مفيش صور بتتبعت لأي حد).</div>
        <div class="seg"><label><input type="radio" name="pm" value="off"${mode === 'off' ? ' checked' : ''}> <b>زي ما هي</b><span class="small muted">الصورة بتتحط من غير تعديل (بتتصغّر بس لو أكبر من 1 ميجا).</span></label>
          <label><input type="radio" name="pm" value="clean"${mode === 'clean' ? ' checked' : ''}> <b>معالجة الصورة</b><span class="small muted">خلفية بيضاء + إزالة التشويش. بتشتغل مع الخلفية الثابتة اللون؛ لو الخلفية معقّدة بتشيل التشويش بس.</span></label></div>
        <div class="row" style="margin-top:12px"><button class="btn pri" id="pmSave">حفظ</button></div></div>
      <div class="card"><h2>جرّب على صورة</h2><div class="muted small" style="margin-bottom:8px">اختار صورة شخصية وشوف قبل وبعد المعالجة (من غير ما تتحفظ في أي مكان).</div>
        <input type="file" id="pmFile" accept="image/jpeg,image/png"><div id="pmOut" style="margin-top:12px"></div></div>`;

    /* طباعة الباركود: برنامج Masar Print Agent (نفس برنامج نظام الجوازات) */
    const box = document.createElement('div'); view.appendChild(box);
    const drawPrint = async () => {
      let inf; try { inf = await NA.print.info(); } catch (er) { box.innerHTML = `<div class="card issues">${e(er.message)}</div>`; return; }
      const s = inf.settings; const ag = inf.agents; const cur = ag.find((x) => x.agentId === s.printAgentId) || ag.find((x) => x.isOnline) || ag[0];
      const num = (k, l, step) => `<label class="f">${l}<input type="number" step="${step || 1}" data-ps="${k}" value="${e(s[k])}"></label>`;
      box.innerHTML = `<div class="card"><h2>طباعة الباركود (برنامج Masar Print Agent)</h2>
        <div class="muted small" style="margin-bottom:10px">نفس برنامج الطباعة بتاع نظام الجوازات (طابعة BIXOLON). النظام بيحط الليبل في طابور والبرنامج على جهاز الطابعة بيسحبه ويطبعه.</div>
        ${inf.configured ? `<label class="f">عنوان السيستم (الصقه في خانة «عنوان السيستم» في برنامج الطباعة)<div class="row" style="flex-wrap:nowrap"><input id="agUrl" readonly dir="ltr" value="${e(inf.agentUrl)}" style="flex:1"><button class="btn" id="agCopy" type="button">نسخ</button></div></label>
          <ol class="small muted" style="margin:8px 0 0"><li>افتح برنامج الطباعة على جهاز الطابعة.</li><li>الصق العنوان ده في «عنوان السيستم» واختار الطابعة ودوس «حفظ وتشغيل».</li><li>ارجع هنا ودوس «تحديث» وهتلاقي الجهاز «متصل».</li></ol>
          <div class="muted small" style="margin-top:6px">ملاحظة: البرنامج بيسمع عنوان واحد بس. لو عايز نفس الجهاز يطبع من نظام الجوازات ومن النظام ده، ركّب نسخة تانية من البرنامج أو بدّل العنوان.</div>`
          : `<div class="card issues">مفتاح الطباعة مش متظبط على السيرفر. ضيف في Environment variables: <b dir="ltr">PRINT_AGENT_KEY</b> بقيمة 16 حرف وأرقام عشوائية على الأقل (أي كلام صعب)، وأعد التشغيل. بعدها هيظهر هنا العنوان.</div>`}
        <h3 style="margin:14px 0 6px">الأجهزة</h3><div class="tbl-wrap"><table><thead><tr><th>الجهاز</th><th>الحالة</th><th>الطابعات</th></tr></thead><tbody>${ag.map((x) => `<tr><td><b>${e(x.agentName || x.agentId)}</b><div class="small muted">${e(x.computerName)}</div></td><td><span class="chip ${x.isOnline ? 'ok' : 'bad'}">${x.isOnline ? 'متصل' : 'مش متصل'}</span><div class="small muted">${x.agoSec === null ? '' : 'آخر ظهور من ' + (x.agoSec < 90 ? x.agoSec + ' ثانية' : x.agoSec < 5400 ? Math.round(x.agoSec / 60) + ' دقيقة' : Math.round(x.agoSec / 3600) + ' ساعة')}</div></td><td class="small">${e((x.printers || []).map((p) => p.name).join('، '))}</td></tr>`).join('') || '<tr><td colspan="3" class="muted" style="text-align:center">مفيش أجهزة سجّلت لسه.</td></tr>'}</tbody></table></div>
        <div class="row" style="margin:8px 0"><button class="btn small" id="agRef" type="button">تحديث</button></div>
        <details class="fold"><summary>آخر طلبات برنامج الطباعة للسيرفر (للفحص لو مش بيتصل)</summary><div class="fb">${(inf.agentLog || []).length ? `<div class="tbl-wrap" style="max-height:240px"><table><thead><tr><th>من</th><th>الطلب</th><th>النتيجة</th></tr></thead><tbody>${inf.agentLog.slice(0, 25).map((x) => `<tr><td class="small">منذ ${x.ago} ث</td><td dir="ltr" style="text-align:right" class="small">${e(x.method)} ${e(x.path)}</td><td><span class="chip ${x.status < 300 ? 'ok' : 'bad'}">${x.status}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">لسه مفيش أي طلب وصل من برنامج الطباعة من آخر تشغيل للسيرفر. لو البرنامج شغّال، اتأكد من العنوان فوق.</div>'}</div></details>
        <div class="grid"><label class="f">جهاز الطباعة<select data-ps="printAgentId"><option value="">— اختار —</option>${ag.map((x) => `<option value="${e(x.agentId)}"${x.agentId === s.printAgentId ? ' selected' : ''}>${e(x.agentName || x.agentId)}${x.isOnline ? '' : ' (مش متصل)'}</option>`).join('')}</select></label>
          <label class="f">الطابعة<select data-ps="printAgentPrinterName"><option value="">الافتراضية</option>${((cur && cur.printers) || []).map((p) => `<option${p.name === s.printAgentPrinterName ? ' selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>
          ${num('labelWidthMm', 'عرض الليبل (مم)')}${num('labelHeightMm', 'ارتفاع الليبل (مم)')}${num('dpi', 'الدقة (dpi)')}${num('printCopies', 'عدد النسخ')}</div>
        <details class="fold" style="margin-top:12px"><summary>ضبط مكان الباركود والنص</summary><div class="fb"><div class="grid">${num('barcodeXmm', 'الباركود: يمين/شمال (مم)', 0.5)}${num('barcodeYmm', 'الباركود: فوق/تحت (مم)', 0.5)}${num('barcodeHeightMm', 'ارتفاع الباركود (مم)', 0.5)}${num('barcodeNarrow', 'سمك الخط الرفيع')}${num('barcodeWide', 'سمك الخط العريض')}
          ${num('textXmm', 'النص: يمين/شمال (مم)', 0.5)}${num('textYmm', 'النص: فوق/تحت (مم)', 0.5)}${num('textWidthMm', 'عرض النص (مم)', 0.5)}${num('textHeightMm', 'ارتفاع النص (مم)', 0.5)}${num('textFontSize', 'حجم الخط')}${num('density', 'الكثافة (1-30)')}${num('speed', 'السرعة (1-6)')}${num('gapDots', 'الفراغ بين الليبل')}
          <label class="f">شكل الليبل<select data-ps="outputMode"><option value="barcode_text"${s.outputMode === 'barcode_text' ? ' selected' : ''}>باركود + النص</option><option value="barcode_only"${s.outputMode === 'barcode_only' ? ' selected' : ''}>باركود بس</option><option value="text_only"${s.outputMode === 'text_only' ? ' selected' : ''}>نص بس</option></select></label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ps="textBold"${s.textBold ? ' checked' : ''}> النص بخط تقيل</label></div></div></details>
        <div class="row" style="margin-top:12px"><button class="btn pri" id="psSave" type="button">حفظ</button><button class="btn" id="psTest" type="button" title="بيطبع ليبل تجربة بالكود E817519542">طباعة تجربة</button><span id="psMsg" class="small"></span></div></div>`;
      const collectPs = () => { const o = {}; box.querySelectorAll('[data-ps]').forEach((el) => { o[el.dataset.ps] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value; }); return o; };
      const cp = box.querySelector('#agCopy'); if (cp) cp.onclick = async () => { const u = box.querySelector('#agUrl'); u.select(); try { await navigator.clipboard.writeText(u.value); toast('اتنسخ', 'ok'); } catch (x) { document.execCommand('copy'); toast('اتنسخ', 'ok'); } };
      box.querySelector('#agRef').onclick = drawPrint;
      box.querySelector('[data-ps=printAgentId]').onchange = () => { const cs = collectPs(); const a2 = ag.find((x) => x.agentId === cs.printAgentId); const sel = box.querySelector('[data-ps=printAgentPrinterName]'); sel.innerHTML = '<option value="">الافتراضية</option>' + ((a2 && a2.printers) || []).map((p) => `<option>${e(p.name)}</option>`).join(''); };
      box.querySelector('#psSave').onclick = async () => { try { await api('PUT', '/print/settings', collectPs()); toast('اتحفظ', 'ok'); drawPrint(); } catch (er) { fail(er); } };
      box.querySelector('#psTest').onclick = async () => { const m = box.querySelector('#psMsg'); try { const cs = collectPs(); await api('PUT', '/print/settings', cs); m.textContent = 'بيبعت ليبل تجربة…'; const r = await NA.print.sendLabel('E817519542', cs, { copies: 1, label: 'ليبل تجربة' }); const j = await NA.print.waitJob(r.jobId, 60000); m.textContent = j.status === 'printed' ? 'اتطبع ✔' : j.status === 'failed' ? 'فشلت: ' + (j.error || '') : 'لسه في الطابور (البرنامج مش بيسحب؟)'; } catch (er) { m.textContent = ''; fail(er); } };
    };
    drawPrint();
    view.querySelectorAll('input[name=th]').forEach((r) => { r.onchange = () => { document.documentElement.dataset.theme = r.value; }; });
    $('#thSave').onclick = async () => { try { const v = view.querySelector('input[name=th]:checked').value; await api('PUT', '/settings/theme', { theme: v }); NA.meta.theme = v; toast('اتحفظ المظهر', 'ok'); } catch (er) { fail(er); } };
    $('#entSave').onclick = async () => { try { const r = await api('PUT', '/settings/entry', { days: $('#entDays').value }); NA.meta.autoEntryDays = r.days; toast(r.days ? 'التاريخ المتوقع = يوم الطلب + ' + r.days + ' يوم' : 'التاريخ المتوقع بقى يدوي', 'ok'); } catch (er) { fail(er); } };
    $('#pmSave').onclick = async () => { try { const m = view.querySelector('input[name=pm]:checked').value; await api('PUT', '/settings/photo', { mode: m }); NA.meta.photoProcess = m; toast('اتحفظ', 'ok'); } catch (er) { fail(er); } };
    $('#pmFile').onchange = async () => {
      const f = $('#pmFile').files[0]; if (!f) return; const out = $('#pmOut'); out.textContent = 'بيعالج الصورة…';
      try { const res = await NA.photo.clean(f); const a = URL.createObjectURL(f), b = URL.createObjectURL(res.blob);
        out.innerHTML = `<div class="cmp"><figure><img src="${a}"><figcaption>قبل</figcaption></figure><figure><img src="${b}"><figcaption>بعد — ${e(res.note)}</figcaption></figure></div>`; } catch (er) { out.textContent = ''; fail(er); }
    };
  };
})();
