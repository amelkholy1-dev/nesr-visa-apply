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
  if (!isSearch() && !isEnjazResult() && !isDocResult()) return;
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
    putInput(problems, 'ApplicationNumber', ctx.docNumber || ctx.visaNumber, 'رقم المستند/التأشيرة'); putInput(problems, 'SponserID', ctx.unifiedNumber, 'الرقم الموحد (رقم السجل)');
    const failedBefore = ctx.stage === 'submitted'; if (failedBefore) await send({ kind: 'visainfo-stage', stage: '' });
    const shown = (document.querySelector('.field-validation-error, .validation-summary-errors, .alert-danger, #dlgMessageContent p') || {}).textContent;
    bar('<div><b>🔎 ' + esc(ctx.name || 'ملف الضبط') + '</b> — الخطوة 2: استعلام مستند التأشيرة. اتكتبت الأرقام، والكابتشا بتظهرلك في <b>صفحة النظام</b>: اكتبها هناك ودوس «بحث».</div>' + (problems.length ? '<ul style="margin:4px 18px;padding:0">' + problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''));
    const image = await captchaImage();
    await send({ kind: 'visainfo-captcha', data: { step: 2, image, error: failedBefore, problems, message: failedBefore ? (norm(shown) || 'الكود غلط أو الرقم مش مقبول: اكتب الكود الجديد، أو دوس «تخطّي» لو الرقم مش رقم مستند') : '' } });
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
          await send({ kind: 'visainfo-captcha', data: { step: isHomeSearch() ? 2 : 1, image, error: false, refreshed: true } }); reply({ ok: true, ctx: !!ctx });
        })(); return true;
      }
    });
  } catch (e) { /* مش مهم */ }

  /* صفحة النتيجة */
  const labelValue = (label) => { for (const l of document.querySelectorAll('label.control-label')) { if (norm(l.textContent) === label) { const d = l.nextElementSibling; return d ? norm(d.textContent) : ''; } } return ''; };
  async function runResult() {
    bar('<span>🔎 بقرا بيانات التأشيرة من النتيجة…</span>');
    const loaded = (id) => document.querySelector('#' + id + ' tr.jtable-data-row, #' + id + ' tr.jtable-no-data-row');
    await waitFor(() => loaded('dvJobsGrid') && (!document.getElementById('dvDelegationsInEmbassies') || loaded('dvDelegationsInEmbassies')), 15000);
    const sel = document.getElementById('EmbassyID'); const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
    const startCode = sel ? String(sel.value || '') : ''; const startName = opt ? cut(opt.textContent, 30) : '';
    const rowsOf = (gridId) => [...document.querySelectorAll('#' + gridId + ' tr.jtable-data-row')].map((tr) => [...tr.children].map((c) => norm(c.textContent)));
    const grab = () => ({
      jobs: rowsOf('dvJobsGrid').map((td) => ({ count: cut(td[0], 6), job: cut(td[1], 60), nationality: cut(td[2], 30), embassy: cut(td[3], 30), remaining: cut(td[4], 6) })),
      /* «التفاويض في الممثلية»: رقم التفويض، جهة القدوم، عدد الأشخاص، المهنة، رقم الوكالة، اسم الوكالة */
      delegations: rowsOf('dvDelegationsInEmbassies').map((td) => ({ number: cut(td[0], 20), embassy: cut(td[1], 30), count: cut(td[2], 6), job: cut(td[3], 60), agencyNumber: cut(td[4], 20), agencyName: cut(td[5], 80) }))
    });
    const idle = () => ['dvJobsGrid', 'dvDelegationsInEmbassies'].every((id) => loaded(id) && ![...document.querySelectorAll('#' + id + ' .jtable-busy-panel-background')].some((b) => getComputedStyle(b).display !== 'none'));
    let jobs = [], delegations = [];
    const merge = (g) => { jobs = jobs.concat(g.jobs); delegations = delegations.concat(g.delegations); };
    merge(grab());
    /* بنشيك على السويس والقاهرة (من غير ما تغيّر الممثلية بإيدك): بنبدّل «عرض التأشيرات الموجودة في ممثلية» وننتظر الجداول تتحدّث */
    const seen = new Set([startCode]);
    for (const code of ['320', '302']) {
      if (!sel || seen.has(code) || ![...sel.options].some((o) => String(o.value) === code)) continue;
      bar('<span>🔎 بشيك على ' + (code === '320' ? 'السويس' : 'القاهرة') + '…</span>');
      sel.value = code; fire(sel); await sleep(200);
      await waitFor(idle, 12000, 150); await sleep(250); merge(grab()); seen.add(code);
    }
    const info = { delegations: delegations.slice(0, 60), visaNumber: cut(labelValue('رقم الصادر'), 20), visaDate: cut(labelValue('تاريخ التأشيرة'), 12), sponsorName: cut(labelValue('الاسم'), 100), unifiedNumber: cut(labelValue('رقم الإقامة'), 12).replace(/\D/g, '').slice(0, 10), embassyCode: startCode.replace(/\D/g, '').slice(0, 6), embassyName: startName, jobs: jobs.slice(0, 60) };
    if (!info.sponsorName && !info.unifiedNumber && !jobs.length && !delegations.length) { bar('<div>⚠️ مقدرتش أقرا بيانات من الصفحة دي. اتأكد إنها نتيجة البحث، وجرّب تاني.</div>'); return; }
    const r = await send({ kind: 'visainfo-result', data: info });
    bar('<div><b>' + (r && r.ok ? '✅ البيانات اتبعتت لملف الضبط' : '⚠️ مقدرتش أرجّع البيانات') + '</b></div>' + (r && r.ok ? '<div>ارجع لتبويب النظام: راجع الخانات ودوس <b>حفظ</b>.</div>' : '<div>' + esc((r && r.error) || 'جرّب تاني') + '</div>') +
      '<ul style="margin:4px 18px;padding:0"><li>جهة العمل: ' + esc(info.sponsorName) + '</li><li>الرقم الموحد: ' + esc(info.unifiedNumber) + '</li><li>جهة القدوم: ' + esc(info.embassyName) + '</li>' + (delegations.length ? '<li>التفاويض: ' + delegations.length + '</li>' : '') + jobs.map((j) => '<li>' + esc(j.job) + ' — ' + esc(j.nationality) + ' — العدد ' + esc(j.count) + '، المتبقي ' + esc(j.remaining) + '</li>').join('') + '</ul>');
  }

  /* الخطوة 2: نتيجة «مستند تأشيرة»: نوع التأشيرة وعدد الدخول ومدة الإقامة والمهنة وجهة القدوم */
  async function runDoc() {
    bar('<span>🔎 بقرا مستند التأشيرة…</span>');
    await waitFor(() => document.querySelector('#gridDocumentVisaList tr.jtable-data-row, #gridDocumentVisaList tr.jtable-no-data-row'), 15000);
    const heads = [...document.querySelectorAll('#tblDocumentVisaList thead th')].map((th) => norm(th.textContent));
    const col = (td, title) => { const i = heads.indexOf(title); return i >= 0 ? norm(td[i]) : ''; };
    const rows = [...document.querySelectorAll('#gridDocumentVisaList tr.jtable-data-row')].slice(0, 60).map((tr) => { const td = [...tr.children].map((c) => c.textContent);
      return { visaKind: cut(col(td, 'نوع التأشيرة'), 40), embassy: cut(col(td, 'جهة القدوم'), 30), gender: cut(col(td, 'الجنس'), 10), nationality: cut(col(td, 'الجنسية'), 30), job: cut(col(td, 'صلة القرابة / المهنة'), 60), entries: cut(col(td, 'عدد مرات الدخول'), 30), residence: cut(col(td, 'مدة الاقامة باليوم'), 10).replace(/\D/g, '') }; });
    /* رقم نوع التأشيرة بيتكتب في سكربت الصفحة: var VisaKindID = '13' (نفس أرقام قايمة «نوع التأشيرة» عندنا) */
    const m = /var\s+VisaKindID\s*=\s*'(\d+)'/.exec([...document.scripts].map((x) => x.textContent).join('\n'));
    const info = { docNumber: cut(labelValue('رقم المستند'), 20).replace(/\D/g, ''), docDate: cut(labelValue('تاريخ المستند'), 12), sponsorName: cut(labelValue('اسم الجهة الطالبة'), 100), visaKindId: m ? m[1] : '', rows };
    if (!rows.length) { bar('<div>⚠️ مفيش بيانات في مستند التأشيرة. تأكد من رقم المستند ورقم السجل.</div>'); return; }
    const r = await send({ kind: 'visainfo-doc', data: info });
    bar('<div><b>' + (r && r.ok ? '✅ بيانات المستند اتبعتت لملف الضبط' : '⚠️ مقدرتش أرجّع بيانات المستند') + '</b></div>' + (r && r.ok ? '' : '<div>' + esc((r && r.error) || 'جرّب تاني') + '</div>') + '<ul style="margin:4px 18px;padding:0">' + rows.map((x) => '<li>' + esc(x.visaKind) + ' — ' + esc(x.job) + ' — ' + esc(x.embassy) + ' — ' + esc(x.entries) + (x.residence ? ' — ' + esc(x.residence) + ' يوم' : '') + '</li>').join('') + '</ul>');
  }

  (async function run() {
    const { ctx } = await send({ kind: 'get-visainfo-ctx' }); if (!ctx) return;
    const phase = ctx.phase === 'inquiry' ? 'inquiry' : 'enjaz'; /* inquiry = الخطوة 2 */
    if (phase === 'enjaz') { if (isEnjazSearch()) await runSearch(ctx); else if (isEnjazResult()) await runResult(); }
    else if (isHomeSearch()) await runHomeSearch(ctx); else if (isDocResult()) await runDoc();
  })();
})();
