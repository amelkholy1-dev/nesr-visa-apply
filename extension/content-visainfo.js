'use strict';
/* بيشتغل على صفحة «التفويض على تأشيرة» في منصة التأشيرات (visa.mofa.gov.sa/enjaz/getvisainformation/person) ونتيجتها (…/ViewVisaDetails/person)
   لما تدوس «هات بيانات التأشيرة من المنصة» في ملف الضبط:
   1) صفحة البحث: بيكتب رقم الصادر والرقم الموحد (رقم السجل) ويختار جهة القدوم. اللي مبيلمسوش: رمز الصورة (الكابتشا) وزرار «بحث» — بإيدك.
   2) صفحة النتيجة: بيقرا اسم الجهة والرقم الموحد والمهنة والعدد المتبقي ويرجّعهم لملف الضبط في النظام (بتراجعهم وتدوس حفظ). */
(function () {
  const byId = (id) => document.getElementById(id);
  const isEnjazSearch = () => !!byId('VisaNumber') && !!byId('SponserID');            /* الخطوة 1: «التفويض على تأشيرة» (بحث) */
  const isEnjazResult = () => !!byId('dvJobsGrid') && !!byId('EmbassyID');           /* الخطوة 1: النتيجة */
  const isHomeSearch = () => !!byId('SearchingType') && !!byId('btnSearch') && !!byId('SponserID') && !byId('VisaNumber'); /* الخطوة 2: استعلام مستند التأشيرة (الصفحة الرئيسية) */
  const isDocResult = () => !!byId('gridDocumentVisaList');                           /* الخطوة 2: «مستند تأشيرة» (PrintVisa) */
  const isSearch = () => isEnjazSearch() || isHomeSearch();
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
  const waitFor = async (fn, ms = 12000, step = 200) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => norm(s).slice(0, n);

  function bar(html) {
    let b = document.getElementById('nesr-vi-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-vi-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;width:min(94vw,640px);max-height:60vh;overflow:auto;padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;background:#1d4486;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    b.innerHTML = html; return b;
  }
  const mark = (el) => { try { if (el) { el.style.outline = '3px solid #f2a31b'; el.style.outlineOffset = '2px'; } } catch (e) { /* مش مهم */ } };

  /* صفحة البحث */
  const captchaImage = async () => {
    const img = document.getElementById('imgCaptcha'); if (!img) return '';
    if (!(await waitFor(() => img.complete && img.naturalWidth > 0, 10000))) return '';
    try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png'); } catch (e) { return ''; }
  };
  const putInput = (problems, id, v, label) => { const el = byId(id); if (!el) return problems.push(label + ': الخانة مش موجودة'); if (!v) { problems.push(label + ' فاضي في ملف الضبط'); return mark(el); } Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); fire(el); };
  /* الخطوة 2: صفحة الاستعلام الرئيسية — نوع الاستعلام «رقم مستند التأشيرة» + الرقم + رقم السجل، والكابتشا بتظهر في النظام */
  async function runHomeSearch(ctx) {
    const problems = [];
    const st = byId('SearchingType');
    if (st) { st.value = '2'; fire(st); await sleep(400); if (st.value !== '2') problems.push('نوع الاستعلام: اختار «رقم مستند التأشيرة» بإيدك'); }
    putInput(problems, 'ApplicationNumber', ctx.visaNumber, 'رقم المستند/التأشيرة'); putInput(problems, 'SponserID', ctx.unifiedNumber, 'الرقم الموحد (رقم السجل)');
    const failedBefore = ctx.stage === 'submitted'; if (failedBefore) await send({ kind: 'visainfo-stage', stage: '' });
    const shown = (document.querySelector('.field-validation-error, .validation-summary-errors, .alert-danger, #dlgMessageContent p') || {}).textContent;
    bar('<div><b>🔎 ' + esc(ctx.name || 'ملف الضبط') + '</b> — مستند التأشيرة. اتكتبت الأرقام، والكابتشا بتظهرلك في <b>صفحة النظام</b>: اكتبها هناك ودوس «بحث».</div>' + (problems.length ? '<ul style="margin:4px 18px;padding:0">' + problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''));
    const image = await captchaImage();
    await send({ kind: 'visainfo-captcha', data: { step: 2, only: ctx.mode === 'doc', image, error: failedBefore, problems, message: failedBefore ? (norm(shown) || 'الكود غلط أو الرقم مش مقبول: اكتب الكود الجديد، أو دوس «تخطّي» لو الرقم مش رقم مستند') : '' } });
  }
  async function runSearch(ctx) {
    const problems = [];
    const put = (id, v, label) => putInput(problems, id, v, label);
    put('VisaNumber', ctx.visaNumber, 'رقم الصادر'); put('SponserID', ctx.unifiedNumber, 'الرقم الموحد (رقم السجل)');
    const em = document.getElementById('Embassy');
    const wantEmb = ctx.embassy || '320'; /* لو الممثلية مش متحدّدة في ملف الضبط: السويس (المنصة بتبدأ بـ «ابوجا» وده مش المطلوب) */
    if (em && wantEmb) {
      const o = [...em.options].find((x) => String(x.value) === String(wantEmb));
      if (o) { em.value = o.value; fire(em); await sleep(300); if (String(em.value) !== String(o.value)) problems.push('جهة القدوم: اختارها بإيدك'); } else problems.push('جهة القدوم: مش لاقي الممثلية في القايمة — اختارها بإيدك');
    } else problems.push('جهة القدوم: اختارها بإيدك');
    const failedBefore = ctx.stage === 'submitted'; /* لو رجعنا لصفحة البحث بعد ما بعتنا: الكود غلط أو البيانات مش مقبولة */
    if (failedBefore) await send({ kind: 'visainfo-stage', stage: '' });
    const shown = (document.querySelector('.field-validation-error, .validation-summary-errors, .alert-danger') || {}).textContent;
    bar('<div><b>🔎 ' + esc(ctx.name || 'ملف الضبط') + '</b> — اتكتبت الأرقام، والكابتشا بتظهرلك في <b>صفحة نظام طلبات التأشيرات</b>: اكتبها هناك ودوس «بحث».</div><div style="margin-top:4px">(أو اكتب الكابتشا هنا ودوس «بحث» بنفسك لو حبيت.)</div>' +
      (problems.length ? '<ul style="margin:4px 18px;padding:0">' + problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''));
    if (ctx.inline) {
      const image = await captchaImage();
      await send({ kind: 'visainfo-captcha', data: { step: 1, image, error: failedBefore, problems, message: failedBefore ? (norm(shown) || 'الكود غلط أو البيانات مش مقبولة: اكتب الكود الجديد') : '' } });
    }
  }
  /* أوامر من النظام عن طريق الوسيط: كتابة الكابتشا اللي كتبتها إنت و«بحث»، أو صورة تانية. مفيش أي قراءة/حل للكابتشا بالإضافة */
  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!isSearch() || !msg) return;
      if (msg.kind === 'vi-submit') {
        (async () => {
          const cap = document.getElementById('Captcha'); const btn = byId('btnSearch') || document.querySelector('button[name="VisaInformation"], button[type="submit"]');
          if (!cap || !btn) { reply({ ok: false }); return; }
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(cap, String(msg.captcha || '')); fire(cap);
          await send({ kind: 'visainfo-stage', stage: 'submitted' }); btn.click(); reply({ ok: true });
        })(); return true;
      }
      if (msg.kind === 'vi-refresh') {
        (async () => {
          const img = document.getElementById('imgCaptcha'); const old = img ? img.src : ''; const rb = document.getElementById('btnRefreshCaptcha'); if (rb) rb.click();
          await waitFor(() => img && img.src !== old && img.complete && img.naturalWidth > 0, 8000);
          const image = await captchaImage(); const { ctx } = await send({ kind: 'get-visainfo-ctx' });
          await send({ kind: 'visainfo-captcha', data: { step: isHomeSearch() ? 2 : 1, only: !!(ctx && ctx.mode === 'doc'), image, error: false, refreshed: true } }); reply({ ok: true, ctx: !!ctx });
        })(); return true;
      }
    });
  } catch (e) { /* مش مهم */ }

  /* صفحة النتيجة */
  /* jTable بيحط صف «لا توجد بيانات!» مؤقتاً وهو لسه بيحمّل (قبل ما الـ AJAX يرجع). فبنستنى: مفيش «جاري التحميل» + الجدول ثابت، وبعدها لو فيه بيانات نقرا، ولو فاضي نستنى كمان شوية قبل ما نحكم إنه فاضي فعلاً */
  const settle = async (gridId, maxMs = 25000) => {
    const t0 = Date.now(); let last = null; let since = Date.now(); let sawBusy = false;
    for (;;) {
      const g = byId(gridId); if (!g) return false;
      const busy = [...g.querySelectorAll('.jtable-busy-panel-background')].some((b) => getComputedStyle(b).display !== 'none');
      if (busy) sawBusy = true;
      const sig = (g.querySelector('tbody') || {}).innerHTML || '';
      if (sig !== last) { last = sig; since = Date.now(); }
      const hasData = !!g.querySelector('tr.jtable-data-row');
      /* فاضي نثق فيه بس بعد ما نشوف دورة تحميل كاملة (جاري التحميل ← خلص)، أو بعد 3.5 ثانية لو التحميل كان أسرع من ما نلحق نشوفه */
      if (!busy && Date.now() - since >= 900 && (hasData || (sawBusy && Date.now() - since >= 1200) || Date.now() - t0 >= 3500)) return true;
      if (Date.now() - t0 > maxMs) return false;
      await sleep(150);
    }
  };
  const labelValue = (label) => { for (const l of document.querySelectorAll('label.control-label')) { if (norm(l.textContent) === label) { const d = l.nextElementSibling; return d ? norm(d.textContent) : ''; } } return ''; };
  async function runResult() {
    bar('<span>🔎 بقرا بيانات التأشيرة من النتيجة…</span>');
    await settle('dvJobsGrid'); if (byId('dvDelegationsInEmbassies')) await settle('dvDelegationsInEmbassies');
    const sel = document.getElementById('EmbassyID'); const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
    const startCode = sel ? String(sel.value || '') : ''; const startName = opt ? cut(opt.textContent, 30) : '';
    const rowsOf = (gridId) => [...document.querySelectorAll('#' + gridId + ' tr.jtable-data-row')].map((tr) => [...tr.children].map((c) => norm(c.textContent)));
    const grab = () => ({
      jobs: rowsOf('dvJobsGrid').map((td) => ({ count: cut(td[0], 6), job: cut(td[1], 60), nationality: cut(td[2], 30), embassy: cut(td[3], 30), remaining: cut(td[4], 6) })),
      /* «التفاويض في الممثلية»: رقم التفويض، جهة القدوم، عدد الأشخاص، المهنة، رقم الوكالة، اسم الوكالة */
      delegations: rowsOf('dvDelegationsInEmbassies').map((td) => ({ number: cut(td[0], 20), embassy: cut(td[1], 30), count: cut(td[2], 6), job: cut(td[3], 60), agencyNumber: cut(td[4], 20), agencyName: cut(td[5], 80) }))
    });
    let jobs = [], delegations = [];
    const merge = (g) => { jobs = jobs.concat(g.jobs); delegations = delegations.concat(g.delegations); };
    /* لو الممثلية اللي بدأنا بيها مفيهاش بيانات: بنجرّب السويس ثم القاهرة ثم الإسكندرية (بنبدّل «عرض التأشيرات الموجودة في ممثلية» لوحدنا) ونقف عند أول واحدة فيها بيانات */
    const NAMES = { '320': 'السويس', '302': 'القاهرة', '321': 'الإسكندرية' };
    const hasData = (g) => g.jobs.length > 0 || g.delegations.length > 0;
    let foundCode = '';
    { const g0 = grab(); merge(g0); if (hasData(g0)) foundCode = startCode; }
    const tried = [startName || startCode];
    for (const code of ['320', '302', '321']) {
      if (foundCode) break;
      const opt2 = sel && [...sel.options].find((o) => String(o.value) === code);
      if (!opt2 || code === startCode) continue;
      bar('<span>🔎 مفيش بيانات في ' + esc(tried[tried.length - 1]) + '، بجرّب ' + esc(NAMES[code]) + '…</span>');
      sel.value = code; fire(sel); await sleep(400);
      await settle('dvJobsGrid'); if (byId('dvDelegationsInEmbassies')) await settle('dvDelegationsInEmbassies');
      const g = grab(); merge(g); tried.push(NAMES[code]); if (hasData(g)) { foundCode = code; }
    }
    const foundOpt = foundCode && sel ? [...sel.options].find((o) => String(o.value) === foundCode) : null;
    await send({ kind: 'visainfo-status', data: { text: foundOpt ? 'لقيت بيانات في ' + cut(foundOpt.textContent, 30) : 'مفيش بيانات في: ' + tried.join('، ') } });
    const info = { delegations: delegations.slice(0, 60), visaNumber: cut(labelValue('رقم الصادر'), 20), visaDate: cut(labelValue('تاريخ التأشيرة'), 12), sponsorName: cut(labelValue('الاسم'), 100), unifiedNumber: cut(labelValue('رقم الإقامة'), 12).replace(/\D/g, '').slice(0, 10), embassyCode: (foundCode || startCode).replace(/\D/g, '').slice(0, 6), embassyName: foundOpt ? cut(foundOpt.textContent, 30) : startName, triedEmbassies: tried, jobs: jobs.slice(0, 60) };
    if (!info.sponsorName && !info.unifiedNumber && !jobs.length && !delegations.length) { bar('<div>⚠️ مقدرتش أقرا بيانات من الصفحة دي. اتأكد إنها نتيجة البحث، وجرّب تاني.</div>'); return; }
    const r = await send({ kind: 'visainfo-result', data: info });
    bar('<div><b>' + (r && r.ok ? '✅ البيانات اتبعتت لملف الضبط' : '⚠️ مقدرتش أرجّع البيانات') + '</b></div>' + (r && r.ok ? '<div>ارجع لتبويب النظام: راجع الخانات ودوس <b>حفظ</b>.</div>' : '<div>' + esc((r && r.error) || 'جرّب تاني') + '</div>') +
      '<ul style="margin:4px 18px;padding:0"><li>جهة العمل: ' + esc(info.sponsorName) + '</li><li>الرقم الموحد: ' + esc(info.unifiedNumber) + '</li><li>جهة القدوم: ' + esc(info.embassyName) + '</li>' + (delegations.length ? '<li>التفاويض: ' + delegations.length + '</li>' : '') + jobs.map((j) => '<li>' + esc(j.job) + ' — ' + esc(j.nationality) + ' — العدد ' + esc(j.count) + '، المتبقي ' + esc(j.remaining) + '</li>').join('') + '</ul>');
  }

  /* الخطوة 2: نتيجة «مستند تأشيرة»: نوع التأشيرة وعدد الدخول ومدة الإقامة والمهنة وجهة القدوم */
  async function runDoc(ctx) {
    bar('<span>🔎 بقرا مستند التأشيرة…</span>');
    await settle('gridDocumentVisaList');
    const heads = [...document.querySelectorAll('#tblDocumentVisaList thead th')].map((th) => norm(th.textContent));
    const col = (td, title) => { const i = heads.indexOf(title); return i >= 0 ? norm(td[i]) : ''; };
    const rows = [...document.querySelectorAll('#gridDocumentVisaList tr.jtable-data-row')].slice(0, 60).map((tr) => { const td = [...tr.children].map((c) => c.textContent);
      return { visaKind: cut(col(td, 'نوع التأشيرة'), 40), embassy: cut(col(td, 'جهة القدوم'), 30), gender: cut(col(td, 'الجنس'), 10), nationality: cut(col(td, 'الجنسية'), 30), job: cut(col(td, 'صلة القرابة / المهنة'), 60), entries: cut(col(td, 'عدد مرات الدخول'), 30), residence: cut(col(td, 'مدة الاقامة باليوم'), 10).replace(/\D/g, '') }; });
    /* رقم نوع التأشيرة بيتكتب في سكربت الصفحة: var VisaKindID = '13' (نفس أرقام قايمة «نوع التأشيرة» عندنا) */
    const m = /var\s+VisaKindID\s*=\s*'(\d+)'/.exec([...document.scripts].map((x) => x.textContent).join('\n'));
    const info = { docNumber: cut(labelValue('رقم المستند'), 20).replace(/\D/g, ''), docDate: cut(labelValue('تاريخ المستند'), 12), sponsorName: cut(labelValue('اسم الجهة الطالبة'), 100), visaKindId: m ? m[1] : '', rows };
    await send({ kind: 'visainfo-status', data: { text: 'قريت جدول المستند: ' + rows.length + ' صف' + (document.querySelector('#gridDocumentVisaList tr.jtable-no-data-row') ? ' (الجدول فاضي: ' + cut((document.querySelector('#gridDocumentVisaList tr.jtable-no-data-row') || {}).textContent, 60) + ')' : '') } });
    if (!rows.length) {
      /* بنقول للنظام السبب بنص المنصة بدل ما نسكت */
      /* نص خطأ حقيقي بس: عناصر ظاهرة فعلاً (الصفحة فيها نافذة خطأ مخفية بنص ثابت «عفوا حدث خطأ» مش بتتحسب) */
      const shownNow = (x) => !!(x.offsetParent || x.getClientRects().length) && getComputedStyle(x).visibility !== 'hidden';
      const dlg = [...document.querySelectorAll('.ui-dialog-content, #dlgMessageContent, .alert-danger, .field-validation-error')].filter(shownNow).map((x) => cut(x.textContent, 100)).filter(Boolean)[0] || '';
      const gridTxt = cut((document.querySelector('#gridDocumentVisaList tr.jtable-no-data-row') || document.querySelector('#gridDocumentVisaList') || {}).textContent, 80);
      const msg = 'مستند التأشيرة رقم «' + ((info.docNumber) || 'مش ظاهر في الصفحة') + '» (اللي بحثنا عنه: ' + (ctx.visaNumber || '') + ') رجع من غير بيانات' + (gridTxt ? ' (الجدول: «' + gridTxt + '»)' : ' (الجدول ما اتحمّلش)') + (dlg ? ' — المنصة قالت: ' + dlg : '') + '.';
      bar('<div>⚠️ ' + esc(msg) + '</div>');
      await send({ kind: 'visainfo-captcha', data: { step: 2, only: ctx.mode === 'doc', image: '', error: true, empty: true, message: msg, next: ctx.then === 'enjaz' } });
      if (ctx.then === 'enjaz') { await sleep(1500); await send({ kind: 'visainfo-next' }); } /* بنكمّل ببيانات التأشيرة والمهن برضه */
      return;
    }
    const r = await send({ kind: 'visainfo-doc', data: info });
    bar('<div><b>' + (r && r.ok ? '✅ بيانات المستند اتبعتت لملف الضبط' : '⚠️ مقدرتش أرجّع بيانات المستند') + '</b></div>' + (r && r.ok ? '' : '<div>' + esc((r && r.error) || 'جرّب تاني') + '</div>') + '<ul style="margin:4px 18px;padding:0">' + rows.map((x) => '<li>' + esc(x.visaKind) + ' — ' + esc(x.job) + ' — ' + esc(x.embassy) + ' — ' + esc(x.entries) + (x.residence ? ' — ' + esc(x.residence) + ' يوم' : '') + '</li>').join('') + '</ul>');
  }

  (async function run() {
    const { ctx } = await send({ kind: 'get-visainfo-ctx' }); if (!ctx) return;
    const phase = ctx.phase === 'inquiry' ? 'inquiry' : 'enjaz'; /* inquiry = الخطوة 2 */
    const step = phase === 'inquiry' ? 2 : 1;
    const status = (text) => send({ kind: 'visainfo-status', data: { text } });
    await status('الخطوة ' + step + ': فتحت ' + location.pathname);
    /* لو الصفحة مش اللي متوقعينها (دخول، تحويل، تغيير في المنصة…): بنقول للنظام بدل ما يفضل مستني */
    const tell = (message) => send({ kind: 'visainfo-captcha', data: { step, only: ctx.mode === 'doc', image: '', error: true, message } });
    try {
      const want = phase === 'enjaz' ? () => isEnjazSearch() || isEnjazResult() : () => isHomeSearch() || isDocResult();
      if (!(await waitFor(want, 12000))) { await status('الصفحة مش اللي متوقعينها'); await tell('صفحة المنصة مش زي المتوقع (' + location.pathname + '). افتح تبويب المنصة وشوف إيه اللي ظاهر.'); if (phase === 'inquiry' && ctx.then === 'enjaz') { await sleep(1500); await send({ kind: 'visainfo-next' }); } return; }
      await status('الصفحة ظاهرة زي المتوقع');
      if (phase === 'enjaz') { if (isEnjazSearch()) await runSearch(ctx); else await runResult(); }
      else if (isHomeSearch()) await runHomeSearch(ctx); else await runDoc(ctx);
    } catch (e) { await tell('حصل خطأ في الإضافة: ' + String(e && e.message || e).slice(0, 120)); }
  })();
})();
