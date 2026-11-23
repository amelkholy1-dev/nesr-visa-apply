'use strict';
/* الوسيط بين نظام طلبات التأشيرات وصفحة الفورم في المنصة. كل البيانات بتتنقل جوه المتصفح بين تبويبين، مفيش أي سيرفر تالت. */
const FORM_URL = 'https://visa.mofa.gov.sa/SmartForm/TraditionalApp';
const WAFID_URL = 'https://wafid.com/ar/book-appointment/';
const LAB_URL = 'https://clab.mohp.gov.eg/booking';
const VISAINFO_URL = 'https://visa.mofa.gov.sa/enjaz/getvisainformation/person';
const VISADOC_URL = 'https://visa.mofa.gov.sa/Home/Index'; /* استعلام «مستند التأشيرة» (الخطوة 2) */
const LOGIN_URL = 'https://visa.mofa.gov.sa/Account/Login/enjazcompany';
const store = chrome.storage.session;
const APP_TAB_RE = /^https:\/\/[a-z0-9-]+\.nisrelkhaleeg\.com\//;

async function findAppTab(preferId) {
  if (preferId) { try { const t = await chrome.tabs.get(preferId); if (t && APP_TAB_RE.test(t.url || '')) return t; } catch (e) { /* اتقفل */ } }
  const tabs = await chrome.tabs.query({ url: ['https://*.nisrelkhaleeg.com/*'] });
  return tabs[0] || null;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.kind === 'open-fill') {
      const ctx = { ...msg.payload, originTabId: sender.tab && sender.tab.id, at: Date.now(), stage: 'opening' };
      let tab = null;
      const o = await store.get('formTab');
      if (o.formTab) { try { const t = await chrome.tabs.get(o.formTab); if (t && /^https:\/\/visa\.mofa\.gov\.sa\//.test(t.url || '')) tab = t; } catch (e) { /* اتقفل */ } }
      if (tab) { await store.set({ ['ctx_' + tab.id]: ctx }); await chrome.tabs.update(tab.id, { url: FORM_URL, active: true }); }
      else { tab = await chrome.tabs.create({ url: FORM_URL, active: true }); await store.set({ ['ctx_' + tab.id]: ctx, formTab: tab.id }); }
      reply({ ok: true });
    } else if (msg.kind === 'get-ctx') {
      const key = 'ctx_' + (sender.tab && sender.tab.id);
      const o = await store.get(key);
      reply({ ctx: o[key] || null });
    } else if (msg.kind === 'result') {
      const key = 'ctx_' + (sender.tab && sender.tab.id);
      const o = await store.get(key); const ctx = o[key] || {};
      const data = { ...(msg.data || {}), personId: ctx.personId };
      const t = await findAppTab(ctx.originTabId);
      if (!t) { await chrome.storage.local.set({ pendingResult: data }); reply({ ok: true, delivered: false }); return; }
      try { await chrome.tabs.sendMessage(t.id, { kind: 'va-result', data }); reply({ ok: true, delivered: true }); }
      catch (e) { await chrome.storage.local.set({ pendingResult: data }); reply({ ok: true, delivered: false }); }
    } else if (msg.kind === 'open-wafid') {
      /* حجز الفحص الطبي في وافد: تبويب جديد بنفس أسلوب فورم المنصة */
      const ctx = { ...msg.payload, originTabId: sender.tab && sender.tab.id, at: Date.now() };
      const tab = await chrome.tabs.create({ url: WAFID_URL, active: true });
      await store.set({ ['wctx_' + tab.id]: ctx });
      reply({ ok: true });
    } else if (msg.kind === 'get-wafid-ctx') {
      const key = 'wctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); reply({ ctx: o[key] || null });
    } else if (msg.kind === 'open-visainfo') {
      /* «التفويض على تأشيرة»: بنفتح صفحة البحث، والإضافة بتكتب الأرقام، والكابتشا و«بحث» بإيدك، وبعدها بنقرا النتيجة ونرجّعها لملف الضبط */
      const ctx = { ...msg.payload, originTabId: sender.tab && sender.tab.id, at: Date.now() };
      /* التبويب بيتفتح في الخلفية: إنت فاضل في النظام، والإضافة بتبعتلك صورة الكابتشا هناك وإنت اللي بتكتبها */
      const o = await store.get('visainfoTab'); if (o.visainfoTab) { try { await chrome.tabs.remove(o.visainfoTab); } catch (e) { /* اتقفل */ } }
      const tab = await chrome.tabs.create({ url: VISAINFO_URL, active: false });
      await store.set({ ['vctx_' + tab.id]: { ...ctx, inline: true, stage: '', phase: 'enjaz', doc: true }, visainfoTab: tab.id });
      reply({ ok: true });
    } else if (msg.kind === 'visainfo-ctl') {
      /* أوامر من صفحة النظام لتبويب المنصة: submit (الكابتشا اللي كتبتها) · refresh (صورة تانية) · open (افتح التبويب) · cancel */
      const o = await store.get('visainfoTab'); const tid = o.visainfoTab;
      if (!tid) { reply({ ok: false, error: 'مفيش بحث شغّال: دوس «بحث وجلب المهن» تاني' }); return; }
      try {
        if (msg.op === 'cancel') { await chrome.tabs.remove(tid); await store.remove('visainfoTab'); }
        else if (msg.op === 'open') { await chrome.tabs.update(tid, { active: true }); const t = await chrome.tabs.get(tid); if (t.windowId) await chrome.windows.update(t.windowId, { focused: true }); }
        else if (msg.op === 'refresh') await chrome.tabs.sendMessage(tid, { kind: 'vi-refresh' });
        else if (msg.op === 'submit') { const cap = String(msg.captcha || '').trim(); if (!/^[A-Za-z0-9]{1,8}$/.test(cap)) { reply({ ok: false, error: 'اكتب رمز الصورة زي ما هو' }); return; } await chrome.tabs.sendMessage(tid, { kind: 'vi-submit', captcha: cap }); }
        else { reply({ ok: false, error: 'أمر مش معروف' }); return; }
        reply({ ok: true });
      } catch (e) { await store.remove('visainfoTab'); reply({ ok: false, error: 'تبويب المنصة اتقفل: دوس «بحث وجلب المهن» تاني' }); }
    } else if (msg.kind === 'visainfo-captcha') {
      const key = 'vctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); const ctx = o[key] || {};
      const t = await findAppTab(ctx.originTabId);
      if (!t) { reply({ ok: false }); return; }
      try { await chrome.tabs.sendMessage(t.id, { kind: 'va-visainfo-captcha', data: msg.data }); reply({ ok: true }); } catch (e) { reply({ ok: false }); }
    } else if (msg.kind === 'visainfo-doc') {
      const key = 'vctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); const ctx = o[key] || {};
      const t = await findAppTab(ctx.originTabId);
      if (!t) { reply({ ok: false, error: 'افتح صفحة نظام طلبات التأشيرات (visa.nisrelkhaleeg.com) في تبويب وجرّب تاني' }); return; }
      try { await chrome.tabs.sendMessage(t.id, { kind: 'va-visainfo-doc', data: msg.data }); reply({ ok: true }); if (ctx.inline && sender.tab) { await store.remove('visainfoTab'); try { await chrome.tabs.remove(sender.tab.id); } catch (e) { /* اتقفل */ } } }
      catch (e) { reply({ ok: false, error: 'صفحة النظام مش بتردّ. اعمل F5 فيها وجرّب تاني' }); }
    } else if (msg.kind === 'visainfo-stage') {
      const key = 'vctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); if (o[key]) await store.set({ [key]: { ...o[key], stage: String(msg.stage || '') } }); reply({ ok: true });
    } else if (msg.kind === 'get-visainfo-ctx') {
      const key = 'vctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); reply({ ctx: o[key] || null });
    } else if (msg.kind === 'visainfo-result') {
      const key = 'vctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); const ctx = o[key] || {};
      const t = await findAppTab(ctx.originTabId);
      if (!t) { reply({ ok: false, error: 'افتح صفحة نظام طلبات التأشيرات (visa.nisrelkhaleeg.com) في تبويب وجرّب تاني' }); return; }
      try {
        await chrome.tabs.sendMessage(t.id, { kind: 'va-visainfo', data: msg.data }); reply({ ok: true });
        if (ctx.inline && sender.tab) {
          if (ctx.doc && ctx.phase !== 'inquiry') { await store.set({ [key]: { ...ctx, phase: 'inquiry', stage: '' } }); await chrome.tabs.update(sender.tab.id, { url: VISADOC_URL }); } /* الخطوة 2 في نفس التبويب */
          else { await store.remove('visainfoTab'); try { await chrome.tabs.remove(sender.tab.id); } catch (e) { /* اتقفل */ } }
        }
      }
      catch (e) { reply({ ok: false, error: 'صفحة النظام مش بتردّ. اعمل F5 فيها وجرّب تاني' }); }
    } else if (msg.kind === 'open-lab') {
      /* حجز المعمل (معامل الصحة العامة): تبويب جديد بنفس أسلوب وافد */
      const ctx = { ...msg.payload, originTabId: sender.tab && sender.tab.id, at: Date.now() };
      const tab = await chrome.tabs.create({ url: LAB_URL, active: true });
      await store.set({ ['lctx_' + tab.id]: ctx });
      reply({ ok: true });
    } else if (msg.kind === 'get-lab-ctx') {
      const key = 'lctx_' + (sender.tab && sender.tab.id); const o = await store.get(key); reply({ ctx: o[key] || null });
    } else if (msg.kind === 'lab-set') {
      /* خانة تاريخ في صفحة المعمل (APEX): بنحطها بدالة الصفحة نفسها عشان أحداثها تشتغل. بنقبل خانة واحدة معروفة وقيمة تاريخ بس */
      const id = String(msg.id || ''); const value = String(msg.value || '');
      if (id !== 'P2_DATE_OF_BIRTH' || !/^\d{2}-\d{2}-\d{4}$/.test(value)) { reply({ ok: false, why: 'قيمة غلط' }); return; }
      try {
        const [res] = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, world: 'MAIN', args: [id, value], func: (elId, v) => {
          try {
            const el = document.getElementById(elId); if (!el) return { ok: false, why: 'الخانة مش موجودة' };
            if (window.apex && window.apex.item) window.apex.item(elId).setValue(v);
            else { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
            return { ok: !!el.value, value: el.value };
          } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
        } });
        reply(res && res.result ? res.result : { ok: false, why: 'مفيش رد' });
      } catch (e) { reply({ ok: false, why: String(e && e.message || e) }); }
    } else if (msg.kind === 'wafid-date') {
      /* تاريخ في تقويم وافد: بنستخدم تقويم الصفحة نفسه (في عالم الصفحة) عشان الشكل يطلع زي ما الموقع عايزه */
      const id = String(msg.id || ''); const iso = String(msg.iso || '');
      if (!/^id_[a-z_]+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) { reply({ ok: false, why: 'قيمة غلط' }); return; }
      try {
        const [res] = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, world: 'MAIN', args: [id, iso], func: (elId, isoDate) => {
          try {
            const el = document.getElementById(elId); const $ = window.jQuery || window.$;
            if (!el) return { ok: false, why: 'الخانة مش موجودة' };
            const d = new Date(isoDate + 'T12:00:00');
            if ($ && $.fn && $.fn.calendar) {
              const cal = $(el).closest('.calendar-js, .ui.calendar');
              if (cal.length) {
                /* بنجرّب من غير ما نشغّل أحداث الموقع الخاصة بالتقويم (ساعات بتوقع بخطأ)، وبعدين بأحداثها، وبعدين تاريخ بس */
                let lastErr = '';
                for (const a of [[d, true, false], [d, true, true], [d]]) {
                  try { cal.calendar('set date', ...a); if (el.value) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, value: el.value }; } } catch (e) { lastErr = String(e && e.message || e); }
                }
                return { ok: false, why: lastErr || 'التقويم ما غيّرش القيمة' };
              }
            }
            return { ok: false, why: 'مفيش تقويم' };
          } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
        } });
        reply(res && res.result ? res.result : { ok: false, why: 'مفيش رد' });
      } catch (e) { reply({ ok: false, why: String(e && e.message || e) }); }
    } else if (msg.kind === 'next') {
      /* الطابور: الشخص التالي بيتطلب من صفحة النظام (هي اللي معاها الصلاحية تجيب بياناته) */
      const tid = sender.tab && sender.tab.id; const o = await store.get(['ctx_' + tid, 'wctx_' + tid, 'lctx_' + tid]);
      const target = o['lctx_' + tid] ? 'lab' : (o['wctx_' + tid] && !o['ctx_' + tid]) ? 'wafid' : 'mofa'; const ctx = o['ctx_' + tid] || o['wctx_' + tid] || o['lctx_' + tid] || {};
      const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
      if (!queue.length) { reply({ ok: false, error: 'الطابور خلص' }); return; }
      const t = await findAppTab(ctx.originTabId);
      if (!t) { reply({ ok: false, error: 'افتح صفحة نظام طلبات التأشيرات في تبويب (visa.nisrelkhaleeg.com) وجرّب تاني' }); return; }
      try { await chrome.tabs.sendMessage(t.id, { kind: 'va-next', data: { personId: queue[0].id, queue: queue.slice(1), total: ctx.queueTotal || (queue.length + 1), target } }); reply({ ok: true }); }
      catch (e) { reply({ ok: false, error: 'صفحة النظام مش بتردّ. اعمل F5 فيها وجرّب تاني' }); }
    } else if (msg.kind === 'app-ready') {
      const o = await chrome.storage.local.get('pendingResult');
      if (o.pendingResult) { await chrome.storage.local.remove('pendingResult'); reply({ pending: o.pendingResult }); } else reply({ pending: null });
    }
  })().catch((e) => reply({ error: String(e && e.message || e) }));
  return true;
});
/* المنصة بترجّع غير المسجّلين للرئيسية أو لصفحة الدخول. بنتابع تبويب الفورم:
   opening → (رجعنا للرئيسية) → login (بنفتح صفحة دخول الشركات) → المستخدم بيدخل بنفسه → retry (بنفتح الفورم تاني) → form.
   لو رجعنا تاني لغير الفورم: failed (بنقول للمستخدم يفتح الفورم بنفسه والإضافة هتملاه). */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  try {
    if (info.status !== 'complete') return;
    const key = 'ctx_' + tabId; const o = await store.get(key); const ctx = o[key];
    if (!ctx) return;
    const url = String(tab.url || '');
    if (!/^https:\/\/visa\.mofa\.gov\.sa\//.test(url)) return;
    let next = ctx.stage;
    if (/\/SmartForm\/TraditionalApp/i.test(url)) next = 'form';
    else if (/\/Account\/Login/i.test(url)) next = 'login';
    else if (ctx.stage === 'opening') { next = 'login'; await store.set({ [key]: { ...ctx, stage: next } }); await chrome.tabs.update(tabId, { url: LOGIN_URL }); return; }
    else if (ctx.stage === 'login') { next = 'retry'; await store.set({ [key]: { ...ctx, stage: next } }); await chrome.tabs.update(tabId, { url: FORM_URL }); return; }
    else if (ctx.stage === 'retry') next = 'failed';
    if (next !== ctx.stage) await store.set({ [key]: { ...ctx, stage: next } });
  } catch (e) { /* مش مهم */ }
});
chrome.tabs.onRemoved.addListener((id) => { store.remove(['ctx_' + id, 'wctx_' + id, 'lctx_' + id, 'vctx_' + id]).catch(() => {}); });
