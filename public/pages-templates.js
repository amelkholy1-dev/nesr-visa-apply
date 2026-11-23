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
      <div class="card"><h2>معالجة الصورة الشخصية</h2><div class="muted small" style="margin-bottom:10px">بتتطبّق على أي صورة شخصية بتترفع أو بتتقص من الجواز. المعالجة بتتم في المتصفح (مفيش صور بتتبعت لأي حد).</div>
        <div class="seg"><label><input type="radio" name="pm" value="off"${mode === 'off' ? ' checked' : ''}> <b>زي ما هي</b><span class="small muted">الصورة بتتحط من غير تعديل (بتتصغّر بس لو أكبر من 1 ميجا).</span></label>
          <label><input type="radio" name="pm" value="clean"${mode === 'clean' ? ' checked' : ''}> <b>معالجة الصورة</b><span class="small muted">خلفية بيضاء + إزالة التشويش. بتشتغل مع الخلفية الثابتة اللون؛ لو الخلفية معقّدة بتشيل التشويش بس.</span></label></div>
        <div class="row" style="margin-top:12px"><button class="btn pri" id="pmSave">حفظ</button></div></div>
      <div class="card"><h2>جرّب على صورة</h2><div class="muted small" style="margin-bottom:8px">اختار صورة شخصية وشوف قبل وبعد المعالجة (من غير ما تتحفظ في أي مكان).</div>
        <input type="file" id="pmFile" accept="image/jpeg,image/png"><div id="pmOut" style="margin-top:12px"></div></div>`;
    $('#pmSave').onclick = async () => { try { const m = view.querySelector('input[name=pm]:checked').value; await api('PUT', '/settings/photo', { mode: m }); NA.meta.photoProcess = m; toast('اتحفظ', 'ok'); } catch (er) { fail(er); } };
    $('#pmFile').onchange = async () => {
      const f = $('#pmFile').files[0]; if (!f) return; const out = $('#pmOut'); out.textContent = 'بيعالج الصورة…';
      try { const res = await NA.photo.clean(f); const a = URL.createObjectURL(f), b = URL.createObjectURL(res.blob);
        out.innerHTML = `<div class="cmp"><figure><img src="${a}"><figcaption>قبل</figcaption></figure><figure><img src="${b}"><figcaption>بعد — ${e(res.note)}</figcaption></figure></div>`; } catch (er) { out.textContent = ''; fail(er); }
    };
  };
})();
