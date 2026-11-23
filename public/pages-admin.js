'use strict';
/* المستخدمين والصلاحيات: دور جاهز (مدير/مشرف/موظف/مشاهد) أو صلاحيات مخصّصة لكل مستخدم */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });

  /* نافذة بسيطة (modal) */
  NA.modal = (html, onMount) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal">${html}</div>`; document.body.appendChild(bg);
    const close = () => bg.remove(); bg.addEventListener('mousedown', (ev) => { if (ev.target === bg) close(); });
    if (onMount) onMount(bg.querySelector('.modal'), close); return close;
  };

  NA.pages.users = async function () {
    const { api, e, $, view, toast, fail, can } = NA;
    if (!can('users.manage')) { view.innerHTML = '<div class="card issues">ده للمدير بس.</div>'; return; }
    const r = await api('GET', '/users');
    const roleOpts = (sel) => r.roles.map((x) => `<option value="${x.id}"${sel === x.id ? ' selected' : ''}>${e(x.label)} — ${e(x.desc)}</option>`).join('') + (sel === 'custom' ? '<option value="custom" selected>مخصّص</option>' : '');
    const permsBox = (perms, locked) => `<div class="perm-grid">${Object.entries(r.perms).map(([k, l]) => `<label><input type="checkbox" data-perm="${k}"${perms.includes(k) ? ' checked' : ''}${locked ? ' disabled' : ''}> <span>${e(l)}</span></label>`).join('')}</div>`;
    const roleChip = (u) => `<span class="chip ${u.role === 'admin' ? 'acc' : u.role === 'viewer' ? '' : u.custom ? 'warn' : 'ok'}">${e(u.roleLabel || u.role)}</span>`;

    view.innerHTML = `<div class="page-head"><div><h1>المستخدمين والصلاحيات</h1><div class="sub">اختار لكل شخص دور جاهز، أو علّم بنفسك على اللي يقدر يعمله بالظبط.</div></div><div class="sp"><button class="btn pri" id="addU">+ مستخدم جديد</button></div></div>
      <div class="card"><h2>الأدوار الجاهزة</h2><div class="grid wide">${r.roles.map((x) => `<div><b>${e(x.label)}</b> <span class="muted small">— ${e(x.desc)}</span><div class="muted small" style="margin-top:3px">${x.perms.map((p) => e(r.perms[p])).join(' · ')}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>المستخدم</th><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>${r.users.map((u) => `<tr><td dir="ltr" style="text-align:right">${e(u.username)}</td><td>${e(u.name)}</td><td>${roleChip(u)}</td>
        <td>${u.active ? '<span class="chip ok">شغّال</span>' : '<span class="chip bad">موقوف</span>'}</td>
        <td class="row" style="gap:6px"><button class="btn small ed" data-id="${u.id}">تعديل الصلاحيات</button><button class="btn small pw" data-id="${u.id}">كلمة سر</button><button class="btn small tog" data-id="${u.id}" data-a="${u.active ? 0 : 1}">${u.active ? 'إيقاف' : 'تفعيل'}</button></td></tr>`).join('')}</tbody></table></div></div>`;

    const collectPerms = (root) => [...root.querySelectorAll('[data-perm]:checked')].map((c) => c.dataset.perm);
    const userForm = (u) => `<h2>${u ? 'تعديل: ' + e(u.username) : 'مستخدم جديد'}</h2>
      ${u ? '' : '<div class="grid"><label class="f">اسم المستخدم (إنجليزي)<input id="nu" class="ltr" autocomplete="off"></label><label class="f">الاسم<input id="nn"></label><label class="f">كلمة السر (8 على الأقل)<input id="np" type="password" autocomplete="new-password"></label></div><br>'}
      ${u ? `<label class="f">الاسم<input id="nn" value="${e(u.name)}"></label><br>` : ''}
      <label class="f">الدور<select id="nr">${roleOpts(u ? u.role : 'staff')}</select></label>
      <div id="pbox" style="margin-top:12px"><div class="muted small" style="margin-bottom:6px">الصلاحيات (علّم/شيل علامة عشان تخصّصها):</div>${permsBox(u ? u.perms : (r.roles.find((x) => x.id === 'staff') || {}).perms || [], false)}</div>
      <div class="foot"><button class="btn" id="mc">إلغاء</button><button class="btn pri" id="ms">${u ? 'حفظ' : 'إضافة'}</button></div>`;
    const mount = (u) => (m, close) => {
      const sync = () => { const role = $('#nr', m).value; const preset = r.roles.find((x) => x.id === role); if (preset) m.querySelectorAll('[data-perm]').forEach((c) => { c.checked = preset.perms.includes(c.dataset.perm); c.disabled = role === 'admin'; }); };
      $('#nr', m).onchange = sync; if (u && u.role === 'admin') sync();
      m.querySelectorAll('[data-perm]').forEach((c) => { c.onchange = () => { if ($('#nr', m).value !== 'custom') { const o = [...$('#nr', m).options].find((x) => x.value === 'custom') || (() => { const op = document.createElement('option'); op.value = 'custom'; op.textContent = 'مخصّص'; $('#nr', m).appendChild(op); return op; })(); o.selected = true; } }; });
      $('#mc', m).onclick = close;
      $('#ms', m).onclick = async () => {
        try {
          const role = $('#nr', m).value; const body = { name: $('#nn', m).value, role: role === 'admin' ? 'admin' : undefined, perms: role === 'admin' ? undefined : collectPerms(m) };
          if (u) await api('PUT', `/users/${u.id}`, body); else await api('POST', '/users', { ...body, username: $('#nu', m).value, password: $('#np', m).value });
          close(); toast('اتحفظ', 'ok'); NA.pages.users();
        } catch (er) { fail(er); }
      };
    };
    $('#addU').onclick = () => NA.modal(userForm(null), mount(null));
    view.onclick = async (ev) => {
      const ed = ev.target.closest('.ed'), t = ev.target.closest('.tog'), p = ev.target.closest('.pw');
      try {
        if (ed) { const u = r.users.find((x) => String(x.id) === ed.dataset.id); NA.modal(userForm(u), mount(u)); }
        if (t) { await api('PUT', `/users/${t.dataset.id}`, { active: t.dataset.a === '1' }); NA.pages.users(); }
        if (p) { const pw = prompt('كلمة السر الجديدة (8 حروف على الأقل)'); if (pw) { await api('PUT', `/users/${p.dataset.id}`, { password: pw }); toast('اتغيّرت كلمة السر', 'ok'); } }
      } catch (er) { fail(er); }
    };
  };
})();
