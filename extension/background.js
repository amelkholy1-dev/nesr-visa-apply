'use strict';
/* الوسيط بين نظام طلبات التأشيرات وصفحة الفورم في المنصة. كل البيانات بتتنقل جوه المتصفح بين تبويبين، مفيش أي سيرفر تالت. */
const FORM_URL = 'https://visa.mofa.gov.sa/SmartForm/TraditionalApp';
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
      const ctx = { ...msg.payload, originTabId: sender.tab && sender.tab.id, at: Date.now() };
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
    } else if (msg.kind === 'app-ready') {
      const o = await chrome.storage.local.get('pendingResult');
      if (o.pendingResult) { await chrome.storage.local.remove('pendingResult'); reply({ pending: o.pendingResult }); } else reply({ pending: null });
    }
  })().catch((e) => reply({ error: String(e && e.message || e) }));
  return true;
});
chrome.tabs.onRemoved.addListener((id) => { store.remove('ctx_' + id).catch(() => {}); });
