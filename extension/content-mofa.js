'use strict';
/* بيشتغل على فورم «طلب تأشيرة» في منصة التأشيرات (SmartForm/TraditionalApp):
   بيملا البيانات من نظام طلبات التأشيرات (الأسماء، الجواز، التواريخ، المهنة، جهة العمل، الصورة الشخصية…) بالترتيب اللي المنصة بتحمّل بيه القوايم.
   اللي مبيتعملش تلقائي (وبيتعلّم ليك): رمز الصورة (الكابتشا) · الإقرارات · زرار «حفظ». بعد الحفظ بيحاول يقرا رقم الطلب ويرجّعه للنظام. */
(function () {
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = (name) => document.querySelector('[name="' + name + '"]');
  const norm = (s) => String(s == null ? '' : s).replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
  const waitFor = async (fn, ms = 9000, step = 150) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

  const realOptions = (sel) => [...sel.options].filter((o) => (String(o.value) !== '' || norm(o.textContent) !== '') && norm(o.textContent) !== 'اختر' && !/^<.*>$/.test(o.textContent.trim()));
  const compact = (s) => norm(s).replace(/ /g, '');
  const findOne = (sel, want) => {
    const opts = realOptions(sel); const w = String(want == null ? '' : want).trim(); const nw = norm(w); const cw = compact(w);
    if (!w) return null;
    return opts.find((o) => String(o.value) === w) || opts.find((o) => norm(o.textContent) === nw) || opts.find((o) => compact(o.textContent) === cw)
      || (cw.length >= 3 ? opts.find((o) => compact(o.textContent).includes(cw) || cw.includes(compact(o.textContent))) : null) || null;
  };
  const findOption = (sel, want) => { for (const w of (Array.isArray(want) ? want : [want])) { const o = findOne(sel, w); if (o) return o; } return null; };
  /* بنستنى لحد ما محتوى القايمة يبطّل يتغيّر (المنصة بتعيد تحميل القوائم المترتبة بعد أي اختيار) */
  const settled = (el, quiet = 450, max = 5000) => new Promise((res) => {
    let t = null; let fin = false; const t0 = Date.now(); let mo = null;
    const done = () => { if (fin) return; fin = true; try { mo && mo.disconnect(); } catch (e) { /* مش مهم */ } clearTimeout(t); res(); };
    t = setTimeout(done, quiet);
    try { mo = new MutationObserver(() => { clearTimeout(t); if (Date.now() - t0 > max) return done(); t = setTimeout(done, quiet); }); mo.observe(el, { childList: true, subtree: true, attributes: true }); } catch (e) { /* مش مهم */ }
    setTimeout(done, max + quiet);
  });
  const sample = (sel) => realOptions(sel).slice(0, 6).map((o) => o.textContent.trim()).join('، ');
  const chosen = {};

  const report = { ok: [], manual: [], failed: [] };
  const note = (label, status, detail) => { (status === 'ok' ? report.ok : status === 'manual' ? report.manual : report.failed).push(detail ? label + ' (' + detail + ')' : label); };
  const mark = (el) => { try { if (el) { el.style.outline = '3px solid #f2a31b'; el.style.outlineOffset = '2px'; } } catch (e) { /* مش مهم */ } };

  function setInput(name, value, label) {
    const el = q(name);
    if (!el) return note(label, 'failed', 'الخانة مش موجودة'), false;
    if (value == null || String(value).trim() === '') return note(label, 'manual', 'فاضي في النظام'), mark(el), false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
    fire(el); note(label, 'ok'); return true;
  }
  async function setSelect(name, want, label, opts = {}) {
    const el = q(name);
    if (!el) return note(label, 'failed', 'القايمة مش موجودة'), false;
    const hasWant = (Array.isArray(want) ? want : [want]).some((w) => String(w == null ? '' : w).trim());
    const loaded = await waitFor(() => realOptions(el).length >= (opts.min || 1), opts.timeout || 9000);
    if (!loaded) return note(label, 'failed', 'القايمة ما اتحمّلتش'), mark(el), false;
    await settled(el, opts.quiet || 450);
    let o = findOption(el, want);
    if (!o && opts.firstIfEmpty && !hasWant) o = realOptions(el)[0];
    if (!o) return note(label, hasWant ? 'failed' : 'manual', hasWant ? 'مش لاقي «' + [].concat(want).filter(Boolean)[0] + '» في القايمة — المتاح: ' + (sample(el) || 'مفيش') : 'فاضي في النظام'), mark(el), false;
    /* المنصة ساعات بتصفّر القايمة بعد الاختيار (تحميل متأخّر): نتأكد ونعيد لحد 3 مرات */
    for (let i = 0; i < 3; i++) {
      el.value = o.value; fire(el);
      await sleep(650);
      if (String(el.value) === String(o.value)) break;
      await waitFor(() => realOptions(el).length >= 1, 6000); await settled(el, 450);
      o = findOption(el, want) || o;
    }
    if (String(el.value) !== String(o.value)) return note(label, 'failed', 'المنصة رجّعت القيمة فاضية — اختارها بإيدك'), mark(el), false;
    chosen[name] = String(o.value);
    note(label, 'ok', opts.firstIfEmpty && !hasWant ? 'أول اختيار: ' + o.textContent.trim() : ''); return true;
  }
  function setRadio(name, value, label) {
    const el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (!el) return note(label, 'failed', 'الاختيار مش موجود'), false;
    el.click(); note(label, 'ok'); return true;
  }

  async function uploadPhoto(dataUrl) {
    const input = document.getElementById('PersonalImage') || q('files[]');
    if (!input) return note('الصورة الشخصية', 'failed', 'خانة الرفع مش موجودة'), false;
    if (!dataUrl) return note('الصورة الشخصية', 'manual', 'مش مرفوعة في النظام'), mark(input), false;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'photo.' + (blob.type === 'image/png' ? 'png' : 'jpg'), { type: blob.type || 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const img = document.getElementById('image'); const before = img ? img.getAttribute('src') : '';
      const err = document.getElementById('divErrorMsg');
      const res = await waitFor(() => (err && err.style.display === 'block' ? 'err' : (img && img.getAttribute('src') && img.getAttribute('src') !== before ? 'ok' : null)), 20000, 300);
      if (res === 'ok') return note('الصورة الشخصية', 'ok'), true;
      if (res === 'err') return note('الصورة الشخصية', 'failed', 'المنصة رفضت مواصفات الصورة'), mark(input), false;
      return note('الصورة الشخصية', 'manual', 'اترفعت؟ اتأكد إنها ظهرت في الفورم'), mark(input), false;
    } catch (e) { return note('الصورة الشخصية', 'failed', 'تعذر الرفع'), mark(input), false; }
  }

  /* المهنة: القايمة بتتحمّل حسب «التصنيف المهني». لو المهنة مش في التصنيف المختار بندوّر عليها في كل التصنيفات (نفس رابط المنصة) ونغيّر التصنيف */
  async function findClassificationFor(text) {
    const sel = q('Classify_Occupations_Id'); if (!sel) return null;
    const ids = realOptions(sel).map((o) => o.value).filter(Boolean); const nt = compact(text); const hits = []; let i = 0;
    const worker = async () => {
      while (i < ids.length) {
        const id = ids[i++];
        try {
          const r = await fetch('/Base/GetOccupationsByClassificationId?jobClassificationId=' + encodeURIComponent(id), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          if (!r.ok) continue; const list = await r.json();
          for (const it of (list || [])) { const t = compact(it.Text); if (t === nt) hits.push({ cls: id, exact: 1, len: t.length, text: it.Text }); else if (nt.length >= 3 && t.includes(nt)) hits.push({ cls: id, exact: 0, len: t.length, text: it.Text }); }
        } catch (e) { /* نكمّل */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    hits.sort((a, b) => (b.exact - a.exact) || (a.len - b.len) || (Number(a.cls) - Number(b.cls)));
    return hits[0] || null;
  }
  async function fillJob(m) {
    const cls = q('Classify_Occupations_Id'); const job = q('JOB_OR_RELATION_Id'); const text = String(m.jobText || '').trim();
    const oc = document.getElementById('OccupationName');
    if (oc && oc.offsetParent !== null && text) setInput('OccupationName', text, 'المهنة (نص)');
    if (!job || !cls) return note('المهنة', 'failed', 'خانة المهنة مش موجودة');
    if (!text) { note('المهنة', 'manual', 'فاضي في النظام'); mark(job); }
    const pick = async () => { await sleep(600); const got = await waitFor(() => realOptions(job).length >= 1, 12000); if (!got) return null; await settled(job, 500); return findOption(job, text); };
    const clsOk = m.Classify_Occupations_Id ? await setSelect('Classify_Occupations_Id', m.Classify_Occupations_Id, 'التصنيف المهني') : false;
    let o = (clsOk && text) ? await pick() : null;
    if (!o && text) {
      const f = await findClassificationFor(text);
      if (f && String(cls.value) !== String(f.cls)) {
        cls.value = f.cls; fire(cls); chosen.Classify_Occupations_Id = String(f.cls);
        o = await pick();
        if (o) { const ct = (realOptions(cls).find((x) => String(x.value) === String(f.cls)) || {}).textContent || f.cls; note('التصنيف المهني', 'ok', 'اتغيّر لـ «' + String(ct).trim() + '» لأن «' + f.text + '» تابعة له — عدّله في ملف الضبط'); }
      } else if (f) o = await pick();
    }
    if (o) { job.value = o.value; fire(job); chosen.JOB_OR_RELATION_Id = String(o.value); note('المهنة', 'ok', o.textContent.trim()); }
    else if (text) { note('المهنة', 'failed', 'مش لاقي «' + text + '» — اكتب اسمها زي ما بتظهر في المنصة (جرّب كلمة تانية) أو اختارها بإيدك'); mark(job); }
  }
  /* بعد التعبئة: نتأكد إن المنصة ما صفّرتش قيمة اتحطت (القوائم المترتبة بتتعاد تحميلها) */
  async function finalCheck() {
    for (const name of ['NUMBER_OF_ENTRIES', 'Number_Entry_Day', 'RESIDENCY_IN_KSA', 'Classify_Occupations_Id', 'JOB_OR_RELATION_Id', 'COMING_THROUGH', 'ENTRY_POINT']) {
      const el = q(name); const want = chosen[name]; if (!el || !want) continue;
      if (String(el.value) === want) continue;
      const opt = [...el.options].find((o) => String(o.value) === want);
      if (opt) { el.value = want; fire(el); await sleep(600); }
      if (String(el.value) !== want) { report.failed.push((name === 'RESIDENCY_IN_KSA' ? 'مدة الإقامة' : name === 'Number_Entry_Day' ? 'صلاحية التأشيرة' : name === 'JOB_OR_RELATION_Id' ? 'المهنة' : name === 'ENTRY_POINT' ? 'جهة الوصول' : name) + ' اتصفّرت بعد التعبئة — اختارها بإيدك'); mark(el); }
    }
  }
  /* الإقرارات: بتتعلّم بس لو صاحب النظام فعّل ده في ملف الضبط (بطلبه). الكابتشا و«حفظ» دايماً بإيدك */
  function declarations(m) {
    if (m.AUTO_DECLARE !== '1') return false;
    for (const [n, label] of [['Endorsement', 'إقرار صحة المعلومات'], ['IsPrivacyPolicyAgreed', 'سياسة الخصوصية']]) {
      const c = document.querySelector('input[type="checkbox"][name="' + n + '"]');
      if (!c) { note(label, 'failed', 'مش موجود'); continue; }
      if (!c.checked) c.click();
      if (c.checked) note(label, 'ok', 'اتعلّم بطلبك'); else { note(label, 'failed', 'ما اتعلّمش'); mark(c.closest('label,div') || c); }
    }
    return true;
  }

  async function fillAll(ctx, setStatus) {
    const m = ctx.mofa || {};
    setStatus('نوع التأشيرة والجنسية…');
    await setSelect('VisaKind', m.VisaKind, 'نوع التأشيرة');
    await sleep(400);
    await setSelect('NATIONALITY', m.NATIONALITY || 'EGY', 'الجنسية');
    await sleep(500);
    await setSelect('EmbassyCode', m.EmbassyCode, 'الممثلية');
    setStatus('عدد مرات الدخول والصلاحية…');
    await sleep(500);
    await setSelect('NUMBER_OF_ENTRIES', m.NUMBER_OF_ENTRIES, 'عدد مرات الدخول', { firstIfEmpty: true });
    await sleep(500);
    await setSelect('Number_Entry_Day', m.Number_Entry_Day, 'صلاحية التأشيرة', { firstIfEmpty: true });
    await sleep(500);
    await setSelect('RESIDENCY_IN_KSA', m.RESIDENCY_IN_KSA, 'مدة الإقامة', { firstIfEmpty: true });

    setStatus('الأسماء…');
    setInput('AFIRSTNAME', m.AFIRSTNAME, 'الاسم الأول (عربي)'); setInput('AFATHER', m.AFATHER, 'الأب (عربي)'); setInput('AGRAND', m.AGRAND, 'الجد (عربي)'); setInput('AFAMILY', m.AFAMILY, 'العائلة (عربي)');
    setInput('EFIRSTNAME', m.EFIRSTNAME, 'First Name'); setInput('EFATHER', m.EFATHER, 'Father'); setInput('EGRAND', m.EGRAND, 'Grand Father'); setInput('EFAMILY', m.EFAMILY, 'Family Name');
    setStatus('الصورة الشخصية…');
    await uploadPhoto(ctx.photo);
    setRadio('Has_NATIONALITY_FIRST', '0', 'جنسية سابقة: لأ');

    setStatus('بيانات الجواز…');
    setInput('PASSPORTnumber', m.PASSPORTnumber, 'رقم الجواز');
    await setSelect('PASSPORType', m.PASSPORType, 'نوع الجواز');
    await setSelect('PASSPORT_ISSUE_PLACE', m.PASSPORT_ISSUE_PLACE, 'دولة الإصدار');
    setInput('PASSPORT_ISSUE_DATE', m.PASSPORT_ISSUE_DATE, 'تاريخ الإصدار'); setInput('PASSPORT_EXPIRY_DATe', m.PASSPORT_EXPIRY_DATe, 'تاريخ الانتهاء');
    setInput('BIRTH_PLACE', m.BIRTH_PLACE, 'مكان الميلاد'); setInput('BIRTH_DATE', m.BIRTH_DATE, 'تاريخ الميلاد'); setInput('PersonId', m.PersonId, 'الرقم القومي');
    await setSelect('RELIGION', m.RELIGION, 'الديانة'); await setSelect('SOCIAL_STATUS', m.SOCIAL_STATUS, 'الحالة الاجتماعية'); await setSelect('Sex', m.Sex, 'الجنس');

    setStatus('المهنة…');
    await fillJob(m);
    setInput('DEGREE', m.DEGREE, 'المؤهل'); setInput('DEGREE_SOURCE', m.DEGREE_SOURCE, 'مصدر المؤهل');
    setInput('ADDRESS_HOME', m.ADDRESS_HOME, 'عنوان السكن'); setInput('Personal_Email', m.Personal_Email, 'البريد الإلكتروني');

    setStatus('جهة العمل والوصول…');
    setInput('SPONSER_NAME', m.SPONSER_NAME, 'اسم جهة العمل'); setInput('SPONSER_NUMBER', m.SPONSER_NUMBER, 'رقم الجهة');
    setInput('SPONSER_ADDRESS', m.SPONSER_ADDRESS, 'عنوان الجهة'); setInput('SPONSER_PHONE', m.SPONSER_PHONE, 'هاتف الجهة');
    /* وسيلة الوصول بتحدد قايمة المنافذ (المنصة بتعيد تحميلها): لو المنفذ مطار نختار «جوا»، جسر/منفذ بري «برا»، ميناء «بحرا» */
    const epText = String(m.entryPointText || '').trim();
    let ct = m.COMING_THROUGH; let derived = false;
    if (epText) { const d = /^\s*مطار/.test(epText) ? '2' : /ميناء/.test(epText) ? '3' : /(جسر|منفذ)/.test(epText) ? '1' : ''; if (d && d !== String(ct || '')) { ct = d; derived = true; } }
    const ctEl = q('COMING_THROUGH'); const portsBefore = q('ENTRY_POINT') ? [...q('ENTRY_POINT').options].map((o) => o.value).join(',') : '';
    if (ct) { await setSelect('COMING_THROUGH', ct, 'وسيلة الوصول', {}); } else note('وسيلة الوصول', 'manual', 'فاضي في النظام');
    if (ctEl && ct) await waitFor(() => { const e2 = q('ENTRY_POINT'); return e2 && [...e2.options].map((o) => o.value).join(',') !== portsBefore; }, 4000, 200);
    await sleep(500);
    await setSelect('ENTRY_POINT', [epText, m.ENTRY_POINT], 'منفذ الدخول (جهة الوصول)', { timeout: 12000, quiet: 600 });
    setInput('ExpectedEntryDate', m.ExpectedEntryDate, 'تاريخ الدخول المتوقع');
    if (m.porpose) setInput('porpose', m.porpose, 'الغرض');
    if (m.car_number) setInput('car_number', m.car_number, 'رقم الرحلة');
    setRadio('HaveTraveledToOtherCountries', 'false', 'سفر لدول تانية: لأ');
    setStatus('مراجعة أخيرة…');
    await sleep(500); await finalCheck();
    ctx.declared = declarations(m);
  }

  /* شريط الحالة تحت الصفحة */
  function bar(html, kind) {
    let b = document.getElementById('nesr-va-bar');
    if (!b) { b = document.createElement('div'); b.id = 'nesr-va-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;width:min(94vw,680px);max-height:60vh;overflow:auto;padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;box-shadow:0 4px 18px #0005;color:#fff;line-height:1.7;background:' + (kind === 'err' ? '#b3261e' : kind === 'ok' ? '#0f7b43' : kind === 'warn' ? '#a16207' : '#1d4486');
    b.innerHTML = html; return b;
  }
  const list = (arr) => (arr.length ? '<ul style="margin:4px 18px;padding:0">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');

  /* الطابور: بيظهر لو أنت اخترت أكتر من شخص. «الشخص التالي» بيفتح فورم جديد ويملاه */
  const queueHtml = (ctx) => {
    const q = Array.isArray(ctx.queue) ? ctx.queue : []; if (!q.length) return '';
    const total = ctx.queueTotal || (q.length + 1); const idx = total - q.length;
    return '<div style="margin-top:6px;padding:6px 8px;background:#ffffff22;border-radius:8px">📋 الشخص ' + idx + ' من ' + total + ' — التالي: <b>' + esc(q[0].name) + '</b> (باقي ' + q.length + ') <button id="nesr-va-next" style="background:#fff;color:#1d4486;border:0;border-radius:8px;padding:5px 10px;font:700 12px Tahoma;cursor:pointer;margin-inline-start:6px">الشخص التالي</button></div>';
  };
  const wireNext = (b) => {
    const n = b && b.querySelector('#nesr-va-next'); if (!n) return;
    n.addEventListener('click', async () => { n.disabled = true; n.textContent = 'بيجهّز…'; const r = await send({ kind: 'next' }); if (!r || !r.ok) { n.disabled = false; n.textContent = 'الشخص التالي'; alert((r && r.error) || 'مش قادر أفتح الشخص التالي'); } });
  };

  async function onForm(ctx) {
    const flagKey = 'va_filled_' + ctx.personId + '_' + ctx.at;
    const run = async () => {
      report.ok = []; report.manual = []; report.failed = [];
      const status = (t) => bar('<span>🦅 ' + esc(ctx.name || '') + ' — ' + esc(t) + '</span>', 'info');
      status('بيملا الفورم…');
      try { await fillAll(ctx, status); } catch (e) { report.failed.push('حصل خطأ غير متوقع: ' + String(e && e.message || e)); }
      try { sessionStorage.setItem(flagKey, '1'); } catch (e) { /* مش مهم */ }
      const cap = q('Captcha'); if (cap) mark(cap);
      for (const n of ['Endorsement', 'IsPrivacyPolicyAgreed', 'UmraTermsAndConditions']) { const c = document.querySelector('input[type="checkbox"][name="' + n + '"]'); if (c && !c.checked) { const p = c.closest('label,div') || c; mark(p); } }
      const bad = report.failed.length || ctx.issues.length;
      const b = bar('<div><b>' + (bad ? '⚠️' : '✅') + ' اتملى ' + report.ok.length + ' خانة' + (report.failed.length ? ' · ' + report.failed.length + ' محتاجة راجعة' : '') + '</b> — دلوقتي:</div>' +
        '<ol style="margin:4px 18px;padding:0"><li>راجع الخانات اللي حواليها إطار برتقالي</li><li>' + (ctx.declared ? 'الإقرارات اتعلّمت. اكتب الكابتشا' : 'علّم على الإقرارات واكتب الكابتشا') + '</li><li>دوس «حفظ»</li></ol>' +
        (ctx.issues.length ? '<div>⛔ في النظام:</div>' + list(ctx.issues) : '') + (report.failed.length ? '<div>❌ مش اتملى:</div>' + list(report.failed) : '') +
        (report.manual.length ? '<div>✋ فاضي في النظام (اكتبه بإيدك):</div>' + list(report.manual) : '') + (ctx.warns.length ? '<div>ℹ️</div>' + list(ctx.warns) : '') +
        queueHtml(ctx) + '<div style="margin-top:6px"><button id="nesr-va-again" style="background:#fff;color:#1d4486;border:0;border-radius:8px;padding:6px 12px;font:700 12px Tahoma;cursor:pointer">املى تاني</button> <button id="nesr-va-hide" style="background:#ffffff33;color:#fff;border:1px solid #fff6;border-radius:8px;padding:6px 12px;font:700 12px Tahoma;cursor:pointer">إخفاء</button></div>', bad ? 'warn' : 'ok');
      wireNext(b);
      const again = b.querySelector('#nesr-va-again'); if (again) again.addEventListener('click', () => { try { sessionStorage.removeItem(flagKey); } catch (e) { /* مش مهم */ } run(); });
      const hide = b.querySelector('#nesr-va-hide'); if (hide) hide.addEventListener('click', () => b.remove());
      send({ kind: 'result', data: { status: 'filled', filled: report.ok.length, failed: report.failed.length } });
      if (cap) { try { cap.scrollIntoView({ block: 'center' }); } catch (e) { /* مش مهم */ } }
    };
    let done = false; try { done = sessionStorage.getItem(flagKey) === '1'; } catch (e) { /* مش مهم */ }
    if (done) {
      const b = bar('<div>اتملى الفورم قبل كده في التبويب ده. (لو رجعت من أخطاء المنصة، البيانات المفروض لسه موجودة.)</div><div style="margin-top:6px"><button id="nesr-va-again" style="background:#fff;color:#1d4486;border:0;border-radius:8px;padding:6px 12px;font:700 12px Tahoma;cursor:pointer">املى تاني</button></div>', 'info');
      b.querySelector('#nesr-va-again').addEventListener('click', () => { try { sessionStorage.removeItem(flagKey); } catch (e) { /* مش مهم */ } run(); });
      return;
    }
    await run();
  }

  /* بعد «حفظ»: لو الصفحة مش الفورم، بندوّر على رقم الطلب (حرف + 9 أرقام تقريباً) ونرجّعه للنظام */
  async function onAfterSave(ctx) {
    const text = (document.body && document.body.innerText) || '';
    const near = text.match(/رقم\s*الطلب\s*[:：]?\s*([A-Za-z]\d{6,12})/) || text.match(/\b([A-Z]\d{9})\b/);
    if (near) {
      const app = near[1].toUpperCase();
      const r = await send({ kind: 'result', data: { status: 'submitted', appNumber: app } });
      wireNext(bar('<span>✅ رقم الطلب <b dir="ltr">' + esc(app) + '</b> ' + (r && r.delivered ? 'اتبعت لنظام طلبات التأشيرات.' : 'اتحفظ وهيتبعت أول ما تفتح النظام.') + '</span>' + queueHtml(ctx), 'ok'));
    } else {
      bar('<span>الصفحة دي مش فورم ومفيهاش رقم طلب واضح. لو الطلب اتبعت، انسخ رقم الطلب وسجّله في النظام بإيدك.</span>', 'warn');
    }
  }

  /* صفحات الدخول/الرئيسية: الإضافة بتوجّهك لصفحة دخول الشركات وبعد ما تدخل بتفتح الفورم لوحدها */
  function onLoginFlow(ctx) {
    if (ctx.stage === 'login') bar('<div>🔐 <b>سجّل الدخول بحساب الشركة</b> (الإضافة مش بتكتب ولا بتخزّن كلمة السر).</div><div>أول ما تدخل هفتح فورم «طلب تأشيرة» وأملاه لـ <b>' + esc(ctx.name || '') + '</b>.</div>', 'info');
    else if (ctx.stage === 'retry') bar('<div>✅ دخلت. بفتح الفورم…</div>', 'ok');
    else if (ctx.stage === 'failed') bar('<div>⚠️ المنصة رجّعتك للرئيسية. افتح فورم «طلب تأشيرة» بنفسك من القايمة (أو من <b dir="ltr">visa.mofa.gov.sa/SmartForm/TraditionalApp</b>) وأنا هملاه لـ <b>' + esc(ctx.name || '') + '</b> أول ما يتفتح.</div>', 'warn');
    else if (ctx.stage === 'opening') bar('<div>بفتح الفورم…</div>', 'info');
  }

  (async function run() {
    const { ctx } = await send({ kind: 'get-ctx' });
    if (!ctx || !ctx.mofa) return;
    if (document.getElementById('myform') && q('VisaKind')) return onForm(ctx);
    if (/\/SmartForm\//i.test(location.pathname) && !/TraditionalApp/i.test(location.pathname)) return onAfterSave(ctx);
    if (ctx.stage && ctx.stage !== 'form') return onLoginFlow(ctx);
  })();
})();
