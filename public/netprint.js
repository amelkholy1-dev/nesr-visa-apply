'use strict';
/* «طباعة ورقة النت» من جوه النظام: نافذة هنا بتتابع الإضافة وهي شغّالة في الخلفية على «إنجاز».
   لو المنصة طلبت دخول: بتكتب اليوزر والباسورد والكابتشا هنا (الباسورد مبيتحفظش في أي مكان، واليوزر بس بيتفتكر على الجهاز ده).
   لما الورقة توصل PDF (الصفحة الأولى): نافذة الطباعة بتفتح على طول، وفيه «نزّل PDF». */
(function () {
  const NA = window.NA;
  const post = (type, data) => window.postMessage({ source: 'nesr-visaapply', type, data }, location.origin);
  const ctl = (op, extra) => post('VA_NET_CTL', { op, ...(extra || {}) });
  const verLess = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
  const MIN_EXT = '1.19.0';
  let S = null; /* { appNo, name, root, close, timer, log[] } */
  const body = () => (S && S.root && S.root.isConnected ? S.root.querySelector('#npBody') : null);
  const draw = (html) => { const b = body(); if (b) b.innerHTML = html; };
  const logHtml = () => (S && S.log.length ? S.log.map((x) => `<div>${NA.e(x)}</div>`).join('') : '<div>لسه مفيش.</div>');
  const logAdd = (t) => { if (!S) return; S.log.push(new Date().toLocaleTimeString('ar-EG', { hour12: false }) + ' — ' + t); if (S.log.length > 30) S.log.shift(); const d = S.root && S.root.querySelector('#npLog'); if (d) d.innerHTML = logHtml(); };
  const arm = (ms) => { clearTimeout(S.timer); S.timer = setTimeout(() => onMsg({ kind: 'manual', message: 'المنصة ما ردّتش لحد دلوقتي. دوس «افتح التبويب» وشوف إيه اللي ظاهر، أو جرّب تاني.' }), ms || 60000); };
  const tools = () => '<div class="row" style="margin-top:12px"><button class="btn" id="npOpen" type="button">افتح التبويب</button><button class="btn" id="npAgain" type="button">جرّب تاني</button><button class="btn danger" id="npStop" type="button">إلغاء</button></div>';
  const wire = () => {
    const r = S && S.root; if (!r) return;
    const o = r.querySelector('#npOpen'); if (o) o.onclick = () => ctl('open');
    const a = r.querySelector('#npAgain'); if (a) a.onclick = () => start(S.appNo, S.name, S.personId, true);
    const st = r.querySelector('#npStop'); if (st) st.onclick = () => { ctl('cancel'); close(); };
  };
  const close = () => { if (!S) return; clearTimeout(S.timer); const c = S.close; S = null; try { c(); } catch (e) { /* مش مهم */ } };
  const waiting = (t) => draw(`<div class="card" style="background:var(--warn-bg)"><b>${NA.e(t)}</b><div class="small muted" style="margin-top:6px">الإضافة شغّالة على المنصة في الخلفية، مش محتاج تعمل حاجة.</div></div>${tools()}`);

  async function start(appNumber, name, personId, again) {
    const { toast, e } = NA;
    const digits = String(appNumber || '').replace(/\D/g, ''); if (!digits) return toast('الشخص ده لسه مالوش رقم طلب (إنجاز): سجّله أو دوس «هات رقم إنجاز» الأول', 'err');
    if (!NA.extReady) { NA.ping(); await new Promise((r) => setTimeout(r, 700)); }
    if (!NA.extReady) return toast('إضافة Chrome مش متركّبة. من «إضافة Chrome» نزّلها وركّبها الأول.', 'err');
    if (NA.extVersion && verLess(NA.extVersion, MIN_EXT)) return toast(`الإضافة عندك قديمة (${NA.extVersion}). طباعة ورقة النت محتاجة ${MIN_EXT}: من «إضافة Chrome» نزّل الجديدة، وفي chrome://extensions دوس Reload، وبعدين F5 هنا.`, 'err');
    if (!S || !again) {
      if (S) close();
      S = { appNo: digits, name: name || '', personId: personId || '', log: [] };
      NA.modal(`<h2>ورقة النت — <span dir="ltr">E${e(digits)}</span></h2><div class="muted small" style="margin-bottom:10px">${e(name || '')}</div><div id="npBody"></div>
        <details class="small muted" style="margin-top:10px"><summary>تفاصيل (اللي الإضافة عملته)</summary><div id="npLog" style="margin-top:4px">${logHtml()}</div></details>`, (m, c) => { S.root = m; S.close = c; m.style.maxWidth = '560px'; }, { sticky: true });
    }
    waiting('بنفتح «إنجاز» ونجيب ورقة الطلب…'); wire(); arm(60000);
    post('VA_NETPRINT', { appNo: digits, name: S.name, personId: S.personId });
  }

  function onLogin(d) {
    if (!S) return; const { e } = NA; arm(10 * 60000); logAdd(d.error ? 'الدخول ما نجحش: ' + (d.message || '') : d.refreshed ? 'صورة كابتشا جديدة' : 'المنصة طلبت تسجيل الدخول');
    let user = ''; try { user = localStorage.getItem('mofaUser') || ''; } catch (x) { /* مش مهم */ }
    const img = typeof d.image === 'string' && d.image.startsWith('data:image/') ? d.image : '';
    draw(`<div class="card" style="background:var(--warn-bg)"><b>🔐 المنصة طالبة تسجيل الدخول (حساب الشركة)</b><div class="small muted" style="margin-top:4px">اكتب البيانات هنا والإضافة هتدخل وتكمّل لوحدها. الباسورد مبيتحفظش في أي مكان.</div></div>
      ${d.error ? `<div class="card issues" style="margin-top:8px">${e(d.message || 'الدخول ما نجحش')}</div>` : ''}
      <div style="display:grid;gap:10px;margin-top:10px">
        <label class="f">اسم المستخدم<input id="npUser" dir="ltr" autocomplete="off" value="${e(user)}"></label>
        <label class="f">كلمة السر<input id="npPass" type="password" dir="ltr" autocomplete="off"></label>
        ${d.needCaptcha !== false ? `<label class="f">رمز الصورة (الكابتشا)<div class="row" style="align-items:center;flex-wrap:nowrap">${img ? `<img src="${img}" alt="الكابتشا" style="height:46px;border:1px solid var(--line);border-radius:6px;background:#fff">` : '<span class="chip warn">مفيش صورة</span>'}<button class="btn small" id="npRef" type="button">صورة تانية</button><input id="npCap" dir="ltr" maxlength="10" autocomplete="off" style="width:140px;font-size:18px;letter-spacing:3px"></div></label>` : ''}
        <div class="row"><button class="btn pri" id="npGo" type="button">دخول</button><span class="small muted" id="npM"></span></div></div>${tools()}`);
    const r = S.root; const u = r.querySelector('#npUser'), p = r.querySelector('#npPass'), c = r.querySelector('#npCap');
    (u.value ? (c || p) : u).focus(); if (u.value && c) p.focus();
    const go = () => {
      if (!u.value.trim() || !p.value) return NA.toast('اكتب اليوزر والباسورد', 'err');
      if (c && !c.value.trim()) return NA.toast('اكتب رمز الصورة', 'err');
      try { localStorage.setItem('mofaUser', u.value.trim()); } catch (x) { /* مش مهم */ }
      ctl('login', { user: u.value.trim(), pass: p.value, captcha: c ? c.value.trim() : '' }); p.value = '';
      r.querySelector('#npGo').disabled = true; r.querySelector('#npM').textContent = 'بيدخل…'; logAdd('اتبعتت بيانات الدخول'); arm(60000);
    };
    r.querySelector('#npGo').onclick = go; [u, p, c].forEach((x) => { if (x) x.onkeydown = (ev) => { if (ev.key === 'Enter') go(); }; });
    const rf = r.querySelector('#npRef'); if (rf) rf.onclick = () => { r.querySelector('#npM').textContent = 'بنجيب صورة تانية…'; ctl('refresh'); };
    wire();
  }
  function onMsg(d) {
    if (!S) { if (d && d.message) NA.toast(d.message, d.kind === 'fail' ? 'err' : ''); return; }
    clearTimeout(S.timer); logAdd(d.message || '');
    draw(`<div class="card issues">${NA.e(d.message || 'حصلت مشكلة')}</div>${tools()}`); wire();
  }
  function onStatus(d) { if (S) logAdd(d.text || ''); }
  function pdfUrl(d) { try { const bin = atob(String(d.pdf).split(',')[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); } catch (e) { return ''; } }
  function printUrl(url) {
    const old = document.getElementById('naNetFrame'); if (old) old.remove();
    const fr = document.createElement('iframe'); fr.id = 'naNetFrame'; fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0';
    fr.onload = () => setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } }, 400);
    fr.src = url; document.body.appendChild(fr);
  }
  function onPdf(d) {
    const { e } = NA; const url = /^data:application\/pdf;base64,/.test(String(d.pdf || '')) ? pdfUrl(d) : '';
    if (!S) S = { appNo: d.appNo, name: d.name || '', log: [] };
    clearTimeout(S.timer); logAdd('الورقة وصلت PDF');
    const fname = (String(d.name || S.name || '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'ورقة') + ' - ورقة النت E' + (d.appNo || S.appNo) + '.pdf';
    const html = url ? `<div class="card" style="background:var(--ok-bg)"><b>✅ ورقة النت جاهزة (الصفحة الأولى)</b><div class="small muted" style="margin-top:4px">نافذة الطباعة بتفتح دلوقتي.</div></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="npPrint" type="button">اطبع</button><a class="btn" id="npDl" href="${url}" download="${e(fname)}">نزّل PDF</a><button class="btn" id="npClose" type="button">قفل</button></div>`
      : `<div class="card issues">الورقة وصلت بس الملف بايظ. جرّب تاني.</div>${tools()}`;
    if (S.root && S.root.isConnected) draw(html);
    else NA.modal(`<h2>ورقة النت — <span dir="ltr">E${e(d.appNo || '')}</span></h2><div id="npBody">${html}</div>`, (m, c) => { S.root = m; S.close = c; });
    const r = S.root; const p = r.querySelector('#npPrint'); if (p) p.onclick = () => printUrl(url); const c = r.querySelector('#npClose'); if (c) c.onclick = close; wire();
    if (url) printUrl(url);
  }
  NA.net = { start, onLogin, onMsg, onStatus, onPdf };
  NA.netPrint = (appNumber, name, personId) => start(appNumber, name, personId, false);
})();
