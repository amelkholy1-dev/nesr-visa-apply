'use strict';
/* «هات رقم إنجاز (رقم الطلب) من المنصة»: بنفتح «البحث عن طلب مقدم» في المنصة عن طريق الإضافة (تبويب في الخلفية)، والكابتشا بتظهرلك هنا وإنت اللي بتكتبها.
   بعد النتيجة بنسجّل رقم الطلب للشخص (ويتعلّم «اتبعت للمنصة»). لو اتحدّد أكتر من شخص بنكمّل واحد ورا التاني، وكل واحد بكابتشا. */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const NAMES = { '320': 'السويس', '302': 'القاهرة', '321': 'الإسكندرية' };
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const post = (type, data) => window.postMessage({ source: 'nesr-visaapply', type, data }, location.origin);
  const ctl = (op, captcha) => post('VA_APPNO_CTL', { op, captcha: captcha || '' });
  let S = null;

  const body = () => (S && S.root && S.root.isConnected ? S.root.querySelector('#apBody') : null);
  const head = () => `<h2>هات رقم إنجاز من المنصة</h2><div class="muted small" style="margin-bottom:10px">${S.ids.length > 1 ? `الشخص ${Math.min(S.i + 1, S.ids.length)} من ${S.ids.length} — ` : ''}الكابتشا بتكتبها إنت، والنظام مبيقراهاش ولا بيحلها.</div>`;
  const draw = (html) => { const b = body(); if (b) b.innerHTML = html; };
  const record = (id, name, status, msg, app) => { S.results.push({ id, name, status, msg: msg || '', app: app || '' }); };
  const nextPerson = () => { S.i++; S.override = null; return step(); };

  async function step() {
    clearTimeout(S.timer);
    if (S.i >= S.ids.length) return summary();
    const { e } = NA; const id = S.ids[S.i]; let info;
    draw(head() + `<div class="card" style="background:var(--warn-bg)"><b>بنجهّز بيانات الشخص…</b></div>`);
    try { info = await NA.api('GET', `/people/${id}/appno-lookup`); } catch (er) { record(id, '#' + id, 'err', er.message); return nextPerson(); }
    S.cur = { ...info, ...(S.override || {}) };
    if (!info.passportNo) { record(id, info.name, 'skip', 'رقم الجواز فاضي'); return nextPerson(); }
    if (S.opts.skipHave && info.appNumber) { record(id, info.name, 'skip', 'عنده رقم طلب بالفعل (' + info.appNumber + ')', info.appNumber); return nextPerson(); }
    draw(head() + `<div class="card" style="background:var(--warn-bg)"><b>بنفتح المنصة في الخلفية لـ ${e(info.name)}…</b></div>`);
    post('VA_APPNO', { personId: id, name: info.name, passportNo: S.cur.passportNo, nationality: S.cur.nationality, visaType: S.cur.visaType, embassy: S.cur.embassy });
    S.timer = setTimeout(() => NA.appno.onCaptcha({ error: true, message: 'المنصة اتأخرت في الرد.' }), 45000);
  }

  function onCaptcha(d) {
    if (!S) return; clearTimeout(S.timer); const { e } = NA;
    const img = typeof d.image === 'string' && d.image.startsWith('data:image/png;base64,') ? d.image : '';
    const c = S.cur || {};
    const who = `<div style="margin-bottom:8px"><b>${e(c.name || '')}</b> <span class="chip" dir="ltr">${e(c.passportNo || '')}</span> <span class="chip">${e(NAMES[c.embassy] || c.embassy || 'جهة القدوم؟')}</span></div>`;
    if (!img) {
      draw(head() + who + `<div class="card issues">${e(d.message || 'مقدرتش أجيب صورة الكابتشا من المنصة.')}</div>
        <div class="row" style="margin-top:10px"><button class="btn" id="apOpen">افتح تبويب المنصة</button><button class="btn pri" id="apRetry">جرّب تاني</button><button class="btn" id="apSkip">تخطّى الشخص ده</button><button class="btn danger" id="apStop">إلغاء</button></div>`);
      return wire();
    }
    draw(head() + who + `${(d.problems || []).length ? `<div class="card issues" style="margin-bottom:8px">${d.problems.map((x) => `<div>• ${e(x)}</div>`).join('')}</div>` : ''}
      ${d.error ? `<div class="card issues" style="margin-bottom:8px">${e(d.message || 'الكود غلط: اكتب الكود الجديد')}</div>` : ''}
      <div class="card" style="background:var(--warn-bg)"><b>اكتب رمز الصورة (الكابتشا) ودوس بحث</b>
      <div class="row" style="margin-top:8px;align-items:center"><img id="apImg" src="${img}" alt="الكابتشا" style="height:46px;border:1px solid var(--line);border-radius:6px;background:#fff"><button class="btn small" id="apRefresh" type="button">صورة تانية</button>
      <input id="apIn" maxlength="8" dir="ltr" autocomplete="off" style="width:130px;padding:8px;font-size:20px;letter-spacing:3px"><button class="btn pri" id="apGo" type="button">بحث</button></div><div class="muted small" id="apMsg" style="margin-top:6px"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="apSkip">تخطّى الشخص ده</button><button class="btn danger" id="apStop">إلغاء</button></div>`);
    const inp = S.root.querySelector('#apIn'); inp.focus();
    const go = () => { const v = inp.value.trim(); if (!v) return NA.toast('اكتب رمز الصورة الأول', 'err'); S.root.querySelector('#apGo').disabled = true; S.root.querySelector('#apMsg').textContent = 'بيدوّر في المنصة…'; ctl('submit', v); S.timer = setTimeout(() => onCaptcha({ error: true, message: 'المنصة اتأخرت في الرد.' }), 45000); };
    S.root.querySelector('#apGo').onclick = go; inp.onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
    S.root.querySelector('#apRefresh').onclick = () => { S.root.querySelector('#apMsg').textContent = 'بنجيب صورة تانية…'; ctl('refresh'); };
    wire();
  }
  function wire() {
    const q = (id) => S && S.root && S.root.querySelector(id);
    const o = q('#apOpen'); if (o) o.onclick = () => ctl('open');
    const r = q('#apRetry'); if (r) r.onclick = () => step();
    const s = q('#apSkip'); if (s) s.onclick = () => { ctl('cancel'); const c = S.cur || {}; record(S.ids[S.i], c.name || '#' + S.ids[S.i], 'skip', 'اتخطّى'); nextPerson(); };
    const x = q('#apStop'); if (x) x.onclick = () => { ctl('cancel'); summary(true); };
  }

  async function onResult(d) {
    if (!S) return; clearTimeout(S.timer); const { e } = NA; const c = S.cur || {}; const id = S.ids[S.i];
    if (d.notFound) {
      const others = Object.keys(NAMES).filter((k) => k !== String(c.embassy));
      draw(head() + `<div class="card issues"><b>المنصة مالقتش طلب لـ ${e(c.name || '')} بالبيانات دي</b><div class="small" style="margin-top:4px">جواز ${e(c.passportNo)} · جهة القدوم: ${e(NAMES[c.embassy] || c.embassy || '—')}${d.message ? ' — ' + e(d.message) : ''}</div></div>
        <div class="row" style="margin-top:10px">${others.map((k) => `<button class="btn pri apAlt" data-e="${k}">جرّب ${e(NAMES[k])}</button>`).join('')}<button class="btn" id="apSkip">كمّل للي بعده</button><button class="btn danger" id="apStop">إلغاء</button></div>`);
      S.root.querySelectorAll('.apAlt').forEach((b) => { b.onclick = () => { S.override = { embassy: b.dataset.e }; step(); }; });
      record(id, c.name, 'none', 'مفيش طلب' + (NAMES[c.embassy] ? ' في ' + NAMES[c.embassy] : ''));
      S.results[S.results.length - 1].pending = true;
      const sk = S.root.querySelector('#apSkip'); if (sk) sk.onclick = () => { nextPerson(); };
      const st = S.root.querySelector('#apStop'); if (st) st.onclick = () => summary(true);
      return;
    }
    /* الرقم لازم يكون لنفس الجواز، وإلا مش بنسجّله */
    if (d.passportNo && norm(d.passportNo) !== norm(c.passportNo)) { record(id, c.name, 'err', `النتيجة لجواز تاني (${d.passportNo}) — مش اتسجّل`); return nextPerson(); }
    try {
      await NA.api('POST', `/people/${id}/result`, { status: 'submitted', appNumber: d.appNumber });
      record(id, c.name, 'ok', d.issuedVisaNo ? 'صدرت التأشيرة برقم ' + d.issuedVisaNo : '', d.appNumber);
      try { if (S.opts.onSaved) S.opts.onSaved(id, d); } catch (x) { /* مش مهم */ }
    } catch (er) { record(id, c.name, 'err', er.message); }
    nextPerson();
  }

  function summary(stopped) {
    if (!S) return; clearTimeout(S.timer); const { e } = NA;
    /* اللي لقيناه «مفيش طلب» وكمّلنا بعده بيتحسب «مفيش طلب»؛ واللي اتحاول تاني بيتشال القديم */
    const res = S.results.filter((r, i, a) => !(r.pending && a.slice(i + 1).some((x) => x.id === r.id)));
    const ok = res.filter((r) => r.status === 'ok').length; const lab = { ok: 'اتسجّل', none: 'مفيش طلب', skip: 'اتخطّى', err: 'مشكلة' }; const cls = { ok: 'ok', none: 'warn', skip: '', err: 'bad' };
    draw(`<h2>${stopped ? 'اتوقّف' : 'خلص'} — اتسجّل ${ok} من ${S.ids.length}</h2>
      <div class="card" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>الشخص</th><th>النتيجة</th><th>رقم الطلب</th><th></th></tr></thead><tbody>${res.map((r) => `<tr><td>${e(r.name)}</td><td><span class="chip ${cls[r.status]}">${lab[r.status]}</span></td><td dir="ltr" style="text-align:right"><b>${e(r.app)}</b></td><td class="small muted">${e(r.msg)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">مفيش حاجة اتعملت.</td></tr>'}</tbody></table></div></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="apClose">تمام</button></div>`);
    const cl = S.root.querySelector('#apClose'); const fin = () => { const s = S; S = null; try { s.close(); } catch (x) { /* مش مهم */ } try { if (s.opts.onDone) s.opts.onDone(ok); } catch (x) { /* مش مهم */ } };
    if (cl) cl.onclick = fin;
  }

  async function start(ids, opts) {
    ids = (ids || []).map(String); if (!ids.length) return;
    if (S && S.root && S.root.isConnected) return NA.toast('فيه بحث شغّال دلوقتي: خلّصه أو اعمل إلغاء الأول.', 'err');
    S = null;
    if (!NA.extReady) { NA.ping(); await new Promise((r) => setTimeout(r, 700)); }
    if (!NA.extReady) return NA.toast('إضافة Chrome مش متركّبة. من «إضافة Chrome» نزّلها وركّبها الأول.', 'err');
    S = { ids, i: 0, results: [], opts: opts || {}, cur: null, override: null, timer: null, root: null, close: null };
    NA.modal('<div id="apBody"></div>', (m, close) => { S.root = m; S.close = () => { close(); S = null; }; }, { sticky: true });
    step();
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data; if (!m || m.source !== 'nesr-visaapply-ext') return;
    if (m.type === 'VA_APPNO_CAPTCHA' && m.data) onCaptcha(m.data);
    if (m.type === 'VA_APPNO_RESULT' && m.data) onResult(m.data);
  });
  NA.appno = { start, onCaptcha, onResult };
})();
