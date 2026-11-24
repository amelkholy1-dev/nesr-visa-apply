'use strict';
/* «طباعة ورقة النت» من جوه النظام: التبويب بيتفتح في الخلفية على «إنجاز» (visa.mofa.gov.sa/Enjaz/Main)، بيكتب رقم الطلب (من غير E) ويدوس «طباعة»،
   وفي صفحة الورقة بيجهّز الصفحة الأولى بس، والإضافة (background) بتحوّلها PDF وتبعتها للنظام اللي بيطبعها وينزّلها.
   لو المنصة طلبت تسجيل دخول: صورة الكابتشا بتروح للنظام، واليوزر والباسورد والكابتشا بتكتبهم إنت في نافذة في النظام،
   والإضافة بتحطهم في صفحة الدخول وتدوس «دخول» (مبتخزّنش الباسورد، ومفيش أي حل تلقائي للكابتشا). */
(function () {
  const MAIN_URL = 'https://visa.mofa.gov.sa/Enjaz/Main';
  const LOGIN_URL = 'https://visa.mofa.gov.sa/Account/Login/enjazcompany';
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 10000, step = 150) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const shown = (x) => !!(x && (x.offsetParent || x.getClientRects().length)) && getComputedStyle(x).visibility !== 'hidden';
  const setVal = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const status = (text) => send({ kind: 'net-status', text: String(text).slice(0, 200) });
  const msg = (kind, message) => send({ kind: 'net-msg', data: { kind, message: String(message || '').slice(0, 300) } });
  /* رسالة المنصة الظاهرة (رقم غلط، كود غلط، باسورد غلط…) */
  const platformMsg = () => [...document.querySelectorAll('.modal.in .modal-body, .modal.show .modal-body, .alert-danger, .field-validation-error, .validation-summary-errors, .bootbox-body, .note-danger, .text-danger')]
    .filter(shown).map((x) => String(x.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)[0] || '';

  /* ===== صفحة الدخول ===== */
  const pwd = () => [...document.querySelectorAll('input[type="password"]')].find(shown) || document.querySelector('input[type="password"]');
  const capInput = () => document.getElementById('Captcha') || [...document.querySelectorAll('input')].find((x) => x.type !== 'hidden' && /captcha/i.test((x.id || '') + ' ' + (x.name || '')));
  const userInput = () => {
    const p = pwd(); const scope = (p && p.form) || document;
    return document.getElementById('UserName') || document.getElementById('Username') || document.getElementById('username')
      || [...scope.querySelectorAll('input[type="text"], input[type="email"], input:not([type])')].find((x) => shown(x) && x !== capInput() && !/captcha|search/i.test((x.id || '') + (x.name || '')));
  };
  const capImg = () => document.getElementById('imgCaptcha') || [...document.images].find((i) => /captcha/i.test((i.id || '') + ' ' + (i.className || '') + ' ' + (i.getAttribute('src') || '')));
  const capRefresh = () => document.getElementById('btnRefreshCaptcha') || [...document.querySelectorAll('a, button, i, span')].find((x) => /refresh/i.test((x.id || '') + ' ' + (typeof x.className === 'string' ? x.className : '')));
  /* زرار الدخول في المنصة: <input type="button" id="btnSubmit"> والصفحة نفسها بتشفّر اليوزر والباسورد (UserName_AES/Password_AES) وتبعت الفورم */
  const submitBtn = () => { const p = pwd(); const f = (p && p.form) || document; return document.getElementById('btnSubmit') || f.querySelector('input[name="login"], button[type="submit"], input[type="submit"]') || f.querySelector('button') || [...f.querySelectorAll('input[type="button"]')].find((x) => /دخول|login/i.test(x.value || '')); };
  const captchaImage = async () => {
    const img = capImg(); if (!img) return '';
    if (!(await waitFor(() => img.complete && img.naturalWidth > 0, 10000))) return '';
    try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png'); } catch (e) { return ''; }
  };
  async function onLogin(ctx) {
    const failed = ctx.stage === 'login-submitted';
    const m = failed ? platformMsg() : '';
    if (failed) await send({ kind: 'net-stage', stage: 'login' });
    const problems = []; if (!userInput()) problems.push('خانة اليوزر'); if (!pwd()) problems.push('خانة الباسورد'); if (!submitBtn()) problems.push('زرار الدخول');
    if (problems.length) { await msg('manual', 'صفحة الدخول في المنصة شكلها مختلف (مش لاقي: ' + problems.join('، ') + '). دوس «افتح التبويب» وادخل بنفسك، وأنا هكمّل بعدها.'); return; }
    await sleep(600); /* الصفحة بتجيب صورة كابتشا جديدة أول ما تفتح: نستنى الجديدة */
    const image = capInput() ? await captchaImage() : '';
    await send({ kind: 'net-login', data: { image, needCaptcha: !!capInput(), error: failed, message: failed ? (m || 'الدخول ما نجحش: راجع اليوزر والباسورد والكود') : '' } });
    await status('صفحة الدخول جاهزة' + (failed ? ' (بعد محاولة فاشلة)' : ''));
  }
  try {
    chrome.runtime.onMessage.addListener((m, sender, reply) => {
      if (!m || !pwd()) return;
      if (m.kind === 'net-login-submit') {
        (async () => {
          const u = userInput(), p = pwd(), c = capInput(), b = submitBtn();
          if (!u || !p || !b) { reply({ ok: false }); return; }
          setVal(u, String(m.user || '')); setVal(p, String(m.pass || '')); if (c) setVal(c, String(m.captcha || ''));
          await send({ kind: 'net-stage', stage: 'login-submitted' }); await sleep(200); b.click(); reply({ ok: true });
        })(); return true;
      }
      if (m.kind === 'net-login-refresh') {
        (async () => {
          const img = capImg(); const old = img ? img.src : ''; const rb = capRefresh();
          if (rb) rb.click(); else if (img) img.src = old.replace(/([?&])_r=\d+/, '') + (old.includes('?') ? '&' : '?') + '_r=' + Date.now();
          await waitFor(() => img && img.src !== old && img.complete && img.naturalWidth > 0, 8000);
          await send({ kind: 'net-login', data: { image: await captchaImage(), needCaptcha: true, error: false, refreshed: true } }); reply({ ok: true });
        })(); return true;
      }
    });
  } catch (e) { /* مش مهم */ }

  /* ===== صفحة الورقة: الصفحة الأولى بس ===== */
  function firstPageOnly() {
    const pp = document.querySelector('.page-print');
    const src = document.getElementById('div') || (pp && (pp.closest('.portlet') || pp));
    if (!src) return false;
    let root = document.getElementById('nesr-net-root'); if (root) root.remove();
    root = document.createElement('div'); root.id = 'nesr-net-root'; root.className = 'container';
    const copy = src.cloneNode(true); copy.removeAttribute('id');
    copy.querySelectorAll('.form-actions, .btndiv, script').forEach((x) => x.remove());
    root.appendChild(copy); document.body.appendChild(root);
    if (!document.getElementById('nesr-net-style')) {
      const st = document.createElement('style'); st.id = 'nesr-net-style';
      st.textContent = '#nesr-net-root{display:none}' +
        '@media print{@page{size:A4 portrait;margin:8mm}html,body{margin:0!important;padding:0!important;height:auto!important;background:#fff!important}' +
        'body>*:not(#nesr-net-root){display:none!important}#nesr-net-root{display:block!important;width:auto!important;margin:0!important;padding:0!important;max-height:276mm!important;overflow:hidden!important;page-break-after:avoid;break-after:avoid}' +
        '#nesr-net-root .portlet{margin:0!important;border:0!important}}';
      document.head.appendChild(st);
    }
    return true;
  }
  async function onPrintPage(ctx, want) {
    const got = String((document.querySelector('.requestcode-number') || {}).textContent || '').replace(/\D/g, '');
    if (want && !got.includes(want)) { await msg('fail', 'المنصة فتحت ورقة لطلب تاني (' + got + ' مش ' + want + '). مش هطبعها.'); return; }
    await waitFor(() => [...document.images].every((im) => im.complete), 8000, 200);
    firstPageOnly(); await sleep(300);
    document.documentElement.dataset.vaNetPrinted = '1';
    await send({ kind: 'net-stage', stage: 'printed' });
    await status('ورقة الطلب ظهرت، بنحوّلها PDF');
    const r = await send({ kind: 'net-ready', data: { appNo: want || got } });
    if (!r || !r.ok) await msg('manual', 'مقدرتش أحوّل الورقة PDF' + (r && r.error ? ' (' + r.error + ')' : '') + '. دوس «افتح التبويب» واطبعها من هناك (Ctrl+P).');
  }

  /* ===== صفحة «إنجاز»: رقم الطلب + «طباعة» ===== */
  async function onMain(ctx, want) {
    const app = document.getElementById('AppNo'), btn = document.getElementById('PrintApplication');
    if (ctx.stage === 'submitted') {
      await sleep(700); const m = platformMsg();
      await msg('fail', 'المنصة ما فتحتش ورقة الطلب ' + want + (m ? ': «' + m.slice(0, 160) + '»' : '') + '. اتأكد من رقم الطلب.');
      return;
    }
    setVal(app, want); const hc = document.getElementById('hiddenCommand'); if (hc) hc.value = 'PrintApplication';
    await send({ kind: 'net-stage', stage: 'submitted' }); await status('بكتب رقم الطلب ' + want + ' وبدوس «طباعة»');
    await sleep(250); btn.click();
  }

  (async function run() {
    let ctx = null; for (let k = 0; k < 8 && !ctx; k++) { ({ ctx } = await send({ kind: 'get-net-ctx' })); if (!ctx) await sleep(400); }
    if (!ctx) return;
    const want = String(ctx.appNo || '').replace(/\D/g, '');
    const kind = await waitFor(() => document.querySelector('.requestcode-number') ? 'print' : (document.getElementById('AppNo') && document.getElementById('PrintApplication')) ? 'main' : pwd() ? 'login' : '', 6000);
    await status('اتفتحت صفحة المنصة: ' + location.pathname);
    if (kind === 'print') return ctx.stage === 'printed' ? undefined : onPrintPage(ctx, want);
    if (kind === 'main') return onMain(ctx, want);
    if (kind === 'login') return onLogin(ctx);
    /* مش داخل المنصة (مفيش اسم المستخدم فوق): صفحة دخول الشركات */
    const loggedIn = !!document.querySelector('.logged-name-user, .header-logged');
    if (!loggedIn && ctx.stage !== 'login' && ctx.stage !== 'login-submitted') { await send({ kind: 'net-stage', stage: 'login' }); location.href = LOGIN_URL; return; }
    if (!loggedIn) { await msg('manual', 'المنصة لسه مش داخلة. دوس «افتح التبويب» وادخل بنفسك، وأنا هكمّل بعدها.'); return; }
    if (ctx.stage !== 'main') { await send({ kind: 'net-stage', stage: 'main' }); location.href = MAIN_URL; return; }
    await msg('manual', 'مقدرتش أوصل لصفحة «إنجاز» (' + location.pathname + '). دوس «افتح التبويب» وشوف إيه اللي ظاهر.');
  })();
})();
