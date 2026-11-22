'use strict';
/* واجهة نظام طلبات التأشيرات (JS عادي من غير بناء). الصفحات: الأشخاص · شخص · ملفات الضبط · المستخدمين · الإضافة */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const e = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let me = null, meta = null, extReady = false;
  const STATUS = { draft: ['مسودة', ''], ready: ['جاهز', 'acc'], filled: ['اتملى في المنصة', 'warn'], submitted: ['اتبعت', 'ok'] };

  /* ===== شبكة وتنبيهات ===== */
  async function api(method, url, body) {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body instanceof FormData) opt.body = body; else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch('/api' + url, opt);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/login') { me = null; location.hash = '#/login'; throw new Error(j.error || 'سجّل الدخول'); }
    if (!r.ok) { const er = new Error(j.error || 'حصل خطأ (' + r.status + ')'); er.status = r.status; er.data = j; throw er; }
    return j;
  }
  let toastT;
  function toast(msg, kind) { const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4500); }
  const fail = (er) => toast(er.message || String(er), 'err');

  /* ===== جسر الإضافة ===== */
  const bridge = { pending: [] };
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data; if (!m || m.source !== 'nesr-visaapply-ext') return;
    if (m.type === 'VA_READY') { extReady = true; setExt(); }
    if (m.type === 'VA_ACK') { bridge.pending.splice(0).forEach((f) => f(true)); }
    if (m.type === 'VA_ERROR') { toast(m.data && m.data.message || 'مشكلة في الإضافة', 'err'); bridge.pending.splice(0).forEach((f) => f(false)); }
    if (m.type === 'VA_RESULT' && m.data) onResult(m.data);
  });
  const ping = () => window.postMessage({ source: 'nesr-visaapply', type: 'VA_PING' }, location.origin);
  function setExt() { const p = $('#extState'); p.className = 'pill ' + (extReady ? 'ok' : 'warn'); p.textContent = extReady ? 'الإضافة شغّالة' : 'الإضافة مش متركّبة'; }
  async function onResult(d) {
    if (!d.personId) return;
    try {
      if (d.status === 'submitted' && d.appNumber) { await api('POST', `/people/${d.personId}/result`, { status: 'submitted', appNumber: d.appNumber }); toast('✅ رقم الطلب ' + d.appNumber + ' اتسجّل', 'ok'); }
      else if (d.status === 'filled') { await api('POST', `/people/${d.personId}/result`, { status: 'filled' }); }
      if (/^#\/(people)?$/.test(location.hash) || location.hash === '#/people') render();
    } catch (er) { fail(er); }
  }
  async function fillRequest(id) {
    try {
      const pl = await api('GET', `/people/${id}/payload`);
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة. من «الإضافة» نزّلها وركّبها الأول.', 'err');
      let photo = '';
      if (pl.hasPhoto) { const blob = await (await fetch(`/api/people/${id}/file/photo`, { credentials: 'same-origin' })).blob(); photo = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); }
      if (pl.issues.length && !confirm('فيه نواقص:\n- ' + pl.issues.join('\n- ') + '\n\nتفتح الفورم وتملا اللي موجود؟')) return;
      const ok = await new Promise((res) => { bridge.pending.push(res); window.postMessage({ source: 'nesr-visaapply', type: 'VA_FILL', data: { personId: id, name: pl.name, mofa: pl.mofa, issues: pl.issues, warns: pl.warns, photo } }, location.origin); setTimeout(() => res(false), 4000); });
      if (!ok) toast('الإضافة ما ردّتش. اعمل F5 للصفحة وجرّب تاني (أو Reload للإضافة).', 'err'); else toast('اتفتح فورم المنصة وبيتملي…', 'ok');
    } catch (er) { fail(er); }
  }

  /* ===== أدوات ===== */
  const opt = (name) => (meta.options[name] || []);
  const optText = (name, v) => { const o = opt(name).find((x) => String(x.v) === String(v)); return o ? o.t : v || ''; };
  function selectHtml(name, k, val, blank) {
    return `<select data-k="${k}"><option value="">${e(blank || '— اختار —')}</option>${opt(name).map((o) => `<option value="${e(o.v)}"${String(o.v) === String(val) ? ' selected' : ''}>${e(o.t)}</option>`).join('')}</select>`;
  }
  function fieldHtml(f, val, ph) {
    const label = `${e(f.label)}${f.req ? ' <span class="req">*</span>' : ''}${f.max ? ` <span class="hint">(حد ${f.max})</span>` : ''}`;
    let inner;
    if (f.type === 'select') inner = selectHtml(f.opt, f.k, val, ph ? 'من ملف الضبط: ' + optText(f.opt, ph) : '');
    else if (f.type === 'date') inner = `<input type="date" data-k="${f.k}" value="${e(val || '')}">`;
    else inner = `<input type="text" data-k="${f.k}" value="${e(val || '')}"${f.max ? ` maxlength="${f.max + 30}"` : ''}${f.ltr ? ' class="ltr"' : ''}${ph ? ` placeholder="${e(ph)}"` : f.hint ? ` placeholder="${e(f.hint)}"` : ''}>`;
    return `<label class="f">${label}${inner}<span class="over" data-over="${f.k}"></span></label>`;
  }
  const collect = (root) => { const o = {}; root.querySelectorAll('[data-k]').forEach((el) => { o[el.dataset.k] = el.value.trim(); }); return o; };
  const splitArabic = (full) => { const w = String(full || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean); if (!w.length) return {}; if (w.length === 1) return { first: w[0] }; if (w.length === 2) return { first: w[0], family: w[1] }; if (w.length === 3) return { first: w[0], father: w[1], family: w[2] }; return { first: w[0], father: w[1], grand: w.slice(2, -1).join(' '), family: w[w.length - 1] }; };
  const fmtDate = (d) => { try { return d ? new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : ''; } catch (x) { return ''; } };

  /* ضغط الصورة قبل الرفع: الشخصية أقل من 1 ميجا (شرط المنصة) */
  async function compress(file, maxBytes, maxSide) {
    if (file.type === 'application/pdf') return file;
    if (file.size <= maxBytes * 0.9 && file.type === 'image/jpeg' && !maxSide) return file;
    const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error('الصورة مش مفهومة')); i.src = u; });
    let side = maxSide || 2000;
    for (let attempt = 0; attempt < 8; attempt++) {
      const sc = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      for (let q = 0.92; q >= 0.5; q -= 0.1) {
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
        if (blob && blob.size <= maxBytes * 0.92) return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      }
      side = Math.round(side * 0.8);
    }
    throw new Error('مقدرتش أصغّر الصورة تحت الحد. جرّب صورة تانية.');
  }

  /* ===== الصفحات ===== */
  async function pageLogin() {
    $('#top').hidden = true;
    view.innerHTML = `<div class="card login"><h1>🦅 طلبات التأشيرات</h1>
      <label class="f">اسم المستخدم<input id="u" autocomplete="username"></label><br>
      <label class="f">كلمة السر<input id="p" type="password" autocomplete="current-password"></label><br>
      <button id="go" class="btn pri" style="width:100%">دخول</button><p id="err" class="issues muted"></p></div>`;
    const go = async () => {
      try { const r = await api('POST', '/login', { username: $('#u').value, password: $('#p').value }); me = r.user; location.hash = '#/people'; }
      catch (er) { $('#err').textContent = er.message; }
    };
    $('#go').onclick = go; $('#p').onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
    $('#u').focus();
  }

  async function pagePeople() {
    const [profs] = await Promise.all([api('GET', '/profiles')]);
    const state = JSON.parse(sessionStorage.getItem('peopleFilter') || '{}');
    view.innerHTML = `<h1>الأشخاص</h1>
      <div class="card"><div class="row">
        <input id="q" placeholder="بحث بالاسم أو رقم الجواز" value="${e(state.q || '')}" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;min-width:220px">
        <select id="st" style="padding:8px;border:1px solid var(--line);border-radius:8px"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.st === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select>
        <select id="pf" style="padding:8px;border:1px solid var(--line);border-radius:8px"><option value="">كل ملفات الضبط</option>${profs.profiles.map((p) => `<option value="${p.id}"${String(state.pf) === String(p.id) ? ' selected' : ''}>${e(p.name)}</option>`).join('')}</select>
        <a href="#/people/new" class="btn pri" style="margin-inline-start:auto;text-decoration:none">+ شخص جديد</a></div></div>
      <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>الاسم</th><th>الجواز</th><th>ملف الضبط</th><th>الحالة</th><th>النواقص</th><th>رقم الطلب</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="7" class="muted">جاري التحميل…</td></tr></tbody></table></div>`;
    const load = async () => {
      const st = { q: $('#q').value, st: $('#st').value, pf: $('#pf').value }; sessionStorage.setItem('peopleFilter', JSON.stringify(st));
      const r = await api('GET', `/people?q=${encodeURIComponent(st.q)}&status=${st.st}&profile=${st.pf}`);
      $('#rows').innerHTML = r.people.map((p) => `<tr class="click" data-id="${p.id}"><td><b>${e(p.name || '—')}</b></td><td dir="ltr" style="text-align:right">${e(p.passportNo)}</td><td>${e(p.profileName || '—')}</td>
        <td><span class="pill ${STATUS[p.status] ? STATUS[p.status][1] : ''}">${e((STATUS[p.status] || [p.status])[0])}</span></td>
        <td>${p.ready ? '<span class="pill ok">كامل</span>' : `<span class="pill bad">${p.issues} ناقص</span>`} ${p.hasPhoto ? '📷' : '<span class="muted" title="مفيش صورة شخصية">—</span>'}</td>
        <td dir="ltr" style="text-align:right">${e(p.appNumber || '')}</td><td><button class="btn small pri fill" data-id="${p.id}">املى الطلب</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">مفيش أشخاص.</td></tr>';
    };
    ['q', 'st', 'pf'].forEach((i) => { $('#' + i).oninput = () => load().catch(fail); });
    view.onclick = (ev) => { const b = ev.target.closest('.fill'); if (b) { ev.stopPropagation(); return fillRequest(b.dataset.id); } const tr = ev.target.closest('tr.click'); if (tr) location.hash = '#/people/' + tr.dataset.id; };
    await load();
  }

  async function pagePerson(id) {
    const isNew = id === 'new';
    const [profs] = await Promise.all([api('GET', '/profiles')]);
    let data = {}, profileId = (profs.profiles.find((p) => p.isDefault) || profs.profiles[0] || {}).id || '', resolved = null, person = null;
    const pending = { passport: null, photo: null }; /* صور مختارة لشخص لسه ما اتحفظش */
    const objUrl = (f) => (f ? URL.createObjectURL(f) : '');
    if (!isNew) { const r = await api('GET', `/people/${id}`); person = r.person; data = r.person.data; profileId = r.person.profileId || ''; resolved = r.resolved; }
    const profileData = () => (profs.profiles.find((p) => String(p.id) === String(profileId)) || { data: {} }).data;
    const draw = () => {
      const pd = profileData();
      const personFields = meta.personGroups.map((g) => `<div class="card"><h2>${e(g.title)}</h2><div class="grid">${g.fields.map((f) => fieldHtml(f, data[f.k], f.k.startsWith('nameAr') && f.k !== 'nameAr' ? (splitArabic(data.nameAr)[{ nameArFirst: 'first', nameArFather: 'father', nameArGrand: 'grand', nameArFamily: 'family' }[f.k]] || '') : '')).join('')}</div></div>`).join('');
      const inherit = meta.groups.flatMap((g) => g.fields).filter((f) => f.scope === 'both');
      view.innerHTML = `<h1>${isNew ? 'شخص جديد' : e(data.nameAr || 'شخص') + ' <span class="pill ' + ((STATUS[person.status] || [0, ''])[1]) + '">' + e((STATUS[person.status] || [person.status])[0]) + '</span>'}</h1>
      <div class="card"><div class="row"><label class="f" style="min-width:260px">ملف الضبط (جهة العمل ونوع التأشيرة…)
        <select id="prof"><option value="">— من غير —</option>${profs.profiles.map((p) => `<option value="${p.id}"${String(p.id) === String(profileId) ? ' selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>
        <a href="#/profiles" class="small">إدارة ملفات الضبط</a></div></div>
      <div class="card"><h2>صورة الجواز وقراءة MRZ</h2><div class="row" style="align-items:flex-start">
        <div style="min-width:240px"><input type="file" id="pasF" accept="image/jpeg,image/png,application/pdf">
          ${pending.passport ? `<div style="margin-top:8px"><img class="thumb" src="${objUrl(pending.passport)}"></div>` : (!isNew && person.hasPassport ? `<div style="margin-top:8px"><img class="thumb" src="/api/people/${id}/file/passport?t=${Date.now()}" onerror="this.style.display='none'"></div>` : '')}
          <div class="small muted" style="margin-top:6px">${isNew ? 'اختار صورة الجواز (بتترفع أول ما تحفظ).' : 'صورة الجواز للتوثيق والقراءة (مش بتتبعت للمنصة).'}</div>
          <div class="row" style="margin-top:6px"><button class="btn small pri" id="ocrLocal">قراءة MRZ من الصورة</button>${meta.ocr && !isNew ? '<button class="btn small" id="ocrBtn">قراءة بـ Gemini</button>' : ''}</div></div>
        <div style="flex:1;min-width:280px"><label class="f">سطري MRZ (آخر سطرين في صفحة بيانات الجواز) — اتملوا لوحدهم من «قراءة MRZ من الصورة»، أو الصقهم هنا<textarea id="mrz" class="mrz" placeholder="P&lt;EGY....&#10;A12345678...."></textarea></label>
          <div class="row" style="margin-top:6px"><button class="btn" id="mrzBtn">حلّل MRZ واملى البيانات</button><span id="mrzMsg" class="small"></span></div></div></div></div>
      ${personFields}
      <div class="card"><h2>بيانات بتتورّث من ملف الضبط (اكتب هنا لو الشخص ده مختلف)</h2><div class="grid">${inherit.map((f) => fieldHtml(f, data[f.k], pd[f.k] ? (f.type === 'select' ? pd[f.k] : pd[f.k]) : '')).join('')}</div></div>
      <div class="card"><h2>الصورة الشخصية (لازم أقل من 1 ميجا)</h2><div class="row" style="align-items:flex-start">
        <div>${pending.photo ? `<img class="photo" src="${objUrl(pending.photo)}">` : (!isNew && person.hasPhoto ? `<img class="photo" src="/api/people/${id}/file/photo?t=${Date.now()}">` : '<div class="photo"></div>')}</div>
        <div><input type="file" id="phF" accept="image/jpeg,image/png"><div class="small muted" style="margin-top:6px">${isNew ? 'بتترفع أول ما تحفظ.' : ''} بتتصغّر تلقائي لو أكبر من الحد. المنصة بتفحص مواصفات الصورة (خلفية فاتحة ووش واضح).</div>${!isNew && person.hasPhoto ? '<button class="btn small danger" id="phDel" style="margin-top:6px">حذف الصورة</button>' : ''}</div></div></div>
      <div class="card"><label class="f">ملاحظات<input data-k="notes" value="${e(data.notes || '')}"></label></div>
      ${resolved ? `<div class="card"><h2>الجاهزية</h2>${resolved.ready ? '<span class="pill ok">كل البيانات المطلوبة موجودة</span>' : `<ul class="list issues">${resolved.issues.map((x) => `<li>${e(x)}</li>`).join('')}</ul>`}${resolved.warns.length ? `<ul class="list warns">${resolved.warns.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <div class="row"><button class="btn pri" id="save">حفظ</button>${!isNew ? '<button class="btn pri" id="fill">املى الطلب في المنصة</button><button class="btn danger" id="del" style="margin-inline-start:auto">حذف الشخص</button>' : ''}<a href="#/people" class="btn" style="text-decoration:none">رجوع</a></div>`;
      wire();
      overCheck();
    };
    const overCheck = () => {
      view.querySelectorAll('[data-k]').forEach((el) => {
        const f = [...meta.personGroups, ...meta.groups].flatMap((g) => g.fields).find((x) => x.k === el.dataset.k);
        const o = view.querySelector(`[data-over="${el.dataset.k}"]`); if (!f || !f.max || !o) return;
        const check = () => { o.textContent = el.value.length > f.max ? `${el.value.length} حرف: أطول من الحد (${f.max})` : ''; };
        el.addEventListener('input', check); check();
      });
    };
    const save = async () => {
      data = { ...data, ...collect(view) }; profileId = $('#prof').value;
      const body = { profileId: profileId || null, data };
      if (isNew) {
        const r = await api('POST', '/people', body);
        for (const [kind, f] of [['passport', pending.passport], ['photo', pending.photo]]) { if (f) { const fd = new FormData(); fd.append('file', f); await api('POST', `/people/${r.id}/files/${kind}`, fd).catch((er) => toast('الصورة ما اترفعتش: ' + er.message, 'err')); } }
        toast('اتحفظ', 'ok'); location.hash = '#/people/' + r.id; return r.id;
      }
      await api('PUT', `/people/${id}`, body); toast('اتحفظ', 'ok'); return id;
    };
    const wire = () => {
      $('#prof').onchange = () => { data = { ...data, ...collect(view) }; profileId = $('#prof').value; draw(); };
      $('#save').onclick = () => save().then(() => { if (!isNew) pagePerson(id); }).catch((er) => { if (er.data && er.data.duplicateId && confirm(er.message + '\nتفتحه؟')) location.hash = '#/people/' + er.data.duplicateId; else fail(er); });
      const applyMrz = (r, how) => {
        data = { ...collect(view), ...Object.fromEntries(Object.entries(r.suggest).filter(([, v]) => v)) }; const keep = r.lines.join('\n'); draw();
        $('#mrz').value = keep;
        $('#mrzMsg').innerHTML = `<span class="pill ${r.confidence === 'high' ? 'ok' : r.confidence === 'medium' ? 'warn' : 'bad'}">${how || ''}دقة ${r.confidence === 'high' ? 'عالية (الأرقام سليمة)' : r.confidence === 'medium' ? 'متوسطة: راجع' : 'ضعيفة: راجع كل حاجة'}</span> ${r.warnings.map(e).join(' · ')}`;
        const re = $('#mrzMsg'); if (re) re.scrollIntoView({ block: 'nearest' });
      };
      const passportBlob = async () => {
        if (pending.passport) return pending.passport;
        if (!isNew && person.hasPassport) { const src = await fetch(`/api/people/${id}/file/passport`, { credentials: 'same-origin' }); if (src.ok) return src.blob(); }
        return null;
      };
      /* قراءة MRZ من الصورة جوه المتصفح */
      const runLocalOcr = async () => {
        const btn = $('#ocrLocal'), msg = $('#mrzMsg');
        try {
          const blob = await passportBlob(); if (!blob) return toast('اختار صورة الجواز الأول', 'err');
          btn.disabled = true; msg.textContent = 'بيجهّز محرك القراءة (أول مرة بياخد دقيقة)…';
          const texts = await window.MrzOcr.read(blob, (m) => { if (m.status === 'recognizing text' && typeof m.progress === 'number') msg.textContent = 'بيقرا… ' + Math.round(m.progress * 100) + '%'; else if (m.status === 'reading') msg.textContent = 'بيقرا الصورة…'; });
          let best = null; const rank = { high: 3, medium: 2, low: 1 };
          for (const t of texts) { try { const r = await api('POST', '/people/mrz', { text: t }); if (!best || rank[r.confidence] > rank[best.confidence]) best = r; if (r.confidence === 'high') break; } catch (er) { /* القصّة دي ما فيهاش MRZ */ } }
          if (!best) { msg.textContent = ''; return toast('ما قدرتش أقرا MRZ من الصورة. جرّب صورة أوضح (مسطّحة وإضاءة كويسة) أو الصق السطرين.', 'err'); }
          applyMrz(best, 'من الصورة — ');
        } catch (er) { fail(er); msg.textContent = ''; } finally { btn.disabled = false; }
      };
      $('#ocrLocal').onclick = runLocalOcr;
      $('#mrzBtn').onclick = async () => {
        try {
          if (!$('#mrz').value.trim()) return runLocalOcr();
          applyMrz(await api('POST', '/people/mrz', { text: $('#mrz').value }));
        } catch (er) { fail(er); }
      };
      const pas = $('#pasF'); if (pas) pas.onchange = async () => {
        try {
          const f = await compress(pas.files[0], 3.5 * 1048576, 2200);
          if (isNew) { pending.passport = f; data = { ...data, ...collect(view) }; draw(); return; }
          const fd = new FormData(); fd.append('file', f); await api('POST', `/people/${id}/files/passport`, fd); toast('اترفعت صورة الجواز', 'ok'); data = { ...data, ...collect(view) }; pagePerson(id);
        } catch (er) { fail(er); }
      };
      const ph = $('#phF'); if (ph) ph.onchange = async () => {
        try {
          const f = await compress(ph.files[0], 1048576, 900);
          if (isNew) { pending.photo = f; data = { ...data, ...collect(view) }; draw(); return; }
          const fd = new FormData(); fd.append('file', f); await api('POST', `/people/${id}/files/photo`, fd); toast('اترفعت الصورة (' + Math.round(f.size / 1024) + ' ك.ب)', 'ok'); data = { ...data, ...collect(view) }; pagePerson(id);
        } catch (er) { fail(er); }
      };
      const pd = $('#phDel'); if (pd) pd.onclick = async () => { if (!confirm('تحذف الصورة؟')) return; await api('DELETE', `/people/${id}/files/photo`).catch(fail); pagePerson(id); };
      const oc = $('#ocrBtn'); if (oc) oc.onclick = async () => {
        try {
          const src = await fetch(`/api/people/${id}/file/passport`, { credentials: 'same-origin' }); if (!src.ok) return toast('ارفع صورة الجواز الأول', 'err');
          const blob = await src.blob(); const fd = new FormData(); fd.append('file', blob, 'p.jpg'); oc.disabled = true; oc.textContent = 'بيقرا…';
          const r = await api('POST', '/people/ocr', fd);
          if (r.mrz) { data = { ...collect(view), ...Object.fromEntries(Object.entries(r.mrz.suggest).filter(([, v]) => v)) }; draw(); toast(r.mrz.confidence === 'high' ? 'اتقرا بدقة عالية' : 'اتقرا: راجع البيانات', r.mrz.confidence === 'high' ? 'ok' : ''); $('#mrz').value = r.mrz.lines.join('\n'); } else toast(r.note || 'ما اتقراش', 'err');
        } catch (er) { fail(er); } finally { oc.disabled = false; oc.textContent = 'قراءة تلقائية من الصورة'; }
      };
      const fl = $('#fill'); if (fl) fl.onclick = async () => { try { await save(); fillRequest(id); } catch (er) { fail(er); } };
      const dl = $('#del'); if (dl) dl.onclick = async () => { if (!confirm('تحذف الشخص ده نهائياً؟')) return; try { await api('DELETE', `/people/${id}`); location.hash = '#/people'; } catch (er) { fail(er); } };
    };
    draw();
  }

  async function pageProfiles() {
    const r = await api('GET', '/profiles');
    view.innerHTML = `<h1>ملفات الضبط</h1><p class="muted">كل ملف = جهة عمل/دفعة: نوع التأشيرة والممثلية وبيانات الكفيل وقيم افتراضية (المؤهل، الديانة…). أي شخص بيتربط بملف، وممكن يغلب أي قيمة بقيمته.</p>
      <div class="row" style="margin-bottom:12px"><button class="btn pri" id="newP">+ ملف جديد</button></div><div id="plist">${r.profiles.map((p) => `<div class="card"><div class="row"><b>${e(p.name)}</b>${p.isDefault ? '<span class="pill ok">الافتراضي</span>' : ''}<button class="btn small edit" data-id="${p.id}" style="margin-inline-start:auto">تعديل</button></div></div>`).join('') || '<p class="muted">لسه مفيش ملفات.</p>'}</div><div id="peditor"></div>`;
    const edit = (p) => {
      const d = (p && p.data) || {};
      $('#peditor').innerHTML = `<div class="card"><h2>${p ? 'تعديل: ' + e(p.name) : 'ملف جديد'}</h2><label class="f">اسم الملف<input id="pname" value="${e(p ? p.name : '')}"></label><br>
        ${meta.groups.map((g) => `<h2 style="margin-top:14px">${e(g.title)}</h2><div class="grid">${g.fields.map((f) => fieldHtml(f, d[f.k])).join('')}</div>`).join('')}
        <div class="row" style="margin-top:14px"><button class="btn pri" id="psave">حفظ</button><label><input type="checkbox" id="pdef"${p && p.isDefault ? ' checked' : ''}> الافتراضي</label>${p ? '<button class="btn danger" id="pdel" style="margin-inline-start:auto">حذف</button>' : ''}</div></div>`;
      $('#peditor').scrollIntoView({ behavior: 'smooth' });
      $('#psave').onclick = async () => { try { const body = { name: $('#pname').value, data: collect($('#peditor')), isDefault: $('#pdef') ? $('#pdef').checked : false }; if (p) await api('PUT', `/profiles/${p.id}`, body); else await api('POST', '/profiles', body); toast('اتحفظ', 'ok'); pageProfiles(); } catch (er) { fail(er); } };
      if (p) $('#pdel').onclick = async () => { if (!confirm('تحذف الملف؟')) return; try { await api('DELETE', `/profiles/${p.id}`); pageProfiles(); } catch (er) { fail(er); } };
    };
    $('#newP').onclick = () => edit(null);
    view.onclick = (ev) => { const b = ev.target.closest('.edit'); if (b) edit(r.profiles.find((x) => String(x.id) === b.dataset.id)); };
  }

  async function pageUsers() {
    if (me.role !== 'admin') { view.innerHTML = '<p class="muted">ده للمدير بس.</p>'; return; }
    const r = await api('GET', '/users');
    view.innerHTML = `<h1>المستخدمين</h1><div class="card"><h2>مستخدم جديد</h2><div class="row"><input id="nu" placeholder="اسم المستخدم (إنجليزي)" style="padding:8px;border:1px solid var(--line);border-radius:8px"><input id="nn" placeholder="الاسم" style="padding:8px;border:1px solid var(--line);border-radius:8px"><input id="np" type="password" placeholder="كلمة السر (8+)" style="padding:8px;border:1px solid var(--line);border-radius:8px"><label><input type="checkbox" id="na"> مدير</label><button class="btn pri" id="nadd">إضافة</button></div></div>
      <div class="card" style="padding:0"><table><thead><tr><th>المستخدم</th><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>${r.users.map((u) => `<tr><td dir="ltr" style="text-align:right">${e(u.username)}</td><td>${e(u.display_name)}</td><td>${u.role === 'admin' ? 'مدير' : 'موظف'}</td><td>${u.active ? '<span class="pill ok">شغال</span>' : '<span class="pill bad">موقوف</span>'}</td><td><button class="btn small tog" data-id="${u.id}" data-a="${u.active ? 0 : 1}">${u.active ? 'إيقاف' : 'تفعيل'}</button> <button class="btn small pw" data-id="${u.id}">كلمة سر جديدة</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#nadd').onclick = async () => { try { await api('POST', '/users', { username: $('#nu').value, name: $('#nn').value, password: $('#np').value, role: $('#na').checked ? 'admin' : 'user' }); toast('اتضاف', 'ok'); pageUsers(); } catch (er) { fail(er); } };
    view.onclick = async (ev) => {
      const t = ev.target.closest('.tog'), p = ev.target.closest('.pw');
      try { if (t) { await api('PUT', `/users/${t.dataset.id}`, { active: t.dataset.a === '1' }); pageUsers(); } if (p) { const pw = prompt('كلمة السر الجديدة (8 حروف على الأقل)'); if (pw) { await api('PUT', `/users/${p.dataset.id}`, { password: pw }); toast('اتغيّرت', 'ok'); } } } catch (er) { fail(er); }
    };
  }

  async function pageExtension() {
    const v = await api('GET', '/extension-version').catch(() => ({}));
    view.innerHTML = `<h1>إضافة Chrome</h1><div class="card"><p>الإضافة بتملا فورم «طلب تأشيرة» في منصة التأشيرات من بيانات الشخص (والصورة الشخصية). الكابتشا والإقرارات وزرار «حفظ» بتتم بإيدك. مفيش بيانات بتتبعت لأي سيرفر تالت: كله بين تبويب النظام وتبويب المنصة.</p>
      <a class="btn pri" href="/api/extension.zip" style="text-decoration:none">⬇️ تحميل الإضافة${v.version ? ' (' + e(v.version) + ')' : ''}</a> <span id="extNow" class="pill"></span></div>
      <div class="card"><h2>التسطيب (مرة واحدة على كل كمبيوتر)</h2><ol class="steps">
        <li>فك الملف (كليك يمين ← Extract All). هيطلع فولدر <b>nesr-visa-apply-extension</b>. حطه في مكان مش هتمسحه (مثلاً Documents).</li>
        <li>افتح Chrome واكتب <b dir="ltr">chrome://extensions</b> وادوس Enter.</li>
        <li>فعّل <b>وضع المطور (Developer mode)</b> (فوق على اليمين).</li>
        <li>دوس <b>تحميل إضافة غير مضغوطة (Load unpacked)</b> واختار الفولدر.</li>
        <li>ارجع هنا واعمل تحديث للصفحة (F5). لازم تلاقي فوق «الإضافة شغّالة».</li></ol></div>
      <div class="card"><h2>الاستخدام</h2><ol class="steps">
        <li>ادخل منصة التأشيرات بحسابك (الإضافة مبتخزّنش أي كلمة سر).</li>
        <li>من «الأشخاص» دوس <b>املى الطلب</b> على الشخص.</li>
        <li>هيفتح فورم «طلب تأشيرة» ويتملي. راجع الخانات اللي حواليها إطار برتقالي.</li>
        <li>علّم على الإقرارات، اكتب رمز الصورة، ودوس <b>حفظ</b>.</li>
        <li>رقم الطلب بيرجع للنظام لوحده. لو ما رجعش، سجّله من صفحة الشخص.</li></ol></div>`;
    ping(); setTimeout(() => { const n = $('#extNow'); if (n) { n.className = 'pill ' + (extReady ? 'ok' : 'warn'); n.textContent = extReady ? 'شغّالة على المتصفح ده' : 'مش متركّبة على المتصفح ده'; } }, 800);
  }

  /* ===== التوجيه ===== */
  const NAV = [['#/people', 'الأشخاص'], ['#/profiles', 'ملفات الضبط'], ['#/users', 'المستخدمين', 'admin'], ['#/extension', 'الإضافة']];
  async function render() {
    const h = location.hash || '#/people';
    if (!me) { try { me = (await api('GET', '/me')).user; } catch (er) { /* مش داخل */ } }
    if (!me) return pageLogin();
    if (!meta) meta = await api('GET', '/meta');
    $('#top').hidden = false; $('#whoName').textContent = me.name;
    $('#nav').innerHTML = NAV.filter((n) => !n[2] || me.role === n[2]).map((n) => `<a href="${n[0]}" class="${h.startsWith(n[0]) ? 'on' : ''}">${n[1]}</a>`).join('');
    setExt(); ping();
    try {
      let m;
      if ((m = h.match(/^#\/people\/(new|\d+)$/))) await pagePerson(m[1]);
      else if (h.startsWith('#/profiles')) await pageProfiles();
      else if (h.startsWith('#/users')) await pageUsers();
      else if (h.startsWith('#/extension')) await pageExtension();
      else if (h === '#/login') { location.hash = '#/people'; }
      else await pagePeople();
    } catch (er) { if (er.status !== 401) view.innerHTML = `<div class="card issues">${e(er.message)}</div>`; }
  }
  $('#logoutBtn').onclick = async () => { await api('POST', '/logout').catch(() => {}); me = null; location.hash = '#/login'; render(); };
  window.addEventListener('hashchange', render);
  render();
})();
