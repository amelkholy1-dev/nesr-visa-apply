'use strict';
/* «هات رقم إنجاز (رقم الطلب) من المنصة»: بيشتغل على صفحة «البحث عن طلب مقدم» (visa.mofa.gov.sa/visaperson/getapplicantdata) ونتيجتها (…/GetPersonVisa).
   1) صفحة البحث: بيكتب رقم الجواز ويختار الجنسية ونوع التأشيرة وجهة القدوم، ويبعت صورة الكابتشا لصفحة النظام. الكابتشا بتكتبها إنت في النظام، و«إجراء البحث» بيتداس بس بعد ما تكتب الكود.
   2) صفحة النتيجة: بيقرا رقم الطلب وتاريخه ورقم المستند ورقم الجواز ويرجّعهم للنظام. مفيش أي قراءة أو حل للكابتشا. */
(function () {
  const byId = (id) => document.getElementById(id);
  const isSearch = () => !!byId('PassportNumber') && !!byId('VisaType') && !!byId('Embassy') && !!byId('Captcha');
  const isResult = () => !!byId('dvToPrint') && !!document.querySelector('.requestcode-number');
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
  const waitFor = async (fn, ms = 12000, step = 200) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => norm(s).slice(0, n);
  const shown = (x) => !!(x.offsetParent || x.getClientRects().length) && getComputedStyle(x).visibility !== 'hidden';

  function bar(html) {
    let b = document.getElementById('nesr-ap-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-ap-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;width:min(94vw,640px);max-height:60vh;overflow:auto;padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;background:#1d4486;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.27)';
    b.innerHTML = html; return b;
  }
  const mark = (el) => { try { if (el) { el.style.outline = '3px solid #f2a31b'; el.style.outlineOffset = '2px'; } } catch (e) { /* مش مهم */ } };
  const captchaImage = async () => {
    const img = document.getElementById('imgCaptcha'); if (!img) return '';
    if (!(await waitFor(() => img.complete && img.naturalWidth > 0, 10000))) return '';
    try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png'); } catch (e) { return ''; }
  };
  const setSelect = async (id, want, label, problems) => {
    const el = byId(id); if (!el) return problems.push(label + ': الخانة مش موجودة');
    const o = want ? [...el.options].find((x) => String(x.value) === String(want)) : null;
    if (!o) { problems.push(label + (want ? ': «' + want + '» مش في قايمة المنصة' : ' فاضي في ملف الضبط')); return mark(el); }
    el.value = o.value; fire(el); await sleep(250); if (String(el.value) !== String(o.value)) { problems.push(label + ': اختارها بإيدك'); mark(el); }
  };
  /* رسالة الخطأ الظاهرة فعلاً في صفحة البحث (الصفحة فيها رسايل مخفية بنص ثابت مش بتتحسب) */
  const shownError = () => [...document.querySelectorAll('.field-validation-error, .validation-summary-errors, .alert-danger, .ui-dialog-content, .modal.in #dlgMessageContent p, .modal.show #dlgMessageContent p')].filter(shown).map((x) => cut(x.textContent, 140)).filter(Boolean)[0] || '';

  async function runSearch(ctx) {
    const problems = [];
    const pn = byId('PassportNumber');
    if (!ctx.passportNo) { problems.push('رقم الجواز فاضي في النظام'); mark(pn); } else Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(pn, ctx.passportNo), fire(pn);
    await setSelect('Nationality', ctx.nationality || 'EGY', 'الجنسية', problems);
    await setSelect('VisaType', ctx.visaType, 'نوع التأشيرة', problems);
    await setSelect('Embassy', ctx.embassy, 'جهة القدوم', problems);
    const failedBefore = ctx.stage === 'submitted'; if (failedBefore) await send({ kind: 'appno-stage', stage: '' });
    const msg = failedBefore ? shownError() : '';
    bar('<div><b>🔎 ' + esc(ctx.name || '') + '</b> — اتكتبت البيانات، والكابتشا بتظهرلك في <b>صفحة النظام</b>: اكتبها هناك ودوس «بحث».</div>' + (problems.length ? '<ul style="margin:4px 18px;padding:0">' + problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''));
    const image = await captchaImage();
    await send({ kind: 'appno-captcha', data: { image, error: failedBefore, problems, message: failedBefore ? (msg || 'الكود غلط أو البيانات مش مقبولة: اكتب الكود الجديد') : '' } });
  }
  /* أوامر من النظام عن طريق الوسيط: الكابتشا اللي كتبتها إنت وإجراء البحث، أو صورة تانية */
  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || !isSearch()) return;
      if (msg.kind === 'ap-submit') {
        (async () => {
          const cap = byId('Captcha'); const form = cap && cap.closest('form'); const btn = form && (form.querySelector('button[type="submit"]') || form.querySelector('[type="submit"]'));
          if (!cap || !btn) { reply({ ok: false }); return; }
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(cap, String(msg.captcha || '')); fire(cap);
          await send({ kind: 'appno-stage', stage: 'submitted' }); btn.click(); reply({ ok: true });
        })(); return true;
      }
      if (msg.kind === 'ap-refresh') {
        (async () => {
          const img = document.getElementById('imgCaptcha'); const old = img ? img.src : ''; const rb = document.getElementById('btnRefreshCaptcha'); if (rb) rb.click();
          await waitFor(() => img && img.src !== old && img.complete && img.naturalWidth > 0, 8000);
          const image = await captchaImage(); await send({ kind: 'appno-captcha', data: { image, error: false, refreshed: true } }); reply({ ok: true });
        })(); return true;
      }
    });
  } catch (e) { /* مش مهم */ }

  /* صفحة النتيجة: رقم الطلب «E» + أرقام. القيمة بتتقرا من نفس الصفحة بس */
  const valueOf = (label) => {
    for (const l of document.querySelectorAll('#dvToPrint label.control-label')) {
      if (norm(l.textContent).replace(/[:：]\s*$/, '') !== label) continue;
      let v = l.nextElementSibling; if (!v || !v.classList.contains('control-display-label')) v = l.parentElement && l.parentElement.nextElementSibling;
      if (v && v.classList.contains('control-display-label')) return norm(v.textContent);
    } return '';
  };
  async function runResult(ctx) {
    bar('<span>🔎 بقرا رقم الطلب من النتيجة…</span>');
    const top = norm((document.querySelector('.requestcode-number') || {}).textContent);
    const m = /رقم\s*الطلب\s*[:：]?\s*([A-Za-z]\d{6,12})/.exec(top);
    const dateTxt = norm((document.querySelector('.requestcode-date') || {}).textContent);
    const issued = /تم\s*إصدار\s*التأشيرة\s*برقم\s*(\d{6,15})/.exec([...document.querySelectorAll('#dlgMessageContent p')].map((x) => x.textContent).join(' '));
    const info = { appNumber: m ? m[1].toUpperCase() : '', appDate: cut((/(\d{4}\/\d{2}\/\d{2})/.exec(dateTxt) || [])[1], 12), docNumber: cut(valueOf('رقم المستند'), 20).replace(/\D/g, ''), issuedVisaNo: issued ? issued[1] : '',
      name: cut(valueOf('الاسم'), 100), nameEn: cut(valueOf('Name'), 100), passportNo: cut(valueOf('رقم الجواز'), 20).toUpperCase(), visaKind: cut(valueOf('نوع التأشيرة'), 80), embassy: cut(valueOf('الممثلية في'), 30), sponsor: cut(valueOf('اسم الشخص/الجهة الطالبة'), 100) };
    if (!info.appNumber) { await send({ kind: 'appno-result', data: { notFound: true, message: 'النتيجة اتفتحت من غير رقم طلب واضح.' } }); bar('<div>⚠️ مفيش رقم طلب واضح في النتيجة.</div>'); return; }
    const r = await send({ kind: 'appno-result', data: info });
    bar('<div><b>' + (r && r.ok ? '✅ رقم الطلب ' : '⚠️ مقدرتش أرجّع الرقم: ') + '<span dir="ltr">' + esc(info.appNumber) + '</span></b></div>' + (r && r.ok ? '' : '<div>' + esc((r && r.error) || 'جرّب تاني') + '</div>'));
  }

  (async function run() {
    /* السياق بيتسجّل بعد ما التبويب يتفتح بلحظة: بنحاول كذا مرة قبل ما نعتبر الصفحة مش بتاعتنا */
    let ctx = null; for (let k = 0; k < 8 && !ctx; k++) { ({ ctx } = await send({ kind: 'get-appno-ctx' })); if (!ctx) await sleep(600); }
    if (!ctx) return;
    const status = (text) => send({ kind: 'appno-status', data: { text: String(text).slice(0, 220) } });
    const snippet = () => cut((document.title || '') + ' — ' + ((document.body && document.body.innerText) || ''), 160);
    const tell = (message, extra) => send({ kind: 'appno-captcha', data: { image: '', error: true, message, ...(extra || {}) } });
    try {
      await status('اتفتحت صفحة المنصة: ' + location.pathname + (ctx.stage === 'submitted' ? ' (بعد البحث)' : ''));
      if (/\/Account\/Login/i.test(location.pathname)) { await tell('المنصة طلبت تسجيل الدخول. دوس «افتح تبويب المنصة»، سجّل دخولك، وبعدين ارجع هنا ودوس «جرّب تاني».'); return; }
      const ok = await waitFor(() => isSearch() || isResult() || (ctx.stage === 'submitted' && /رقم\s*الطلب\s*[:：]?\s*[A-Za-z]?\d{6,12}/.test((document.body && document.body.innerText) || '')), 15000);
      if (!ok) {
        const msg = shownError();
        if (ctx.stage === 'submitted' && (/GetPersonVisa|getapplicantdata/i.test(location.pathname))) { await send({ kind: 'appno-result', data: { notFound: true, message: msg || ('الصفحة رجعت من غير نتيجة: ' + snippet()) } }); return; }
        await status('محتوى الصفحة: ' + snippet());
        await tell('صفحة المنصة مش زي المتوقع (' + location.pathname + '). دوس «افتح تبويب المنصة» وشوف إيه اللي ظاهر.'); return;
      }
      if (isResult()) { await status('ظهرت نتيجة البحث'); return await runResult(ctx); }
      if (!isSearch()) { /* نتيجة بشكل مختلف: بنقرا رقم الطلب من نص الصفحة */
        const t = (document.body && document.body.innerText) || ''; const m = /رقم\s*الطلب\s*[:：]?\s*([A-Za-z]?\d{6,12})/.exec(t); let app = m ? m[1].toUpperCase() : ''; if (/^\d+$/.test(app)) app = 'E' + app;
        const p = /رقم\s*(?:جواز\s*السفر|الجواز)\s*[:：]?\s*([A-Za-z]{0,2}\d{6,9})/.exec(t);
        await status('نتيجة بشكل مختلف — قريت رقم الطلب من نص الصفحة: ' + app);
        await send({ kind: 'appno-result', data: { appNumber: app, passportNo: p ? p[1].toUpperCase() : '' } }); return;
      }
      /* رجعنا لصفحة البحث بعد «إجراء البحث»: يا كود غلط، يا مفيش طلب بالبيانات دي */
      if (ctx.stage === 'submitted') {
        const msg = shownError(); await status('رجعنا لصفحة البحث بعد البحث' + (msg ? ': ' + msg : ' من غير رسالة ظاهرة'));
        if (/لم\s*يتم\s*العثور|لا\s*توجد|غير\s*موجود/.test(msg)) { await send({ kind: 'appno-result', data: { notFound: true, message: msg } }); return; }
      }
      await runSearch(ctx);
      await status('اتكتبت البيانات واتبعتت صورة الكابتشا');
    } catch (e) { await tell('حصل خطأ في الإضافة: ' + String(e && e.message || e).slice(0, 120)); }
  })();
})();
