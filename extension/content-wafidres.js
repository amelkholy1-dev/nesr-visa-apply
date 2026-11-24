'use strict';
/* «نتيجة الكشف الطبي (وافد)»: بيشتغل على wafid.com/…/medical-status-search/ لما الزرار يتداس من النظام.
   1) صفحة البحث: بيختار «By Passport Number» ويكتب رقم الجواز ويختار الجنسية. التحقق (reCAPTCHA) بتعمله صفحة وافد نفسها:
      بنستنى لحد ما الصفحة تجهّز التوكن بتاعها وبعدين ندوس «Check». لو وافد طلب تحقق ظاهر، بتعمله إنت وتدوس «Check» بنفسك.
   2) صفحة النتيجة: بيتأكد إن الجواز هو نفسه، وينزّل الـ PDF ويفتح نافذة طباعته، ويبعت النتيجة (Fit/Unfit + تاريخ الفحص) للنظام. */
(function () {
  if (!/\/medical-status-search\/?/i.test(location.pathname)) return;
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => document.getElementById(id);
  const waitFor = async (fn, ms = 10000, step = 200) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const shown = (x) => !!(x.offsetParent || x.getClientRects().length) && getComputedStyle(x).visibility !== 'hidden';
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const NAT = { EGY: '55', IND: '1', BGD: '15', PAK: '135', SDN: '157', SYR: '160', JOR: '90', YEM: '172', PHL: '177', NPL: '125', LKA: '156' };
  const NAT_TXT = { EGY: 'egyptian' };
  const BTN = 'background:#fff;color:#0f6b3c;border:0;border-radius:8px;padding:5px 10px;font:700 12px Tahoma;cursor:pointer;margin-inline-start:6px';
  function bar(html, kind) {
    let b = byId('nesr-wres-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-wres-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;max-width:min(94vw,640px);padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.27);background:' + (kind === 'bad' ? '#b4232f' : kind === 'ok' ? '#0f7b43' : '#1d4486');
    b.innerHTML = html; return b;
  }
  const clean = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const val = (id) => { const el = byId(id); return el ? String(el.value || el.textContent || '').trim() : ''; };
  const pdfLink = () => [...document.querySelectorAll('a[href*="/medical-status/"]')].find((a) => /\/download\/?$/.test(a.getAttribute('href') || ''));
  const isResult = () => !!pdfLink() && !!byId('passport');
  const platformMsg = () => [...document.querySelectorAll('.ui.message.error, .ui.negative.message, .errorlist, .ui.error.message, .field.error .prompt, #message-content')].filter(shown).map((x) => String(x.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)[0] || '';

  /* ===== صفحة النتيجة ===== */
  async function onResult(ctx) {
    const pass = clean(val('passport')); const want = clean(ctx.passportNo);
    if (want && pass && pass !== want) { bar('⚠️ النتيجة اللي ظهرت لجواز <b dir="ltr">' + esc(pass) + '</b> مش <b dir="ltr">' + esc(want) + '</b>. مش هنزّلها.', 'bad'); return; }
    const statusTxt = String((document.querySelector('.medical-status-modal-acceptance .left.floated, .gcc-modal .left.floated') || {}).textContent || '').replace(/\s+/g, ' ').trim();
    const fit = /\bfit\b/i.test(statusTxt) && !/unfit/i.test(statusTxt); const unfit = /unfit/i.test(statusTxt);
    const dm = /(\d{2})\/(\d{2})\/(\d{4})/.exec(val('medical_examination_date')); const examDate = dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : '';
    const info = { personId: ctx.personId, passportNo: pass || want, status: fit ? 'fit' : unfit ? 'unfit' : '', statusText: statusTxt.slice(0, 40), examDate, center: val('medical_center').slice(0, 80) };
    const name = 'wafid-' + (pass || want || 'result') + '.pdf';
    const first = ctx.stage !== 'done';
    let blobUrl = '';
    const b = bar((fit ? '✅' : unfit ? '⛔' : 'ℹ️') + ' نتيجة الكشف الطبي: <b>' + esc(statusTxt || '—') + '</b>' + (examDate ? ' — فحص ' + esc(examDate) : '') + '. <span id="nesr-wres-st">بنزّل الـ PDF…</span> <button id="nesr-wres-print" style="' + BTN + '">اطبع</button><button id="nesr-wres-dl" style="' + BTN + '">نزّل PDF</button>', unfit ? 'bad' : 'ok');
    const st = (t) => { const x = b.querySelector('#nesr-wres-st'); if (x) x.textContent = t; };
    const getBlob = async () => {
      if (blobUrl) return blobUrl;
      const r = await fetch(pdfLink().href, { credentials: 'same-origin' }); if (!r.ok) throw new Error('وافد ردّ ' + r.status);
      const blob = await r.blob(); blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); return blobUrl;
    };
    const download = async () => { const u = await getBlob(); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
    const print = async () => {
      const u = await getBlob(); let fr = byId('nesr-wres-frame'); if (fr) fr.remove();
      fr = document.createElement('iframe'); fr.id = 'nesr-wres-frame'; fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0'; document.body.appendChild(fr);
      await new Promise((res) => { fr.onload = res; fr.src = u; setTimeout(res, 6000); });
      await sleep(600);
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(u, '_blank'); st('الـ PDF اتفتح في تبويب: دوس Ctrl+P'); }
    };
    b.querySelector('#nesr-wres-print').onclick = () => print().catch((e) => st('مقدرتش أطبع: ' + e.message));
    b.querySelector('#nesr-wres-dl').onclick = () => download().catch((e) => st('مقدرتش أنزّل: ' + e.message));
    document.documentElement.dataset.vaWafidResult = info.status || 'unknown';
    if (!first) { st('اتنزّلت قبل كده.'); return; }
    await send({ kind: 'wafidres-stage', stage: 'done' });
    const r = await send({ kind: 'wafidres-result', data: info });
    try { await download(); st((r && r.ok ? 'اتبعتت للنظام. ' : '') + 'الـ PDF نزل، ونافذة الطباعة بتفتح…'); } catch (e) { st('مقدرتش أنزّل الـ PDF: ' + e.message); return; }
    document.documentElement.dataset.vaWafidPdf = '1';
    if (ctx.print !== false) await print().catch((e) => st('مقدرتش أطبع: ' + e.message));
  }

  /* ===== صفحة البحث ===== */
  async function onSearch(ctx) {
    const pass = byId('id_passport'), nat = byId('id_nationality'), go = byId('med-status-form-submit');
    if (ctx.stage === 'submitted') {
      const m = platformMsg();
      bar('⚠️ وافد ما طلّعش نتيجة لجواز <b dir="ltr">' + esc(ctx.passportNo) + '</b>' + (m ? ': «' + esc(m.slice(0, 160)) + '»' : ' (ممكن لسه مفيش نتيجة، أو التحقق ما نجحش)') + '. راجع الجواز والجنسية ودوس «Check» بنفسك.', 'bad');
      await send({ kind: 'wafidres-stage', stage: 'manual' });
      return;
    }
    const v0 = byId('id_search_variant_0'); if (v0 && !v0.checked) { v0.click(); await sleep(300); }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(pass, clean(ctx.passportNo)); fire(pass);
    const code = String(ctx.nationality || 'EGY').toUpperCase();
    const opt = [...nat.options].find((o) => o.value === NAT[code]) || [...nat.options].find((o) => String(o.textContent).trim().toLowerCase() === (NAT_TXT[code] || '')) ;
    if (opt) { nat.value = opt.value; fire(nat); try { const $ = window.jQuery; if ($) $(nat).trigger('change'); } catch (e) { /* مش مهم */ } }
    if (!ctx.passportNo || !opt) { bar('✋ ' + (!ctx.passportNo ? 'رقم الجواز فاضي في النظام. ' : '') + (!opt ? 'اختار الجنسية بإيدك. ' : '') + 'وبعدين دوس «Check».', 'bad'); return; }
    if (ctx.stage === 'manual') { bar('✋ اتكتب الجواز والجنسية. دوس «Check» بنفسك.'); return; }
    bar('🔎 بدوّر على نتيجة الكشف لجواز <b dir="ltr">' + esc(clean(ctx.passportNo)) + '</b>… (بستنى تحقق وافد يخلص)');
    /* التحقق بتاع وافد بيشتغل في الصفحة لوحده وبيحط التوكن في الخانة دي. مش بنلمسه: بنستنى بس */
    const tok = await waitFor(() => { const c = document.querySelector('input.g-recaptcha, #id_captcha'); return !c || String(c.value || '').length > 0; }, 20000, 300);
    if (!tok) { bar('✋ وافد لسه بيعمل التحقق. لو ظهرلك مربع «I\'m not a robot» علّم عليه، وبعدين دوس «Check».'); return; }
    await send({ kind: 'wafidres-stage', stage: 'submitted' });
    await sleep(300); go.click();
  }

  (async function run() {
    let ctx = null; for (let k = 0; k < 8 && !ctx; k++) { ({ ctx } = await send({ kind: 'get-wafidres-ctx' })); if (!ctx) await sleep(400); }
    if (!ctx) return;
    const kind = await waitFor(() => (isResult() ? 'result' : byId('id_passport') && byId('id_nationality') && byId('med-status-form-submit') ? 'search' : ''), 10000);
    if (kind === 'result') return onResult(ctx);
    if (kind === 'search') return onSearch(ctx);
    if (/\/login|select-type/i.test(location.pathname)) return void bar('🔐 وافد طلب تسجيل دخول. ادخل وبعدين دوس الزرار من النظام تاني.');
    bar('⚠️ صفحة وافد مش زي المتوقع. افتح «Medical Examination Result» بنفسك.', 'bad');
  })();
})();
