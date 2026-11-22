'use strict';
/* الوسيط بين نظام طلبات التأشيرات وصفحة الفورم في المنصة. كل البيانات بتتنقل جوه المتصفح بين تبويبين، مفيش أي سيرفر تالت. */
const FORM_URL = 'https://visa.mofa.gov.sa/SmartForm/TraditionalApp';
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
    } else if (msg.kind === 'next') {
      /* الطابور: الشخص التالي بيتطلب من صفحة النظام (هي اللي معاها الصلاحية تجيب بياناته) */
      const key = 'ctx_' + (sender.tab && sender.tab.id);
      const o = await store.get(key); const ctx = o[key] || {};
      const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
      if (!queue.length) { reply({ ok: false, error: 'الطابور خلص' }); return; }
      const t = await findAppTab(ctx.originTabId);
      if (!t) { reply({ ok: false, error: 'افتح صفحة نظام طلبات التأشيرات في تبويب (visa.nisrelkhaleeg.com) وجرّب تاني' }); return; }
      try { await chrome.tabs.sendMessage(t.id, { kind: 'va-next', data: { personId: queue[0].id, queue: queue.slice(1), total: ctx.queueTotal || (queue.length + 1) } }); reply({ ok: true }); }
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
chrome.tabs.onRemoved.addListener((id) => { store.remove('ctx_' + id).catch(() => {}); });
