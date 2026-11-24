'use strict';
/* «طباعة ورقة النت»: بيفتح صفحة «إنجاز» (visa.mofa.gov.sa/Enjaz/Main)، يكتب رقم الطلب (من غير E) ويدوس «طباعة»،
   وفي صفحة الورقة بيطبع الصفحة الأولى بس (بنفس مقاسها، من غير أزرار المنصة ولا الهيدر والفوتر). */
(function () {
  const MAIN_URL = 'https://visa.mofa.gov.sa/Enjaz/Main';
  const LOGIN_URL = 'https://visa.mofa.gov.sa/Account/Login/enjazcompany';
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waitFor = async (fn, ms = 10000, step = 150) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const shown = (x) => !!(x.offsetParent || x.getClientRects().length) && getComputedStyle(x).visibility !== 'hidden';
  const BTN = 'background:#fff;color:#1d4486;border:0;border-radius:8px;padding:5px 10px;font:700 12px Tahoma;cursor:pointer;margin-inline-start:6px';
  function bar(html, bad) {
    let b = document.getElementById('nesr-net-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-net-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl'); b.className = 'hidden-print';
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;max-width:min(94vw,640px);padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.27);background:' + (bad ? '#b4232f' : '#1d4486');
    b.innerHTML = html; return b;
  }
  /* رسالة المنصة الظاهرة (لو الرقم غلط أو الطلب مش موجود) */
  const platformMsg = () => [...document.querySelectorAll('.modal.in .modal-body, .modal.show .modal-body, .alert-danger, .field-validation-error, .validation-summary-errors, .bootbox-body, .note-danger')]
    .filter(shown).map((x) => String(x.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)[0] || '';

  /* الصفحة الأولى بس: بنعمل نسخة من الورقة في آخر الصفحة ونخفي كل حاجة تانية وقت الطباعة، والنسخة مقصوصة على طول صفحة A4 واحدة */
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
  const imagesReady = async () => { await waitFor(() => [...document.images].every((im) => im.complete), 8000, 200); };

  async function onPrintPage(ctx, want, auto) {
    const got = String((document.querySelector('.requestcode-number') || {}).textContent || '').replace(/\D/g, '');
    if (want && !got.includes(want)) { bar('⚠️ الورقة اللي ظهرت لطلب تاني (<b dir="ltr">' + esc(got) + '</b> مش <b dir="ltr">' + esc(want) + '</b>). مش هطبعها.', true); return; }
    await imagesReady(); firstPageOnly(); await sleep(300);
    const b = bar('🖨️ ورقة النت للطلب <b dir="ltr">E' + esc(want || got) + '</b>' + (ctx.name ? ' (' + esc(ctx.name) + ')' : '') + ': ' + (auto ? 'نافذة الطباعة بتفتح (الصفحة الأولى بس).' : 'اتطبعت قبل كده.') + ' <button id="nesr-net-again" style="' + BTN + '">اطبع تاني</button>');
    b.querySelector('#nesr-net-again').onclick = () => window.print();
    await send({ kind: 'net-stage', stage: 'printed' });
    document.documentElement.dataset.vaNetPrinted = '1';
    if (auto) window.print();
  }

  async function onMain(ctx, want) {
    const app = document.getElementById('AppNo'), btn = document.getElementById('PrintApplication');
    const submit = async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(app, want);
      app.dispatchEvent(new Event('input', { bubbles: true })); app.dispatchEvent(new Event('change', { bubbles: true }));
      const hc = document.getElementById('hiddenCommand'); if (hc) hc.value = 'PrintApplication';
      await send({ kind: 'net-stage', stage: 'submitted' });
      bar('🔎 بكتب رقم الطلب <b dir="ltr">' + esc(want) + '</b> وبدوس «طباعة»…');
      await sleep(250); btn.click();
    };
    if (ctx.stage === 'submitted') {
      /* رجعنا لنفس الصفحة بعد «طباعة»: يا الرقم مش موجود، يا المنصة طلعت رسالة */
      await sleep(700); const m = platformMsg();
      if (app && !app.value) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(app, want);
      const b = bar('⚠️ المنصة ما فتحتش ورقة الطلب <b dir="ltr">' + esc(want) + '</b>' + (m ? ': «' + esc(m.slice(0, 160)) + '»' : '') + '. اتأكد من رقم الطلب في النظام. <button id="nesr-net-retry" style="' + BTN + '">جرّب تاني</button>', true);
      b.querySelector('#nesr-net-retry').onclick = () => submit();
      return;
    }
    await submit();
  }

  (async function run() {
    let ctx = null; for (let k = 0; k < 8 && !ctx; k++) { ({ ctx } = await send({ kind: 'get-net-ctx' })); if (!ctx) await sleep(400); }
    if (!ctx) return;
    const want = String(ctx.appNo || '').replace(/\D/g, '');
    const kind = await waitFor(() => document.querySelector('.requestcode-number') ? 'print' : (document.getElementById('AppNo') && document.getElementById('PrintApplication')) ? 'main' : '', 6000);
    if (kind === 'print') return onPrintPage(ctx, want, ctx.stage !== 'printed'); /* لو اتطبعت قبل كده في التبويب ده: بنجهّزها بس من غير ما نفتح الطباعة تاني */
    if (kind === 'main') return onMain(ctx, want);
    if (/\/Account\/Login/i.test(location.pathname)) { await send({ kind: 'net-stage', stage: 'login' }); bar('🔐 سجّل دخولك في المنصة بحساب الشركة، وأنا هكمّل لوحدي وأفتح «إنجاز» وأطبع ورقة الطلب <b dir="ltr">' + esc(want) + '</b>.'); return; }
    /* مش داخل المنصة (الصفحة الرئيسية فيها زرار «الدخول» ومفيش اسم المستخدم): نوديك لصفحة دخول الشركات، وبعد الدخول نرجع لـ «إنجاز» */
    const loggedIn = !!document.querySelector('.logged-name-user, .header-logged');
    if (!loggedIn && ctx.stage !== 'login') { await send({ kind: 'net-stage', stage: 'login' }); bar('🔐 إنت مش داخل المنصة: بفتحلك صفحة دخول الشركات…'); location.href = LOGIN_URL; return; }
    if (!loggedIn) { const b = bar('🔐 سجّل دخولك في المنصة بحساب الشركة وأنا هكمّل لوحدي. <button id="nesr-net-go" style="' + BTN + '">صفحة الدخول</button>', true); b.querySelector('#nesr-net-go').onclick = () => { location.href = LOGIN_URL; }; return; }
    /* داخل المنصة وفي صفحة تانية (الرئيسية بعد الدخول مثلاً): نروح لـ «إنجاز» */
    if (ctx.stage === '' || ctx.stage === 'login') { await send({ kind: 'net-stage', stage: 'main' }); location.href = MAIN_URL; return; }
    const b = bar('⚠️ مقدرتش أوصل لصفحة «إنجاز». <button id="nesr-net-go" style="' + BTN + '">افتح إنجاز</button>', true);
    b.querySelector('#nesr-net-go').onclick = async () => { await send({ kind: 'net-stage', stage: 'main' }); location.href = MAIN_URL; };
  })();
})();
