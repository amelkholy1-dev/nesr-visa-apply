'use strict';
/* «طباعة ورقة النت»: بيفتح طباعة الطلب من إنجاز برقم الطلب (visa.mofa.gov.sa/Enjaz/PrintApplication?ApplicationNo=…)،
   ولو المنصة رجّعتك لصفحة «إنجاز» (Enjaz/Main) بيكتب رقم الطلب ويدوس «طباعة». في صفحة الورقة بيظبطها على ورقة واحدة ويفتح نافذة الطباعة. */
(function () {
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function bar(html) {
    let b = document.getElementById('nesr-net-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-net-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl'); b.className = 'hidden-print';
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;max-width:min(94vw,620px);padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;background:#1d4486;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.27)';
    b.innerHTML = html; return b;
  }
  /* الورقة كلها على صفحة A4 واحدة (من غير أزرار المنصة ولا الهيدر والفوتر) */
  function fitOnePage() {
    if (!document.getElementById('nesr-net-style')) {
      const st = document.createElement('style'); st.id = 'nesr-net-style';
      st.textContent = '@media print{@page{size:A4 portrait;margin:7mm}.btndiv,.page-header,.pre-footer,.page-footer,.banner-beta,.scroll-to-top,.cookiealert,#nesr-net-bar,#nesr-bar,#nesr-va-bar{display:none!important}.page-container,.page-content,.container{margin:0!important;padding:0!important;width:auto!important}}';
      document.head.appendChild(st);
    }
    const el = document.getElementById('div') || document.querySelector('.page-print') || document.body;
    const before = () => { el.style.zoom = ''; const h = el.scrollHeight; const pageH = 1080; if (h > pageH) el.style.zoom = String(Math.max(0.5, pageH / h).toFixed(3)); };
    const after = () => { el.style.zoom = ''; };
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
  }
  const imagesReady = async () => { for (let i = 0; i < 40; i++) { if ([...document.images].every((im) => im.complete)) return; await sleep(200); } };

  (async function run() {
    let ctx = null; for (let k = 0; k < 6 && !ctx; k++) { ({ ctx } = await send({ kind: 'get-net-ctx' })); if (!ctx) await sleep(500); }
    if (!ctx) return;
    const want = String(ctx.appNo || '').replace(/\D/g, '');
    const code = document.querySelector('.requestcode-number');
    if (code) {
      if (!String(code.textContent).replace(/\D/g, '').includes(want)) { bar('⚠️ الورقة اللي ظهرت لطلب تاني (مش ' + esc(want) + '). مش هطبعها.'); return; }
      fitOnePage(); await imagesReady(); await sleep(400);
      const b = bar('🖨️ ورقة النت للطلب <b dir="ltr">E' + esc(want) + '</b>: نافذة الطباعة هتفتح دلوقتي (ورقة واحدة). <button id="nesr-net-again" style="background:#fff;color:#1d4486;border:0;border-radius:8px;padding:5px 10px;font:700 12px Tahoma;cursor:pointer">اطبع تاني</button>');
      b.querySelector('#nesr-net-again').onclick = () => window.print();
      await send({ kind: 'net-stage', stage: 'printed' });
      document.documentElement.dataset.vaNetPrinted = '1';
      window.print();
      return;
    }
    /* صفحة «إنجاز» الرئيسية: رقم الطلب + «طباعة» (مرة واحدة بس) */
    const app = document.getElementById('AppNo'), btn = document.getElementById('PrintApplication');
    if (app && btn) {
      if (ctx.stage === 'submitted') { bar('⚠️ المنصة رجّعت صفحة إنجاز تاني بعد «طباعة». اتأكد من رقم الطلب <b dir="ltr">' + esc(want) + '</b> ودوس «طباعة» بنفسك.'); return; }
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(app, want); app.dispatchEvent(new Event('input', { bubbles: true })); app.dispatchEvent(new Event('change', { bubbles: true }));
      await send({ kind: 'net-stage', stage: 'submitted' }); bar('بكتب رقم الطلب وبدوس «طباعة»…'); await sleep(300); btn.click(); return;
    }
    if (/\/Account\/Login/i.test(location.pathname)) { bar('🔐 سجّل دخولك في المنصة، وبعدين ارجع للنظام ودوس «طباعة ورقة النت» تاني.'); return; }
    if (ctx.stage === '') { await send({ kind: 'net-stage', stage: 'main' }); location.href = 'https://visa.mofa.gov.sa/Enjaz/Main'; }
  })();
})();
