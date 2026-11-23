'use strict';
/* واجهة نظام طلبات التأشيرات (JS عادي من غير بناء). الصفحات: الأشخاص · شخص · ملفات الضبط · المستخدمين · الإضافة */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const e = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let me = null, meta = null, extReady = false;
  const STATUS = { draft: ['مسودة', ''], ready: ['جاهز', 'acc'], waiting: ['مستني تأمين الجواز', 'bad'], filled: ['اتملى في المنصة', 'warn'], submitted: ['اتبعت', 'ok'] };

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
  const fail = (er) => { try { console.error(er && er.stack || er); } catch (x) { /* مش مهم */ } toast(er.message || String(er), 'err'); };

  /* ===== جسر الإضافة ===== */
  const bridge = { pending: [] };
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data; if (!m || m.source !== 'nesr-visaapply-ext') return;
    if (m.type === 'VA_READY') { extReady = true; setExt(); }
    if (m.type === 'VA_ACK') { bridge.pending.splice(0).forEach((f) => f(true)); }
    if (m.type === 'VA_ERROR') { toast(m.data && m.data.message || 'مشكلة في الإضافة', 'err'); bridge.pending.splice(0).forEach((f) => f(false)); }
    if (m.type === 'VA_RESULT' && m.data) onResult(m.data);
    if (m.type === 'VA_VISAINFO_RESULT' && m.data) onVisaInfo(m.data);
    if (m.type === 'VA_VISAINFO_CAPTCHA' && m.data) onVisaCaptcha(m.data);
    if (m.type === 'VA_VISAINFO_DOC' && m.data) onVisaDoc(m.data);
    if (m.type === 'VA_NEXT' && m.data && m.data.personId) { if (m.data.target === 'wafid') wafidRequest(m.data.personId, m.data.queue || [], m.data.total || 0, true); else if (m.data.target === 'lab') labRequest(m.data.personId, m.data.queue || [], m.data.total || 0, true); else fillRequest(m.data.personId, m.data.queue || [], m.data.total || 0, true); }
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
  /* بحث «التفويض على تأشيرة» من جوه النظام: الإضافة بتفتح المنصة في تبويب مخفي وبتبعتلنا صورة الكابتشا، وإنت اللي بتكتبها هنا وتدوس بحث (مفيش أي حل تلقائي للكابتشا) */
  let capTimer = null;
  const visaCtl = (op, captcha) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_VISAINFO_CTL', data: { op, captcha: captcha || '' } }, location.origin);
  const capCard = (html) => { const b = $('#visaCapBox'); if (b) b.innerHTML = `<div class="card" style="background:var(--warn-bg);border-color:#ecd9a8;margin-top:8px">${html}</div>`; };
  const capWait = (msg, ms) => { clearTimeout(capTimer); capCard(`<b>${e(msg)}</b>`); capTimer = setTimeout(() => onVisaCaptcha({ message: 'المنصة اتأخرت في الرد.' }), ms || 30000); };
  function onVisaCaptcha(d) {
    clearTimeout(capTimer); if (!$('#visaCapBox')) return;
    const img = typeof d.image === 'string' && d.image.startsWith('data:image/png;base64,') ? d.image : '';
    if (!img) {
      capCard(`<b>${e(d.message || 'مقدرتش أجيب صورة الكابتشا من المنصة.')}</b><div class="row" style="margin-top:8px"><button class="btn" id="capOpen">افتح تبويب المنصة واكتب الكابتشا هناك</button><button class="btn" id="capRetry">جرّب تاني</button></div>`);
      $('#capOpen').onclick = () => visaCtl('open'); $('#capRetry').onclick = () => { const b = $('#visaLookup'); if (b) b.click(); };
      return;
    }
    const step = d.step === 2 ? 2 : 1;
    capCard(`<b>${step === 2 ? 'الخطوة 2 من 2 (مستند التأشيرة): ' : 'الخطوة 1 من 2 (التفويض): '}اكتب رمز الصورة (الكابتشا) ودوس بحث</b>${d.error ? `<div class="pill bad" style="margin-inline-start:8px">${e(d.message || 'الكود غلط: اكتب الكود الجديد')}</div>` : ''}
      <div class="row" style="margin-top:8px;align-items:center"><img id="capImg" src="${img}" alt="الكابتشا" style="height:46px;border:1px solid var(--line);border-radius:6px;background:#fff"><button class="btn small" id="capRefresh" type="button">صورة تانية</button>
      <input id="capIn" maxlength="8" dir="ltr" autocomplete="off" inputmode="text" style="width:130px;padding:8px;font-size:20px;letter-spacing:3px"><button class="btn pri" id="capGo" type="button">بحث</button><button class="btn small" id="capCancel" type="button">${step === 2 ? 'تخطّي' : 'إلغاء'}</button></div><div class="muted small" id="capMsg" style="margin-top:4px"></div>`);
    const inp = $('#capIn'); inp.focus();
    const go = () => { const v = inp.value.trim(); if (!v) return toast('اكتب رمز الصورة الأول', 'err'); $('#capGo').disabled = true; $('#capMsg').textContent = 'بيدوّر في المنصة…'; visaCtl('submit', v); clearTimeout(capTimer); capTimer = setTimeout(() => onVisaCaptcha({ message: 'المنصة اتأخرت في الرد.' }), 40000); };
    $('#capGo').onclick = go; inp.onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
    $('#capRefresh').onclick = () => { $('#capMsg').textContent = 'بنجيب صورة تانية…'; visaCtl('refresh'); };
    $('#capCancel').onclick = () => { visaCtl('cancel'); const b = $('#visaCapBox'); if (b) b.innerHTML = ''; };
  }
  /* نتيجة «التفويض على تأشيرة»: بيانات الجهة بتتحط في خانات ملف الضبط المفتوح، وقايمة التفاويض/المهن بتظهر تختار منها (من غير حفظ، إنت اللي بتراجع وتدوس حفظ) */
  function onVisaInfo(d) {
    clearTimeout(capTimer); { const cb = $('#visaCapBox'); if (cb) cb.innerHTML = ''; }
    const ed = $('#peditor'); const has = (k) => ed && ed.querySelector(`[data-k="${k}"]`);
    if (!has('sponsorName')) return toast('اتجابت بيانات التأشيرة بس مفيش ملف ضبط مفتوح: افتح الملف من «ملفات الضبط» وجرّب تاني.', 'err');
    const put = (k, v) => { const el = has(k); if (!el || !v) return false; if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === String(v))) return false; el.value = v; return true; };
    const done = [];
    if (put('sponsorName', d.sponsorName)) done.push('اسم جهة العمل');
    if (put('sponsorNumber', d.unifiedNumber)) done.push('رقم الجهة');
    put('unifiedNumber', d.unifiedNumber); if (!(has('visaNumber') || {}).value) put('visaNumber', d.visaNumber);
    if (put('embassy', d.embassyCode)) done.push('الممثلية (' + (d.embassyName || d.embassyCode) + ')');
    if ((d.jobs || []).some((j) => /مصر/.test(j.nationality)) && put('nationality', 'EGY')) done.push('الجنسية (مصر)');
    const remainingOf = (job, emb) => { const j = (d.jobs || []).find((x) => x.job === job && (!emb || x.embassy === emb)) || (d.jobs || []).find((x) => x.job === job); return j ? j.remaining : ''; };
    const rows = ((d.delegations || []).length ? d.delegations.map((x) => ({ number: x.number, embassy: x.embassy, count: x.count, job: x.job, agency: x.agencyName })) : (d.jobs || []).map((j) => ({ number: '', embassy: j.embassy, count: j.count, job: j.job, agency: '' })));
    const box = $('#visaInfoBox'); if (!box) return;
    const rem = (r) => { const m = remainingOf(r.job, r.embassy); return m === '' ? '' : `${e(m)}${m === '0' ? ' ⚠️' : ''}`; };
    box.innerHTML = `<div class="card" style="background:var(--warn-bg);border-color:#ecd9a8;margin-top:8px"><b>بيانات التأشيرة من المنصة${d.visaDate ? ' (تاريخ التأشيرة ' + e(d.visaDate) + ')' : ''}</b>
      <div class="muted small">${done.length ? 'اتملّى في الملف: ' + e(done.join('، ')) : 'مفيش بيانات جديدة اتملّت'}</div>
      ${rows.length ? `<h3 style="margin:10px 0 4px">اختار التفويض / المهنة</h3><div style="overflow:auto"><table><thead><tr><th></th><th>رقم التفويض</th><th>جهة القدوم</th><th>عدد الأشخاص</th><th>المهنة</th><th>المتبقي</th><th>اسم الوكالة</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><input type="radio" name="visaPickRow" value="${i}"${rows.length === 1 ? ' checked' : ''}></td><td dir="ltr" style="text-align:right">${e(r.number)}</td><td>${e(r.embassy)}</td><td>${e(r.count)}</td><td><b>${e(r.job)}</b></td><td>${rem(r)}</td><td>${e(r.agency)}</td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="visaPick">موافق</button><span class="muted small">بيحط المهنة (والممثلية) في الملف</span></div>` : '<div style="margin-top:6px">مفيش تفاويض ولا مهن في النتيجة: اكتب المهنة بإيدك.</div>'}
      <div class="muted small" style="margin-top:6px">الصفحة دي مفيهاش: نوع التأشيرة، عدد الدخول، الصلاحية، مدة الإقامة، عنوان وهاتف الجهة، وسيلة الوصول والمنفذ وتاريخ الدخول، والقيم الافتراضية للأشخاص. كمّلهم بإيدك، ودوس <b>حفظ</b> بعد المراجعة.</div></div>`;
    const apply = (r) => {
      const ok = [];
      if (put('jobText', r.job)) ok.push('المهنة (' + r.job + ')');
      const code = (opt('embassy').find((o) => o.t === r.embassy) || {}).v; if (code && put('embassy', code)) ok.push('الممثلية (' + r.embassy + ')');
      if (remainingOf(r.job, r.embassy) === '0') toast('تنبيه: العدد المتبقي لـ «' + r.job + '» صفر', 'err');
      return ok;
    };
    if (rows.length === 1) apply(rows[0]);
    const pk = $('#visaPick');
    if (pk) pk.onclick = () => { const c = box.querySelector('input[name=visaPickRow]:checked'); if (!c) return toast('اختار صف الأول', 'err'); const ok = apply(rows[Number(c.value)]); toast(ok.length ? 'اتحطّت: ' + ok.join('، ') + '. دوس حفظ بعد المراجعة' : 'ماحطّيتش حاجة', ok.length ? 'ok' : 'err'); };
    toast(rows.length > 1 ? 'اتجابت البيانات: اختار التفويض/المهنة وادوس موافق' : 'اتملّت بيانات التأشيرة في الملف: راجعها ودوس حفظ', 'ok');
    capWait('الخطوة 2 من 2: بنفتح استعلام مستند التأشيرة…', 30000); /* الإضافة بتكمّل في نفس التبويب الخلفي */
  }
  /* الخطوة 2: «مستند تأشيرة»: نوع التأشيرة، عدد الدخول، مدة الإقامة، المهنة، جهة القدوم */
  function onVisaDoc(d) {
    clearTimeout(capTimer); { const cb = $('#visaCapBox'); if (cb) cb.innerHTML = ''; }
    const ed = $('#peditor'); const has = (k) => ed && ed.querySelector(`[data-k="${k}"]`);
    if (!has('visaKind')) return toast('اتجاب مستند التأشيرة بس مفيش ملف ضبط مفتوح: افتح الملف وجرّب تاني.', 'err');
    const put = (k, v) => { const el = has(k); if (!el || !v) return false; if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === String(v))) return false; el.value = v; return true; };
    const rows = d.rows || []; const uniq = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))];
    const done = [], skipped = [];
    const kind = (opt('visaKind').find((o) => o.v === String(d.visaKindId)) || {}).t;
    if (put('visaKind', d.visaKindId)) done.push('نوع التأشيرة (' + (kind || d.visaKindId) + ')'); else skipped.push('نوع التأشيرة' + (rows[0] && rows[0].visaKind ? ' («' + rows[0].visaKind + '» مش في القايمة)' : ''));
    const ent = uniq('entries'); if (ent.length === 1 && put('entriesText', ent[0])) done.push('عدد الدخول (' + ent[0] + ')'); else if (ent.length > 1) skipped.push('عدد الدخول (فيه أكتر من قيمة: ' + ent.join('، ') + ')');
    const res = uniq('residence'); if (res.length === 1 && put('residence', res[0])) done.push('مدة الإقامة (' + res[0] + ')'); else if (!res.length) skipped.push('مدة الإقامة (فاضية في المستند)');
    if (rows.some((r) => /مصر/.test(r.nationality)) && put('nationality', 'EGY')) done.push('الجنسية (مصر)');
    const jobs = uniq('job'); if (jobs.length === 1 && !(has('jobText') || {}).value && put('jobText', jobs[0])) done.push('المهنة (' + jobs[0] + ')');
    const embs = uniq('embassy'); const code = embs.length === 1 ? (opt('embassy').find((o) => o.t === embs[0]) || {}).v : ''; if (code && !(has('embassy') || {}).value && put('embassy', code)) done.push('الممثلية (' + embs[0] + ')');
    if (d.sponsorName && !(has('sponsorName') || {}).value && put('sponsorName', d.sponsorName)) done.push('اسم الجهة');
    const box = $('#visaDocBox');
    if (box) box.innerHTML = `<div class="card" style="background:var(--warn-bg);border-color:#ecd9a8;margin-top:8px"><b>من مستند التأشيرة${d.docNumber ? ' رقم ' + e(d.docNumber) : ''}${d.docDate ? ' (' + e(d.docDate) + ')' : ''}</b>
      <ul class="list">${done.length ? `<li>اتملّى في الملف: ${e(done.join('، '))}</li>` : '<li>مفيش حاجة اتملّت</li>'}${skipped.length ? `<li>كمّلها بإيدك: ${e(skipped.join('، '))}</li>` : ''}</ul>
      <div class="muted small">المستند مفيهوش: صلاحية التأشيرة (الأيام)، عنوان وهاتف الجهة، وسيلة الوصول والمنفذ وتاريخ الدخول. راجع ودوس <b>حفظ</b>.</div></div>`;
    toast('اتملّت بيانات مستند التأشيرة في الملف: راجعها ودوس حفظ', 'ok');
  }
  async function fillRequest(id, queue, total, quiet) {
    try {
      const pl = await api('GET', `/people/${id}/payload`);
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة. من «الإضافة» نزّلها وركّبها الأول.', 'err');
      let photo = '';
      if (pl.hasPhoto) { const blob = await (await fetch(`/api/people/${id}/file/photo`, { credentials: 'same-origin' })).blob(); photo = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); }
      if (!quiet && pl.issues.length && !confirm('فيه نواقص:\n- ' + pl.issues.join('\n- ') + '\n\nتفتح الفورم وتملا اللي موجود؟')) return;
      const ok = await new Promise((res) => { bridge.pending.push(res); window.postMessage({ source: 'nesr-visaapply', type: 'VA_FILL', data: { personId: id, name: pl.name, mofa: pl.mofa, issues: pl.issues, warns: pl.warns, photo, queue: queue || [], queueTotal: total || 0 } }, location.origin); setTimeout(() => res(false), 4000); });
      if (!ok) toast('الإضافة ما ردّتش. اعمل F5 للصفحة وجرّب تاني (أو Reload للإضافة).', 'err'); else toast('اتفتح فورم المنصة وبيتملي…', 'ok');
    } catch (er) { fail(er); }
  }

  async function wafidRequest(id, queue, total, quiet) {
    try {
      const pl = await api('GET', `/people/${id}/wafid`);
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة. من «الإضافة» نزّلها وركّبها الأول.', 'err');
      if (!quiet && pl.issues.length && !confirm('فيه نواقص للفحص الطبي:\n- ' + pl.issues.join('\n- ') + '\n\nتفتح وافد وتملا اللي موجود؟')) return;
      const ok = await new Promise((res) => { bridge.pending.push(res); window.postMessage({ source: 'nesr-visaapply', type: 'VA_WAFID', data: { personId: id, name: pl.name, wafid: pl.wafid, issues: pl.issues, warns: pl.warns, queue: queue || [], queueTotal: total || 0 } }, location.origin); setTimeout(() => res(false), 4000); });
      if (!ok) toast('الإضافة ما ردّتش. اعمل F5 للصفحة (ولازم الإضافة تبقى 1.4.0 أو أحدث).', 'err'); else toast('اتفتح موقع وافد وبيتملي…', 'ok');
    } catch (er) { fail(er); }
  }

  async function labRequest(id, queue, total, quiet) {
    try {
      const pl = await api('GET', `/people/${id}/lab`);
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة. من «الإضافة» نزّلها وركّبها الأول.', 'err');
      if (!quiet && pl.issues.length && !confirm('فيه نواقص لحجز المعمل:\n- ' + pl.issues.join('\n- ') + '\n\nتفتح موقع المعمل وتملا اللي موجود؟')) return;
      const ok = await new Promise((res) => { bridge.pending.push(res); window.postMessage({ source: 'nesr-visaapply', type: 'VA_LAB', data: { personId: id, name: pl.name, lab: pl.lab, issues: pl.issues, warns: pl.warns, queue: queue || [], queueTotal: total || 0 } }, location.origin); setTimeout(() => res(false), 4000); });
      if (!ok) toast('الإضافة ما ردّتش. اعمل F5 للصفحة (ولازم الإضافة تبقى 1.6.0 أو أحدث).', 'err'); else toast('اتفتح موقع المعمل وبيتملي…', 'ok');
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
  const collect = (root) => { const o = {}; root.querySelectorAll('[data-k]').forEach((el) => { if (typeof el.value === 'string') o[el.dataset.k] = el.value.trim(); }); return o; };
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

  /* ===== مراحل الطلب ===== */
  const stageDots = (st) => (st && meta.stages ? `<span class="dots">${meta.stages.map((x) => { const c = st[x.k] || {}; return `<i class="dot ${c.state || ''}" title="${e(x.label)}: ${c.state === 'done' ? 'تم' : c.state === 'booked' ? 'محجوز' + (c.date ? ' ' + c.date : '') : 'لسه'}"></i>`; }).join('')}</span>` : '');
  const STATE_AR = { '': 'لسه', booked: 'محجوز', done: 'تم' };

  /* ===== قص من صورة الجواز (للصورة الشخصية أو لمنطقة MRZ) ===== */
  function openCropper({ src, aspect, title, hint, initial, maxSide, onDone }) {
    const ov = document.createElement('div'); ov.className = 'cropper';
    ov.innerHTML = `<div class="cropper-in"><div class="cropper-h"><b>${e(title)}</b><span class="muted small">${e(hint || '')}</span></div>
      <div class="cropper-stage"><img id="crImg" alt=""><div class="crop-sel" id="crSel"><i class="h tl" data-h="tl"></i><i class="h tr" data-h="tr"></i><i class="h bl" data-h="bl"></i><i class="h br" data-h="br"></i></div></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="crOk">تأكيد</button><button class="btn" id="crNo">إلغاء</button></div></div>`;
    document.body.appendChild(ov);
    const img = ov.querySelector('#crImg'), sel = ov.querySelector('#crSel'); let b = { x: 0, y: 0, w: 0, h: 0 };
    const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    const paint = () => { sel.style.left = b.x + 'px'; sel.style.top = b.y + 'px'; sel.style.width = b.w + 'px'; sel.style.height = b.h + 'px'; };
    const clamp = () => { const W = img.clientWidth, H = img.clientHeight; b.w = Math.max(24, Math.min(b.w, W)); b.h = Math.max(24, Math.min(b.h, H)); b.x = Math.max(0, Math.min(b.x, W - b.w)); b.y = Math.max(0, Math.min(b.y, H - b.h)); };
    img.onload = () => {
      const W = img.clientWidth, H = img.clientHeight; const i = initial || { x: 0.06, y: 0.25, w: 0.24, h: 0.5 };
      b = { x: i.x * W, y: i.y * H, w: i.w * W, h: aspect ? (i.w * W) / aspect : i.h * H }; if (aspect && b.h > H) { b.h = H * 0.9; b.w = b.h * aspect; } clamp(); paint();
    };
    img.src = src;
    let drag = null;
    ov.addEventListener('pointerdown', (ev) => {
      const h = ev.target.dataset && ev.target.dataset.h; if (!h && ev.target !== sel) return;
      ev.preventDefault(); drag = { h, sx: ev.clientX, sy: ev.clientY, b: { ...b } }; try { ov.setPointerCapture(ev.pointerId); } catch (er) { /* مش مهم */ }
    });
    ov.addEventListener('pointermove', (ev) => {
      if (!drag) return; const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy; const o = drag.b; const W = img.clientWidth, H = img.clientHeight;
      if (!drag.h) { b.x = Math.max(0, Math.min(o.x + dx, W - o.w)); b.y = Math.max(0, Math.min(o.y + dy, H - o.h)); paint(); return; }
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (drag.h.includes('l')) x1 = Math.min(o.x + dx, x2 - 24); else x2 = Math.max(o.x + o.w + dx, x1 + 24);
      if (drag.h.includes('t')) y1 = Math.min(o.y + dy, y2 - 24); else y2 = Math.max(o.y + o.h + dy, y1 + 24);
      x1 = Math.max(0, x1); y1 = Math.max(0, y1); x2 = Math.min(W, x2); y2 = Math.min(H, y2);
      let w = x2 - x1, h = y2 - y1;
      if (aspect) { h = w / aspect; if (drag.h.includes('t')) y1 = y2 - h; else y2 = y1 + h; if (y1 < 0) { y1 = 0; h = y2 - y1; w = h * aspect; if (drag.h.includes('l')) x1 = x2 - w; else x2 = x1 + w; } if (y2 > H) { y2 = H; h = y2 - y1; w = h * aspect; if (drag.h.includes('l')) x1 = x2 - w; else x2 = x1 + w; } }
      b = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; paint();
    });
    const up = () => { drag = null; }; ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
    ov.querySelector('#crNo').onclick = close;
    ov.querySelector('#crOk').onclick = async () => {
      try {
        const kx = img.naturalWidth / img.clientWidth, ky = img.naturalHeight / img.clientHeight;
        let sw = Math.round(b.w * kx), sh = Math.round(b.h * ky); const sc = maxSide ? Math.min(1, maxSide / Math.max(sw, sh)) : 1;
        const c = document.createElement('canvas'); c.width = Math.round(sw * sc); c.height = Math.round(sh * sc);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(img, Math.round(b.x * kx), Math.round(b.y * ky), sw, sh, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.93)); close(); await onDone(blob);
      } catch (er) { fail(er); }
    };
  }

  async function pagePeople() {
    const [profs] = await Promise.all([api('GET', '/profiles')]);
    const state = JSON.parse(sessionStorage.getItem('peopleFilter') || '{}');
    view.innerHTML = `<h1>الأشخاص</h1>
      <div class="card"><div class="row">
        <input id="q" placeholder="بحث بالاسم أو رقم الجواز" value="${e(state.q || '')}" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;min-width:220px">
        <select id="st" style="padding:8px;border:1px solid var(--line);border-radius:8px"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.st === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select>
        <select id="pf" style="padding:8px;border:1px solid var(--line);border-radius:8px"><option value="">كل ملفات الضبط</option>${profs.profiles.map((p) => `<option value="${p.id}"${String(state.pf) === String(p.id) ? ' selected' : ''}>${e(p.name)}</option>`).join('')}</select>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="exOnly"${state.ex ? ' checked' : ''}> جوازات قريبة الانتهاء</label>
        <select id="sf" style="padding:8px;border:1px solid var(--line);border-radius:8px"><option value="">كل المراحل</option>${(meta.stages || []).map((x) => `<option value="p:${x.k}"${state.sf === 'p:' + x.k ? ' selected' : ''}>لسه: ${e(x.label)}</option>${x.booking ? `<option value="b:${x.k}"${state.sf === 'b:' + x.k ? ' selected' : ''}>محجوز: ${e(x.label)}</option>` : ''}<option value="d:${x.k}"${state.sf === 'd:' + x.k ? ' selected' : ''}>تم: ${e(x.label)}</option>`).join('')}</select>
        <button class="btn" id="tashBtn" title="ملف Excel لموقع تساهيل (للمحدّدين، أو كل المعروضين)">تصدير لتساهيل</button>
        <button class="btn pri" id="queueBtn" hidden>املى المحدّدين بالتتابع</button>
        <button class="btn pri" id="wafQueueBtn" hidden>احجز الفحص (وافد) للمحدّدين</button>
        <button class="btn pri" id="labQueueBtn" hidden>احجز المعمل للمحدّدين</button>
        <a href="#/people/new" class="btn pri" style="margin-inline-start:auto;text-decoration:none">+ شخص جديد</a></div></div>
      <div id="upc"></div>
      <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th style="width:30px"><input type="checkbox" id="selAll" title="تحديد الكل"></th><th>الاسم</th><th>الجواز</th><th>ملف الضبط</th><th>الحالة</th><th>النواقص</th><th>المراحل</th><th>رقم الطلب</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="7" class="muted">جاري التحميل…</td></tr></tbody></table></div>`;
    let shown = [];
    const selectedIds = () => [...view.querySelectorAll('.sel:checked')].map((c) => c.dataset.id);
    const syncQueue = () => { const n = selectedIds().length; const b = $('#queueBtn'); if (!b) return; b.hidden = n === 0; b.textContent = `املى المحدّدين بالتتابع (${n})`; const wq = $('#wafQueueBtn'); if (wq) { wq.hidden = n === 0; wq.textContent = `احجز الفحص (وافد) للمحدّدين (${n})`; } const lq = $('#labQueueBtn'); if (lq) { lq.hidden = n === 0; lq.textContent = `احجز المعمل للمحدّدين (${n})`; } const t = $('#tashBtn'); if (t) t.textContent = n ? `تصدير لتساهيل (${n})` : 'تصدير لتساهيل'; };
    const load = async () => {
      const st = { q: $('#q').value, st: $('#st').value, pf: $('#pf').value, ex: $('#exOnly').checked, sf: $('#sf').value }; sessionStorage.setItem('peopleFilter', JSON.stringify(st));
      const r = await api('GET', `/people?q=${encodeURIComponent(st.q)}&status=${st.st}&profile=${st.pf}`);
      shown = r.people.filter((p) => !st.ex || (p.expiry && (p.expiry.short || p.expiry.expired)));
      if (st.sf) { const [mode, key] = st.sf.split(':'); shown = shown.filter((p) => { const c = (p.stages || {})[key] || {}; return mode === 'p' ? !c.state : mode === 'b' ? c.state === 'booked' : c.state === 'done'; }); }
      $('#selAll').checked = false; syncQueue();
      $('#rows').innerHTML = shown.map((p) => `<tr class="click" data-id="${p.id}"><td><input type="checkbox" class="sel" data-id="${p.id}"></td><td><b>${e(p.name || '—')}</b></td><td dir="ltr" style="text-align:right">${e(p.passportNo)}</td><td>${e(p.profileName || '—')}</td>
        <td><span class="pill ${STATUS[p.status] ? STATUS[p.status][1] : ''}">${e((STATUS[p.status] || [p.status])[0])}</span></td>
        <td>${p.ready ? '<span class="pill ok">كامل</span>' : `<span class="pill bad">${p.issues} ناقص</span>`} ${p.expiry && p.expiry.expired ? '<span class="pill bad">جواز منتهي</span>' : p.expiry && p.expiry.short ? `<span class="pill warn" title="أقل من 6 شهور من تاريخ الدخول">ينتهي بعد ${p.expiry.days} يوم</span>` : ''} ${p.hasPhoto ? '📷' : '<span class="muted" title="مفيش صورة شخصية">—</span>'}</td>
        <td>${stageDots(p.stages)}</td>
        <td dir="ltr" style="text-align:right">${e(p.appNumber || '')}</td><td><button class="btn small pri fill" data-id="${p.id}">املى الطلب</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">مفيش أشخاص.</td></tr>';
    };
    ['q', 'st', 'pf', 'exOnly', 'sf'].forEach((i) => { $('#' + i).oninput = () => load().catch(fail); });
    $('#wafQueueBtn').onclick = async () => {
      const ids = selectedIds(); if (!ids.length) return;
      const items = ids.map((id) => { const p = shown.find((x) => String(x.id) === String(id)) || {}; return { id, name: p.name || '#' + id }; });
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة.', 'err');
      toast(`بدأ طابور وافد: ${items.length} شخص. بعد ما تخلّص كل واحد دوس «الشخص التالي» في صفحة وافد.`, 'ok');
      wafidRequest(items[0].id, items.slice(1), items.length, true);
    };
    $('#labQueueBtn').onclick = async () => {
      const ids = selectedIds(); if (!ids.length) return;
      const items = ids.map((id) => { const p = shown.find((x) => String(x.id) === String(id)) || {}; return { id, name: p.name || '#' + id }; });
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة.', 'err');
      toast(`بدأ طابور المعمل: ${items.length} شخص. بعد ما تخلّص كل واحد دوس «الشخص التالي» في صفحة المعمل.`, 'ok');
      labRequest(items[0].id, items.slice(1), items.length, true);
    };
    $('#tashBtn').onclick = () => { const ids = selectedIds().length ? selectedIds() : shown.map((p) => p.id); if (!ids.length) return toast('مفيش أشخاص للتصدير', 'err'); window.location.href = `/api/export/tasaheel.xls?ids=${ids.slice(0, 1500).join(',')}`; toast('بينزّل ملف تساهيل (' + ids.length + ' شخص)', 'ok'); };
    api('GET', '/reports/summary').then((r) => { const u = (r.upcoming || []).slice(0, 6); const box = $('#upc'); if (box && u.length) box.innerHTML = `<div class="card" style="background:var(--warn-bg);border-color:#ecd9a8"><b>📅 مواعيد خلال 7 أيام:</b> ${u.map((x) => `<a href="#/people/${x.personId}">${e(x.name || '#' + x.personId)}</a> — ${e(x.stage)} ${e(x.date)}`).join(' · ')}</div>`; }).catch(() => {});
    $('#selAll').onchange = () => { view.querySelectorAll('.sel').forEach((c) => { c.checked = $('#selAll').checked; }); syncQueue(); };
    $('#queueBtn').onclick = async () => {
      const ids = selectedIds(); if (!ids.length) return;
      const items = ids.map((id) => { const p = shown.find((x) => String(x.id) === String(id)) || {}; return { id, name: p.name || '#' + id, ready: !!p.ready }; });
      const notReady = items.filter((x) => !x.ready).length;
      if (notReady && !confirm(`${notReady} من المحدّدين ناقصين بيانات (هيتملي اللي موجود بس). تكمّل؟`)) return;
      if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
      if (!extReady) return toast('إضافة Chrome مش متركّبة.', 'err');
      toast(`بدأ طابور ${items.length} شخص. بعد ما تحفظ كل واحد دوس «الشخص التالي» في المنصة.`, 'ok');
      fillRequest(items[0].id, items.slice(1).map((x) => ({ id: x.id, name: x.name })), items.length, true);
    };
    view.onclick = (ev) => { if (ev.target.classList.contains('sel')) { syncQueue(); return; } if (ev.target.id === 'selAll') return; const b = ev.target.closest('.fill'); if (b) { ev.stopPropagation(); return fillRequest(b.dataset.id); } const tr = ev.target.closest('tr.click'); if (tr) location.hash = '#/people/' + tr.dataset.id; };
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
    const stamp = Date.now(); const pv = { z: 1 };
    const stagesHtml = () => {
      if (isNew || !meta.stages) return '';
      const st = person.stages || {};
      return `<div class="card"><h2>مراحل الطلب</h2><div class="stages">${meta.stages.map((x) => { const c = st[x.k] || { state: '', date: '', note: '' };
        return `<div class="stg" data-stage="${x.k}"><b>${e(x.label)}</b><select class="stS">${['', ...(x.booking ? ['booked'] : []), 'done'].map((v) => `<option value="${v}"${c.state === v ? ' selected' : ''}>${STATE_AR[v]}</option>`).join('')}</select><input type="date" class="stD" value="${e(c.date || '')}"><input class="stN" placeholder="ملاحظة (مكان / رقم / …)" value="${e(c.note || '')}">
          ${x.k === 'sent' ? `<div class="stX small">رقم الطلب: <b dir="ltr">${e(person.appNumber || '—')}</b> <input id="appNo" placeholder="E123456789" dir="ltr"> <button class="btn small" id="appNoBtn">سجّل رقم الطلب</button>${(c.history || []).length ? `<div class="muted">أرقام سابقة (قبل إعادة الإرسال): ${c.history.map((h) => `<span dir="ltr">${e(h.app)}</span>`).join('، ')}</div>` : ''}</div>` : ''}</div>`; }).join('')}</div></div>`;
    };
    const sideHtml = () => {
      const src = pending.passport ? { url: objUrl(pending.passport), pdf: pending.passport.type === 'application/pdf' } : (!isNew && person.hasPassport ? { url: `/api/people/${id}/file/passport?t=${stamp}`, pdf: false } : null);
      const photoSrc = pending.photo ? objUrl(pending.photo) : (!isNew && person.hasPhoto ? `/api/people/${id}/file/photo?t=${stamp}` : '');
      const viewer = src
        ? (src.pdf ? `<div class="pv-empty">صورة الجواز ملف PDF — <a href="${src.url}" target="_blank" rel="noopener">افتحه في تبويب جديد</a></div>`
          : `<div class="pv-bar"><button class="btn small" id="pvOut" title="تصغير">−</button><button class="btn small" id="pvIn" title="تكبير">+</button><button class="btn small" id="pvFit" title="ملاءمة العرض">ملاءمة</button><a class="btn small" href="${src.url}" target="_blank" rel="noopener" style="text-decoration:none">فتح بحجم كامل</a><span class="zl" id="pvZl"></span></div>
          <div class="pv-box" id="pvBox"><img id="pvImg" src="${src.url}" alt="صورة الجواز"></div><div class="pv-empty" id="pvErr" hidden>الملف مش صورة (ممكن PDF) — <a href="${src.url}" target="_blank" rel="noopener">افتحه</a></div>
          <div class="row" style="margin-top:8px"><button class="btn small" id="cropPhoto" title="اختار وش الشخص من صورة الجواز">قص الصورة الشخصية من الجواز</button><button class="btn small" id="cropMrz" title="لو القراءة التلقائية ضعيفة">تحديد سطري MRZ يدوياً</button></div>
          <div class="small muted" style="margin-top:6px">دوس على الصورة للتكبير. قارن الأرقام والتواريخ والاسم بالحقول اللي جنبها.</div>`)
        : '<div class="pv-empty">ارفع صورة الجواز (من المربع على اليمين) وهتظهر هنا جنب الحقول للمراجعة.</div>';
      return `<div class="card pv"><h2>صورة الجواز للمراجعة</h2>${viewer}</div>${photoSrc ? `<div class="card"><div class="row" style="align-items:flex-start"><img class="photo" src="${photoSrc}" alt="الصورة الشخصية"><div class="small muted">الصورة الشخصية اللي هتتبعت للمنصة.</div></div></div>` : ''}`;
    };
    const wirePv = () => {
      const img = $('#pvImg'); const box = $('#pvBox'); if (!img || !box) return;
      const apply = () => { img.style.width = Math.round(pv.z * 100) + '%'; box.classList.toggle('zoomed', pv.z > 1); const zl = $('#pvZl'); if (zl) zl.textContent = Math.round(pv.z * 100) + '%'; };
      img.onerror = () => { box.hidden = true; const bar = $('.pv-bar'); if (bar) bar.hidden = true; $('#pvErr').hidden = false; };
      $('#pvIn').onclick = () => { pv.z = Math.min(4, +(pv.z + 0.5).toFixed(2)); apply(); };
      $('#pvOut').onclick = () => { pv.z = Math.max(1, +(pv.z - 0.5).toFixed(2)); apply(); };
      $('#pvFit').onclick = () => { pv.z = 1; apply(); box.scrollTo(0, 0); };
      img.onclick = (ev) => { const r = img.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height; pv.z = pv.z > 1 ? 1 : 2.5; apply(); if (pv.z > 1) { const maxL = Math.max(0, img.clientWidth - box.clientWidth); const left = Math.max(0, Math.min(maxL, fx * img.clientWidth - box.clientWidth / 2)); box.scrollLeft = getComputedStyle(box).direction === 'rtl' ? left - maxL : left; box.scrollTop = fy * img.clientHeight - box.clientHeight / 2; } };
      apply();
    };
    const draw = () => {
      const pd = profileData();
      const personFields = meta.personGroups.map((g) => `<div class="card"><h2>${e(g.title)}</h2><div class="grid">${g.fields.map((f) => fieldHtml(f, data[f.k], f.k.startsWith('nameAr') && f.k !== 'nameAr' ? (splitArabic(data.nameAr)[{ nameArFirst: 'first', nameArFather: 'father', nameArGrand: 'grand', nameArFamily: 'family' }[f.k]] || '') : '')).join('')}</div></div>`).join('');
      const inherit = meta.groups.flatMap((g) => g.fields).filter((f) => f.scope === 'both');
      view.innerHTML = `<h1>${isNew ? 'شخص جديد' : e(data.nameAr || 'شخص') + ' <span class="pill ' + ((STATUS[person.status] || [0, ''])[1]) + '">' + e((STATUS[person.status] || [person.status])[0]) + '</span>'}</h1>
      <div class="split"><div class="main">
      <div class="card"><div class="row"><label class="f" style="min-width:260px">ملف الضبط (جهة العمل ونوع التأشيرة…)
        <select id="prof"><option value="">— من غير —</option>${profs.profiles.map((p) => `<option value="${p.id}"${String(p.id) === String(profileId) ? ' selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>
        ${isNew ? '' : `<label class="f" style="min-width:200px">الحالة
        <select id="stSel">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${person.status === k ? ' selected' : ''}>${e(v[0])}</option>`).join('')}</select></label>`}
        <a href="#/profiles" class="small">إدارة ملفات الضبط</a></div></div>
      ${stagesHtml()}
      <div class="card"><h2>صورة الجواز وقراءة MRZ</h2><div class="row" style="align-items:flex-start">
        <div style="min-width:240px"><input type="file" id="pasF" accept="image/jpeg,image/png,application/pdf">
          <div class="small muted" style="margin-top:6px">${isNew ? 'اختار صورة الجواز (بتترفع أول ما تحفظ).' : 'صورة الجواز للتوثيق والقراءة (مش بتتبعت للمنصة).'}</div>
          <div class="row" style="margin-top:6px"><button class="btn small pri" id="ocrLocal">قراءة MRZ من الصورة</button></div></div>
        <div style="flex:1;min-width:280px"><label class="f">سطري MRZ (آخر سطرين في صفحة بيانات الجواز) — اتملوا لوحدهم من «قراءة MRZ من الصورة»، أو الصقهم هنا<textarea id="mrz" class="mrz" placeholder="P&lt;EGY....&#10;A12345678...."></textarea></label>
          <div class="row" style="margin-top:6px"><button class="btn" id="mrzBtn">حلّل MRZ واملى البيانات</button><span id="mrzMsg" class="small"></span></div></div></div></div>
      ${personFields}
      <div class="card"><h2>بيانات بتتورّث من ملف الضبط (اكتب هنا لو الشخص ده مختلف)</h2><div class="grid">${inherit.map((f) => fieldHtml(f, data[f.k], pd[f.k] ? (f.type === 'select' ? pd[f.k] : pd[f.k]) : '')).join('')}</div></div>
      <div class="card"><h2>الصورة الشخصية (لازم أقل من 1 ميجا)</h2><div class="row" style="align-items:flex-start">
        <div>${pending.photo ? `<img class="photo" src="${objUrl(pending.photo)}">` : (!isNew && person.hasPhoto ? `<img class="photo" src="/api/people/${id}/file/photo?t=${Date.now()}">` : '<div class="photo"></div>')}</div>
        <div><input type="file" id="phF" accept="image/jpeg,image/png"><div class="small muted" style="margin-top:6px">${isNew ? 'بتترفع أول ما تحفظ.' : ''} بتتصغّر تلقائي لو أكبر من الحد. المنصة بتفحص مواصفات الصورة (خلفية فاتحة ووش واضح).</div>${!isNew && person.hasPhoto ? '<button class="btn small danger" id="phDel" style="margin-top:6px">حذف الصورة</button>' : ''}</div></div></div>
      <div class="card"><label class="f">ملاحظات<input data-k="notes" value="${e(data.notes || '')}"></label></div>
      ${resolved ? `<div class="card"><h2>الجاهزية</h2>${resolved.ready ? '<span class="pill ok">كل البيانات المطلوبة موجودة</span>' : `<ul class="list issues">${resolved.issues.map((x) => `<li>${e(x)}</li>`).join('')}</ul>`}${resolved.warns.length ? `<ul class="list warns">${resolved.warns.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <div class="row actions"><button class="btn pri" id="save">حفظ</button>${!isNew ? '<button class="btn pri" id="fill">املى الطلب في المنصة</button><button class="btn" id="wafid" title="بيفتح موقع وافد ويملا فورم حجز الفحص الطبي">احجز الفحص الطبي (وافد)</button><button class="btn" id="lab" title="بيفتح موقع معامل الصحة العامة ويملا فورم حجز المعمل">احجز المعمل</button><button class="btn danger" id="del" style="margin-inline-start:auto">حذف الشخص</button>' : ''}<a href="#/people" class="btn" style="text-decoration:none">رجوع</a></div>
      </div><aside class="side">${sideHtml()}</aside></div>`;
      wire();
      wirePv();
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
    const stSel = $('#stSel'); if (stSel) stSel.onchange = async () => { try { await api('POST', `/people/${id}/result`, { status: stSel.value }); person.status = stSel.value; toast('اتغيّرت الحالة', 'ok'); } catch (er) { fail(er); } };
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
        const cur = collect(view); const gs = {}; Object.entries(r.guess || {}).forEach(([k, v]) => { if (v && !cur[k]) gs[k] = v; }); data = { ...cur, ...gs, ...Object.fromEntries(Object.entries(r.suggest).filter(([, v]) => v)) }; const keep = r.lines.join('\n'); draw();
        $('#mrz').value = keep;
        $('#mrzMsg').innerHTML = `<span class="pill ${r.confidence === 'high' ? 'ok' : r.confidence === 'medium' ? 'warn' : 'bad'}">${how || ''}دقة ${r.confidence === 'high' ? 'عالية (الأرقام سليمة)' : r.confidence === 'medium' ? 'متوسطة: راجع' : 'ضعيفة: راجع كل حاجة'}</span> ${r.warnings.map(e).join(' · ')}${gs.issueDate ? ' · <b>تاريخ الإصدار تقدير</b> (الانتهاء − 7 سنين): راجعه من الصورة' : ''} · <span class="muted">الاسم العربي ومكان الميلاد مش في MRZ، اكتبهم من الصورة</span>`;
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
      /* لو Gemini متفعّل: بيقرا كل حاجة (MRZ + الاسم العربي + مكان الميلاد + الإصدار)، ولو فشل أو الدقة مش عالية بنكمّل بالقراءة المحلية */
      const runRead = async () => {
        if (!meta.ocr) return runLocalOcr();
        const btn = $('#ocrLocal'), msg = $('#mrzMsg');
        try {
          const blob = await passportBlob(); if (!blob) return toast('اختار صورة الجواز الأول', 'err');
          btn.disabled = true; msg.textContent = 'بيقرا الجواز بالذكاء الاصطناعي…';
          const fd = new FormData(); fd.append('file', blob, 'p.jpg');
          const r = await api('POST', '/people/ocr', fd);
          applyMrz(r.mrz, 'Gemini — ');
          if (!r.mrzOk || r.mrz.confidence !== 'high') { msg.textContent += ' — بكمّل بالقراءة المحلية للـ MRZ…'; btn.disabled = false; await runLocalOcr(); }
        } catch (er) { btn.disabled = false; toast('قراءة Gemini فشلت (' + er.message + ') — بجرّب القراءة المحلية', 'err'); await runLocalOcr(); } finally { btn.disabled = false; }
      };
      $('#ocrLocal').onclick = runRead;
      const mrzFromBlob = async (blob) => {
        const msg = $('#mrzMsg'); msg.textContent = 'بيجهّز محرك القراءة…';
        const texts = await window.MrzOcr.read(blob, (m) => { if (m.status === 'recognizing text' && typeof m.progress === 'number') msg.textContent = 'بيقرا… ' + Math.round(m.progress * 100) + '%'; }, { cropped: true });
        let best = null; const rank = { high: 3, medium: 2, low: 1 };
        for (const t of texts) { try { const r = await api('POST', '/people/mrz', { text: t }); if (!best || rank[r.confidence] > rank[best.confidence]) best = r; if (r.confidence === 'high') break; } catch (er) { /* مفيش MRZ في النص ده */ } }
        if (!best) { msg.textContent = ''; return toast('ما قدرتش أقرا السطرين من المنطقة دي. ظبط المربع على السطرين بالظبط أو الصقهم.', 'err'); }
        applyMrz(best, 'من المنطقة المحددة — ');
      };
      const srcUrl = () => (pending.passport ? objUrl(pending.passport) : `/api/people/${id}/file/passport?t=${stamp}`);
      const cp = $('#cropPhoto'); if (cp) cp.onclick = () => openCropper({ src: srcUrl(), aspect: 0.78, title: 'قص الصورة الشخصية', hint: 'حرّك المربع على وش الشخص، وكبّره أو صغّره من الأركان', initial: { x: 0.05, y: 0.24, w: 0.27 }, maxSide: 1000,
        onDone: async (blob) => {
          const f = await compress(new File([blob], 'photo.jpg', { type: 'image/jpeg' }), 1048576, 900);
          if (isNew) { pending.photo = f; data = { ...data, ...collect(view) }; draw(); return toast('اتحطّت كصورة شخصية (بتترفع أول ما تحفظ)', 'ok'); }
          const fd = new FormData(); fd.append('file', f); await api('POST', `/people/${id}/files/photo`, fd); toast('اتحفظت كصورة شخصية', 'ok'); data = { ...data, ...collect(view) }; pagePerson(id);
        } });
      const cm = $('#cropMrz'); if (cm) cm.onclick = () => openCropper({ src: srcUrl(), aspect: 0, title: 'حدّد سطري MRZ', hint: 'اسحب المربع على السطرين اللي في آخر صفحة البيانات (اللي فيهم < < <)', initial: { x: 0.02, y: 0.74, w: 0.96, h: 0.24 }, onDone: (blob) => mrzFromBlob(blob).catch(fail) });
      view.querySelectorAll('.stg').forEach((row) => {
        const k = row.dataset.stage;
        const send = async () => { try { const r = await api('PUT', `/people/${id}/stages/${k}`, { state: row.querySelector('.stS').value, date: row.querySelector('.stD').value, note: row.querySelector('.stN').value }); person.stages = r.stages; row.querySelector('.stD').value = r.stages[k].date; toast('اتحفظت المرحلة', 'ok'); } catch (er) { fail(er); } };
        ['.stS', '.stD', '.stN'].forEach((c) => { row.querySelector(c).onchange = send; });
      });
      const an = $('#appNoBtn'); if (an) an.onclick = async () => { const v = $('#appNo').value.trim().toUpperCase(); if (!/^[A-Z]\d{6,12}$/.test(v)) return toast('رقم الطلب شكله غلط (حرف + أرقام، زي E123456789)', 'err'); try { await api('POST', `/people/${id}/result`, { status: 'submitted', appNumber: v }); toast('اتسجّل رقم الطلب', 'ok'); pagePerson(id); } catch (er) { fail(er); } };

      $('#mrzBtn').onclick = async () => {
        try {
          if (!$('#mrz').value.trim()) return runRead();
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
      const wf = $('#wafid'); if (wf) wf.onclick = async () => { try { await save(); wafidRequest(id); } catch (er) { fail(er); } };
      const lb = $('#lab'); if (lb) lb.onclick = async () => { try { await save(); labRequest(id); } catch (er) { fail(er); } };
      const fl = $('#fill'); if (fl) fl.onclick = async () => { try { await save(); fillRequest(id); } catch (er) { fail(er); } };
      const dl = $('#del'); if (dl) dl.onclick = async () => { if (!confirm('تحذف الشخص ده نهائياً؟')) return; try { await api('DELETE', `/people/${id}`); location.hash = '#/people'; } catch (er) { fail(er); } };
    };
    draw();
  }

  /* ===== رفع جماعي لصور الجوازات ===== */
  async function readMrzFromBlob(blob, prog) {
    const rank = { high: 3, medium: 2, low: 1 }; let best = null; let extras = {}; let guess = {};
    if (meta.ocr) {
      try {
        const fd = new FormData(); fd.append('file', blob, 'p.jpg'); const r = await api('POST', '/people/ocr', fd);
        if (r.mrz) { extras = r.mrz.suggest || {}; guess = r.mrz.guess || {}; if (r.mrzOk) best = r.mrz; }
      } catch (er) { /* نكمّل بالقراءة المحلية */ }
    }
    if (!best || best.confidence !== 'high') {
      try {
        const texts = await window.MrzOcr.read(blob, prog);
        for (const t of texts) { try { const r = await api('POST', '/people/mrz', { text: t }); if (!best || rank[r.confidence] > rank[best.confidence]) { best = r; guess = r.guess || guess; } if (r.confidence === 'high') break; } catch (er) { /* مفيش MRZ في النص ده */ } }
      } catch (er) { /* محرك القراءة فشل */ }
    }
    if (!best && !extras.nameAr) return null;
    const sug = { ...extras }; Object.entries((best && best.suggest) || {}).forEach(([k, v]) => { if (v) sug[k] = v; });
    if (!sug.issueDate && guess.issueDate) sug.issueDate = guess.issueDate;
    return { confidence: best ? best.confidence : 'low', suggest: sug };
  }

  async function pageBulk() {
    const profs = (await api('GET', '/profiles')).profiles;
    view.innerHTML = `<h1>رفع جماعي لصور الجوازات</h1>
      <p class="muted">اختار صور جوازات كتير مرة واحدة. النظام بيقرا سطري MRZ من كل صورة، ويعمل لكل واحد شخص جديد (الاسم الإنجليزي، رقم الجواز، التواريخ، الجنس) وبيحفظ صورة الجواز. الاسم العربي ومكان الميلاد والصورة الشخصية بتكمّلهم بعدين من صفحة كل شخص. مفيش حاجة بتتبعت للمنصة هنا.</p>
      <div class="card"><div class="row">
        <label class="f" style="min-width:260px">ملف الضبط للكل<select id="bp">${profs.map((p) => `<option value="${p.id}"${p.isDefault ? ' selected' : ''}>${e(p.name)}</option>`).join('') || '<option value="">— من غير —</option>'}</select></label>
        <label class="f">صور الجوازات<input type="file" id="bf" accept="image/jpeg,image/png" multiple></label>
        <button class="btn pri" id="bgo">ابدأ القراءة والتسجيل</button></div>
        <div id="bsum" class="muted" style="margin-top:8px"></div></div>
      <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>م</th><th>الصورة</th><th>النتيجة</th><th>الشخص</th></tr></thead><tbody id="brows"><tr><td colspan="4" class="muted">اختار الصور وادوس ابدأ.</td></tr></tbody></table></div>`;
    let running = false;
    $('#bgo').onclick = async () => {
      const files = [...$('#bf').files]; if (!files.length) return toast('اختار صور الأول', 'err'); if (running) return; running = true; $('#bgo').disabled = true;
      $('#brows').innerHTML = files.map((f, i) => `<tr id="br${i}"><td>${i + 1}</td><td dir="ltr" style="text-align:right">${e(f.name)}</td><td class="bs">في الطابور</td><td class="bl"></td></tr>`).join('');
      let ok = 0, dup = 0, bad = 0; const set = (i, t, link, kind) => { const r = $('#br' + i); if (!r) return; r.querySelector('.bs').innerHTML = `<span class="pill ${kind || ''}">${e(t)}</span>`; if (link) r.querySelector('.bl').innerHTML = link; };
      const sum = () => { $('#bsum').textContent = `تم: ${ok} · مكرر: ${dup} · فشل: ${bad} · الباقي: ${files.length - ok - dup - bad}`; };
      for (let i = 0; i < files.length; i++) {
        sum();
        try {
          set(i, 'بيجهّز الصورة…', '', 'warn');
          const img = await compress(files[i], 3.5 * 1048576, 2200);
          set(i, 'بيقرا الجواز…', '', 'warn');
          const r = await readMrzFromBlob(img, (m) => { if (m.status === 'recognizing text' && typeof m.progress === 'number') set(i, 'بيقرا… ' + Math.round(m.progress * 100) + '%', '', 'warn'); });
          if (!r || !r.suggest.passportNo) { bad++; set(i, 'ما اتقراش — صورة مش واضحة. ضيفه يدوي', '', 'bad'); continue; }
          const created = await api('POST', '/people', { profileId: $('#bp').value || null, data: r.suggest, bulk: true }).catch((er) => er);
          if (created && created.status === 409) { dup++; set(i, 'مكرر: ' + (r.suggest.passportNo || ''), `<a href="#/people/${created.data.duplicateId}">فتح الموجود</a>`, 'warn'); continue; }
          if (created instanceof Error) throw created;
          const fd = new FormData(); fd.append('file', img); await api('POST', `/people/${created.id}/files/passport`, fd);
          ok++; set(i, r.confidence === 'high' ? 'اتسجّل (دقة عالية)' : 'اتسجّل — راجع البيانات (دقة ' + (r.confidence === 'medium' ? 'متوسطة' : 'ضعيفة') + ')', `<a href="#/people/${created.id}">${e(r.suggest.passportNo)} — فتح</a>`, r.confidence === 'high' ? 'ok' : 'warn');
        } catch (er) { bad++; set(i, 'فشل: ' + (er.message || er), '', 'bad'); }
      }
      sum(); running = false; $('#bgo').disabled = false; toast('خلص الرفع الجماعي', 'ok');
    };
  }

  /* ===== التقارير ===== */
  async function pageReports() {
    const today = new Date().toISOString().slice(0, 10); const ago = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    view.innerHTML = `<h1>التقارير</h1>
      <div class="card"><div class="row"><label class="f">من<input type="date" id="rf" value="${ago}"></label><label class="f">إلى<input type="date" id="rt" value="${today}"></label>
        <label class="f">الحالة (للتصدير)<select id="rs"><option value="">الكل</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${e(v[0])}</option>`).join('')}</select></label>
        <button class="btn pri" id="rgo">تحديث</button><a class="btn" id="rx" href="#" style="text-decoration:none">تصدير Excel (CSV)</a></div></div>
      <div id="rbody"></div>`;
    const load = async () => {
      const f = $('#rf').value, t = $('#rt').value; const r = await api('GET', `/reports/summary?from=${f}&to=${t}`);
      $('#rx').href = `/api/reports/export.csv?from=${f}&to=${t}${$('#rs').value ? '&status=' + $('#rs').value : ''}`;
      const max = Math.max(1, ...r.daily.map((d) => Math.max(d.created, d.filled, d.submitted)));
      const bar = (n, c) => `<div style="display:inline-block;height:10px;width:${Math.round((n / max) * 120)}px;background:${c};border-radius:3px;vertical-align:middle"></div> ${n}`;
      const stagesCard = r.stages ? `<div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>المرحلة</th><th>لسه</th><th>محجوز</th><th>تم</th></tr></thead><tbody>${Object.values(r.stages).map((x) => `<tr><td>${e(x.label)}</td><td>${x.pending}</td><td>${x.booked}</td><td>${x.done}</td></tr>`).join('')}</tbody></table></div>` : '';
      const upcomingCard = (r.upcoming || []).length ? `<div class="card"><h2>مواعيد خلال 7 أيام</h2><ul class="list">${r.upcoming.map((x) => `<li><a href="#/people/${x.personId}">${e(x.name || '#' + x.personId)}</a> — ${e(x.stage)}: ${e(x.date)}</li>`).join('')}</ul></div>` : '';
      $('#rbody').innerHTML = `<div class="card"><h2>الوضع الحالي (${r.total} شخص)</h2><div class="row">${Object.entries(STATUS).map(([k, v]) => `<span class="pill ${v[1]}">${e(v[0])}: ${r.byStatus[k] || 0}</span>`).join('')}
        ${r.expiring ? `<span class="pill warn">جوازات قريبة الانتهاء: ${r.expiring}</span>` : ''}${r.expired ? `<span class="pill bad">جوازات منتهية: ${r.expired}</span>` : ''}</div></div>
        ${upcomingCard}${stagesCard}
        <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>اليوم</th><th>اتسجّلوا</th><th>اتملوا في المنصة</th><th>اتبعتوا</th></tr></thead><tbody>${r.daily.map((d) => `<tr><td>${e(d.day)}</td><td>${bar(d.created, '#2f6f6f')}</td><td>${bar(d.filled, '#d49b1f')}</td><td>${bar(d.submitted, '#2b8a4a')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">مفيش نشاط في الفترة دي (السجل بيبدأ من أول تحديث).</td></tr>'}</tbody></table></div>
        <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>الموظف</th><th>سجّل</th><th>ملا الفورم</th><th>بعت</th></tr></thead><tbody>${r.users.map((u) => `<tr><td>${e(u.user)}</td><td>${u.created}</td><td>${u.filled}</td><td>${u.submitted}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table></div>`;
    };
    $('#rgo').onclick = () => load().catch(fail); $('#rs').onchange = () => load().catch(fail);
    await load();
  }

  /* ===== سجل النشاط (للمدير) ===== */
  async function pageActivity() {
    const st = JSON.parse(sessionStorage.getItem('actFilter') || '{}');
    const q = (o) => `/activity?limit=300${o.user ? '&user=' + encodeURIComponent(o.user) : ''}${o.action ? '&action=' + encodeURIComponent(o.action) : ''}`;
    let r = await api('GET', q(st));
    view.innerHTML = `<h1>سجل النشاط</h1><div class="card"><div class="row">
      <select id="au"><option value="">كل الموظفين</option>${r.users.map((u) => `<option${st.user === u ? ' selected' : ''}>${e(u)}</option>`).join('')}</select>
      <select id="aa"><option value="">كل العمليات</option>${Object.entries(r.labels).map(([k, v]) => `<option value="${k}"${st.action === k ? ' selected' : ''}>${e(v)}</option>`).join('')}</select></div></div>
      <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>الوقت</th><th>الموظف</th><th>العملية</th><th>الشخص</th><th>تفاصيل</th></tr></thead><tbody id="arows"></tbody></table></div>`;
    const draw = () => { $('#arows').innerHTML = r.rows.map((x) => `<tr><td>${e(fmtDate(x.at))}</td><td>${e(x.user)}</td><td>${e(x.label)}</td><td>${x.personId ? `<a href="#/people/${x.personId}">${e(x.person || '#' + x.personId)}</a>` : ''}</td><td dir="ltr" style="text-align:right">${e(x.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">مفيش نشاط.</td></tr>'; };
    draw();
    const reload = async () => { const o = { user: $('#au').value, action: $('#aa').value }; sessionStorage.setItem('actFilter', JSON.stringify(o)); r = await api('GET', q(o)); draw(); };
    $('#au').onchange = () => reload().catch(fail); $('#aa').onchange = () => reload().catch(fail);
  }

  async function pageSettings() {
    view.innerHTML = `<h1>إعدادات التصدير</h1>
      <div class="card"><p style="margin:0">ملف تساهيل بيتكتب فيه التاريخ بنفس شكل ملف تساهيل الأصلي (مثلاً 22/May/1984)، ومفيش إعدادات هنا دلوقتي.</p></div>`;
  }

  async function pageProfiles() {
    const [r, tpl] = await Promise.all([api('GET', '/profiles'), api('GET', '/settings/profile-template').catch(() => ({ auto: false }))]);
    view.innerHTML = `<h1>ملفات الضبط</h1><p class="muted">كل ملف = جهة عمل/دفعة: نوع التأشيرة والممثلية وبيانات الكفيل وقيم افتراضية (المؤهل، الديانة…). أي شخص بيتربط بملف، وممكن يغلب أي قيمة بقيمته.</p>
      <div class="row" style="margin-bottom:12px"><button class="btn pri" id="newP">+ ملف جديد</button><label title="لما يكون شغّال: أي ملف جديد بيبدأ بالقيم الثابتة من الملف الافتراضي (نوع الجواز، الديانة، المؤهل، العناوين، الوصول…) من غير رقم التأشيرة والرقم الموحد واسم ورقم الجهة وتعليم الإقرارات"><input type="checkbox" id="tplAuto"${tpl.auto ? ' checked' : ''}> الملف الجديد يبدأ بقيم الملف الافتراضي (تلقائي)</label></div><div id="plist">${r.profiles.map((p) => `<div class="card"><div class="row"><b>${e(p.name)}</b>${p.isDefault ? '<span class="pill ok">الافتراضي</span>' : ''}<button class="btn small edit" data-id="${p.id}" style="margin-inline-start:auto">تعديل</button></div></div>`).join('') || '<p class="muted">لسه مفيش ملفات.</p>'}</div><div id="peditor"></div>`;
    const edit = (p) => {
      let d = (p && p.data) || {}; let fromTpl = '';
      if (!p && $('#tplAuto') && $('#tplAuto').checked) {
        /* الأرقام الخاصة بكل تأشيرة/جهة (واللي بتتجاب من البحث) وتعليم الإقرارات مبتتنسخش */
        const def = r.profiles.find((x) => x.isDefault); const skip = ['visaNumber', 'unifiedNumber', 'sponsorName', 'sponsorNumber', 'autoDeclare'];
        if (def) { d = Object.fromEntries(Object.entries(def.data || {}).filter(([k]) => !skip.includes(k))); fromTpl = def.name; } else toast('مفيش ملف افتراضي: علّم ملف كـ«الافتراضي» الأول', 'err');
      }
      $('#peditor').innerHTML = `<div class="card"><h2>${p ? 'تعديل: ' + e(p.name) : 'ملف جديد'}</h2>${fromTpl ? `<div class="pill ok" style="margin-bottom:8px">اتعبّى من الملف الافتراضي «${e(fromTpl)}»: راجع القيم وكمّل رقم التأشيرة والرقم الموحد</div>` : ''}<label class="f">اسم الملف<input id="pname" value="${e(p ? p.name : '')}"></label><br>
        ${meta.groups.map((g) => `<h2 style="margin-top:14px">${e(g.title)}</h2><div class="grid">${g.fields.map((f) => fieldHtml(f, d[f.k])).join('')}${g.id === 'lookup' ? '<div class="f" style="align-self:end"><button class="btn pri" id="visaLookup" title="بيدوّر في المنصة من الخلفية وبيعرضلك الكابتشا هنا تكتبها، وبعدها تختار المهنة هنا">بحث وجلب المهن</button></div>' : ''}</div>${g.id === 'lookup' ? '<div id="visaCapBox"></div><div id="visaInfoBox"></div><div id="visaDocBox"></div>' : ''}`).join('')}
        <div class="row" style="margin-top:14px"><button class="btn pri" id="psave">حفظ</button><label><input type="checkbox" id="pdef"${p && p.isDefault ? ' checked' : ''}> الافتراضي</label>${p ? '<button class="btn danger" id="pdel" style="margin-inline-start:auto">حذف</button>' : ''}</div></div>`;
      $('#peditor').scrollIntoView({ behavior: 'smooth' });
      $('#visaLookup').onclick = async () => {
        const dd = collect($('#peditor'));
        if (!dd.visaNumber || !dd.unifiedNumber) return toast('اكتب رقم التأشيرة والرقم الموحد الأول.', 'err');
        if (!extReady) { ping(); await new Promise((r) => setTimeout(r, 700)); }
        if (!extReady) return toast('إضافة Chrome مش متركّبة. من «الإضافة» نزّلها وركّبها الأول.', 'err');
        const ok = await new Promise((res) => { bridge.pending.push(res); window.postMessage({ source: 'nesr-visaapply', type: 'VA_VISAINFO', data: { name: $('#pname').value, visaNumber: dd.visaNumber, unifiedNumber: dd.unifiedNumber, docNumber: dd.docNumber, embassy: dd.embassy } }, location.origin); setTimeout(() => res(false), 4000); });
        if (ok) capWait('بنفتح المنصة في الخلفية ونجيب الكابتشا…', 25000); else toast('الإضافة ما ردّتش. اعمل F5 للصفحة (ولازم الإضافة تبقى 1.9.0 أو أحدث).', 'err');
      };
      $('#psave').onclick = async () => { try { const body = { name: $('#pname').value, data: collect($('#peditor')), isDefault: $('#pdef') ? $('#pdef').checked : false }; if (p) await api('PUT', `/profiles/${p.id}`, body); else await api('POST', '/profiles', body); toast('اتحفظ', 'ok'); pageProfiles(); } catch (er) { fail(er); } };
      if (p) $('#pdel').onclick = async () => { if (!confirm('تحذف الملف؟')) return; try { await api('DELETE', `/profiles/${p.id}`); pageProfiles(); } catch (er) { fail(er); } };
    };
    $('#newP').onclick = () => edit(null);
    $('#tplAuto').onchange = async () => { try { await api('PUT', '/settings/profile-template', { auto: $('#tplAuto').checked }); toast($('#tplAuto').checked ? 'الملفات الجديدة هتبدأ بقيم الملف الافتراضي' : 'الملفات الجديدة هتبدأ فاضية', 'ok'); } catch (er) { $('#tplAuto').checked = !$('#tplAuto').checked; fail(er); } };
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
  const NAV = [['#/people', 'الأشخاص'], ['#/bulk', 'رفع جماعي'], ['#/profiles', 'ملفات الضبط'], ['#/reports', 'التقارير'], ['#/activity', 'السجل', 'admin'], ['#/settings', 'إعدادات التصدير', 'admin'], ['#/users', 'المستخدمين', 'admin'], ['#/extension', 'الإضافة']];
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
      else if (h.startsWith('#/bulk')) await pageBulk();
      else if (h.startsWith('#/reports')) await pageReports();
      else if (h.startsWith('#/activity')) await pageActivity();
      else if (h.startsWith('#/settings')) await pageSettings();
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
