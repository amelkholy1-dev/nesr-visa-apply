'use strict';
/* بيشتغل على صفحة «التفويض على تأشيرة» في منصة التأشيرات (visa.mofa.gov.sa/enjaz/getvisainformation/person) ونتيجتها (…/ViewVisaDetails/person)
   لما تدوس «هات بيانات التأشيرة من المنصة» في ملف الضبط:
   1) صفحة البحث: بيكتب رقم الصادر والرقم الموحد (رقم السجل) ويختار جهة القدوم. اللي مبيلمسوش: رمز الصورة (الكابتشا) وزرار «بحث» — بإيدك.
   2) صفحة النتيجة: بيقرا اسم الجهة والرقم الموحد والمهنة والعدد المتبقي ويرجّعهم لملف الضبط في النظام (بتراجعهم وتدوس حفظ). */
(function () {
  const isSearch = () => !!document.getElementById('VisaNumber') && !!document.getElementById('SponserID');
  const isResult = () => !!document.getElementById('dvJobsGrid') && !!document.getElementById('EmbassyID');
  if (!isSearch() && !isResult()) return;
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
  async function runSearch(ctx) {
    const problems = [];
    const put = (id, v, label) => { const el = document.getElementById(id); if (!el) return problems.push(label + ': الخانة مش موجودة'); if (!v) { problems.push(label + ' فاضي في ملف الضبط'); return mark(el); } Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); fire(el); };
    put('VisaNumber', ctx.visaNumber, 'رقم الصادر'); put('SponserID', ctx.unifiedNumber, 'الرقم الموحد (رقم السجل)');
    const em = document.getElementById('Embassy');
    if (em && ctx.embassy) {
      const o = [...em.options].find((x) => String(x.value) === String(ctx.embassy));
      if (o) { em.value = o.value; fire(em); await sleep(300); if (String(em.value) !== String(o.value)) problems.push('جهة القدوم: اختارها بإيدك'); } else problems.push('جهة القدوم: مش لاقي الممثلية في القايمة — اختارها بإيدك');
    } else problems.push('جهة القدوم: اختارها بإيدك (الممثلية مش متحدّدة في ملف الضبط)');
    mark(document.getElementById('Captcha'));
    bar('<div><b>🔎 ' + esc(ctx.name || 'ملف الضبط') + '</b> — اتكتبت الأرقام. دلوقتي:</div><ol style="margin:4px 18px;padding:0"><li>اكتب <b>رمز الصورة</b> (الكابتشا)</li><li>دوس <b>«بحث»</b></li></ol><div>بعد النتيجة هقرا البيانات وأرجّعها لملف الضبط.</div>' +
      (problems.length ? '<div style="margin-top:6px">ℹ️</div><ul style="margin:4px 18px;padding:0">' + problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''));
  }

  /* صفحة النتيجة */
  const labelValue = (label) => { for (const l of document.querySelectorAll('label.control-label')) { if (norm(l.textContent) === label) { const d = l.nextElementSibling; return d ? norm(d.textContent) : ''; } } return ''; };
  async function runResult() {
    bar('<span>🔎 بقرا بيانات التأشيرة من النتيجة…</span>');
    await waitFor(() => document.querySelector('#dvJobsGrid tr.jtable-data-row, #dvJobsGrid tr.jtable-no-data-row'), 15000);
    const sel = document.getElementById('EmbassyID'); const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
    const jobs = [...document.querySelectorAll('#dvJobsGrid tr.jtable-data-row')].slice(0, 30).map((tr) => { const td = [...tr.children].map((c) => norm(c.textContent)); return { count: cut(td[0], 6), job: cut(td[1], 60), nationality: cut(td[2], 30), embassy: cut(td[3], 30), remaining: cut(td[4], 6) }; });
    const info = { visaNumber: cut(labelValue('رقم الصادر'), 20), visaDate: cut(labelValue('تاريخ التأشيرة'), 12), sponsorName: cut(labelValue('الاسم'), 100), unifiedNumber: cut(labelValue('رقم الإقامة'), 12).replace(/\D/g, '').slice(0, 10), embassyCode: sel ? String(sel.value || '').replace(/\D/g, '').slice(0, 6) : '', embassyName: opt ? cut(opt.textContent, 30) : '', jobs };
    if (!info.sponsorName && !info.unifiedNumber && !jobs.length) { bar('<div>⚠️ مقدرتش أقرا بيانات من الصفحة دي. اتأكد إنها نتيجة البحث، وجرّب تاني.</div>'); return; }
    const r = await send({ kind: 'visainfo-result', data: info });
    bar('<div><b>' + (r && r.ok ? '✅ البيانات اتبعتت لملف الضبط' : '⚠️ مقدرتش أرجّع البيانات') + '</b></div>' + (r && r.ok ? '<div>ارجع لتبويب النظام: راجع الخانات ودوس <b>حفظ</b>.</div>' : '<div>' + esc((r && r.error) || 'جرّب تاني') + '</div>') +
      '<ul style="margin:4px 18px;padding:0"><li>جهة العمل: ' + esc(info.sponsorName) + '</li><li>الرقم الموحد: ' + esc(info.unifiedNumber) + '</li><li>جهة القدوم: ' + esc(info.embassyName) + '</li>' + jobs.map((j) => '<li>' + esc(j.job) + ' — ' + esc(j.nationality) + ' — العدد ' + esc(j.count) + '، المتبقي ' + esc(j.remaining) + '</li>').join('') + '</ul>');
  }

  (async function run() {
    const { ctx } = await send({ kind: 'get-visainfo-ctx' }); if (!ctx) return;
    if (isSearch()) await runSearch(ctx); else await runResult();
  })();
})();
