'use strict';
/* بيشتغل جوه نظام طلبات التأشيرات: بيسمع زرار «املى الطلب» ويبعت البيانات للوسيط، وبيرجّع نتيجة الملء/رقم الطلب للصفحة. */
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  const post = (type, data) => window.postMessage({ source: 'nesr-visaapply-ext', type, data, version: VERSION }, window.location.origin);

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (!m || m.source !== 'nesr-visaapply') return;
    if (m.type === 'VA_PING') { post('VA_READY'); return; }
    if (m.type === 'VA_WAFID' && m.data && m.data.wafid) {
      try {
        chrome.runtime.sendMessage({ kind: 'open-wafid', payload: { personId: String(m.data.personId || ''), name: String(m.data.name || '').slice(0, 120), wafid: m.data.wafid, issues: m.data.issues || [], warns: m.data.warns || [], queue: Array.isArray(m.data.queue) ? m.data.queue.slice(0, 200).map((x) => ({ id: String(x.id), name: String(x.name || '').slice(0, 80) })) : [], queueTotal: Number(m.data.queueTotal) || 0 } }, (r) => {
          if (chrome.runtime.lastError || !r || !r.ok) post('VA_ERROR', { message: 'الإضافة اتحدّثت أو اتقفلت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); else post('VA_ACK', {});
        });
      } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_LAB' && m.data && m.data.lab) {
      try {
        chrome.runtime.sendMessage({ kind: 'open-lab', payload: { personId: String(m.data.personId || ''), name: String(m.data.name || '').slice(0, 120), lab: m.data.lab, issues: m.data.issues || [], warns: m.data.warns || [], queue: Array.isArray(m.data.queue) ? m.data.queue.slice(0, 200).map((x) => ({ id: String(x.id), name: String(x.name || '').slice(0, 80) })) : [], queueTotal: Number(m.data.queueTotal) || 0 } }, (r) => {
          if (chrome.runtime.lastError || !r || !r.ok) post('VA_ERROR', { message: 'الإضافة اتحدّثت أو اتقفلت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); else post('VA_ACK', {});
        });
      } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_VISAINFO' && m.data) {
      try {
        chrome.runtime.sendMessage({ kind: 'open-visainfo', payload: { name: String(m.data.name || '').slice(0, 120), visaNumber: String(m.data.visaNumber || '').replace(/\D/g, '').slice(0, 20), unifiedNumber: String(m.data.unifiedNumber || '').replace(/\D/g, '').slice(0, 10), mode: ['doc', 'info'].includes(m.data.mode) ? m.data.mode : '', embassy: String(m.data.embassy || '').replace(/\D/g, '').slice(0, 6) } }, (r) => {
          if (chrome.runtime.lastError || !r || !r.ok) post('VA_ERROR', { message: 'الإضافة اتحدّثت أو اتقفلت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); else post('VA_ACK', {});
        });
      } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_VISAINFO_CTL' && m.data) {
      try { chrome.runtime.sendMessage({ kind: 'visainfo-ctl', op: String(m.data.op || ''), captcha: String(m.data.captcha || '').slice(0, 12) }, (r) => { if (chrome.runtime.lastError || !r || !r.ok) post('VA_VISAINFO_CAPTCHA', { error: true, message: (r && r.error) || 'الإضافة ما ردّتش. اعمل F5 للصفحة وجرّب تاني.' }); }); } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_APPNO' && m.data) {
      try {
        const d = m.data; const clean = (v, n) => String(v == null ? '' : v).slice(0, n);
        chrome.runtime.sendMessage({ kind: 'open-appno', payload: { personId: clean(d.personId, 12), name: clean(d.name, 120), passportNo: clean(d.passportNo, 20).toUpperCase().replace(/[^A-Z0-9]/g, ''), nationality: clean(d.nationality, 3).toUpperCase().replace(/[^A-Z]/g, ''), visaType: clean(d.visaType, 4).replace(/\D/g, ''), embassy: clean(d.embassy, 4).replace(/\D/g, '') } }, (r) => {
          if (chrome.runtime.lastError || !r || !r.ok) post('VA_ERROR', { message: 'الإضافة اتحدّثت أو اتقفلت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); else post('VA_ACK', {});
        });
      } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_NETPRINT' && m.data) {
      try { chrome.runtime.sendMessage({ kind: 'open-netprint', payload: { appNo: String(m.data.appNo || '').replace(/\D/g, '').slice(0, 12), name: String(m.data.name || '').slice(0, 120) } }, (r) => { if (chrome.runtime.lastError || !r || !r.ok) post('VA_ERROR', { message: 'الإضافة اتحدّثت أو قديمة (طباعة ورقة النت محتاجة 1.16.0). اعمل Reload للإضافة وF5 للصفحة.' }); else post('VA_ACK', {}); }); } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_APPNO_CTL' && m.data) {
      try { chrome.runtime.sendMessage({ kind: 'appno-ctl', op: String(m.data.op || ''), captcha: String(m.data.captcha || '').slice(0, 12) }, (r) => { if (chrome.runtime.lastError || !r || !r.ok) post('VA_APPNO_CAPTCHA', { error: true, message: (r && r.error) || 'الإضافة ما ردّتش. اعمل F5 للصفحة وجرّب تاني.' }); }); } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
      return;
    }
    if (m.type === 'VA_FILL' && m.data && m.data.mofa) {
      try {
        chrome.runtime.sendMessage({ kind: 'open-fill', payload: { personId: String(m.data.personId || ''), name: String(m.data.name || '').slice(0, 120), mofa: m.data.mofa, issues: m.data.issues || [], warns: m.data.warns || [], photo: typeof m.data.photo === 'string' && m.data.photo.startsWith('data:image/') ? m.data.photo : '', queue: Array.isArray(m.data.queue) ? m.data.queue.slice(0, 200).map((x) => ({ id: String(x.id), name: String(x.name || '').slice(0, 80) })) : [], queueTotal: Number(m.data.queueTotal) || 0 } }, (r) => {
          if (chrome.runtime.lastError || !r || !r.ok) post('VA_ERROR', { message: 'الإضافة اتحدّثت أو اتقفلت. اعمل تحديث للصفحة (F5) وجرّب تاني.' });
          else post('VA_ACK', {});
        });
      } catch (err) { post('VA_ERROR', { message: 'الإضافة اتحدّثت. اعمل تحديث للصفحة (F5) وجرّب تاني.' }); }
    }
  });
  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.kind === 'va-result') post('VA_RESULT', msg.data); if (msg && msg.kind === 'va-next') post('VA_NEXT', msg.data); if (msg && msg.kind === 'va-visainfo') post('VA_VISAINFO_RESULT', msg.data); if (msg && msg.kind === 'va-visainfo-captcha') post('VA_VISAINFO_CAPTCHA', msg.data); if (msg && msg.kind === 'va-visainfo-doc') post('VA_VISAINFO_DOC', msg.data); if (msg && msg.kind === 'va-visainfo-status') post('VA_VISAINFO_STATUS', msg.data); if (msg && msg.kind === 'va-appno-captcha') post('VA_APPNO_CAPTCHA', msg.data); if (msg && msg.kind === 'va-appno-result') post('VA_APPNO_RESULT', msg.data); if (msg && msg.kind === 'va-appno-status') post('VA_APPNO_STATUS', msg.data); });
  const ready = () => { post('VA_READY'); chrome.runtime.sendMessage({ kind: 'app-ready' }, (r) => { if (r && r.pending) setTimeout(() => post('VA_RESULT', r.pending), 800); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  setTimeout(() => post('VA_READY'), 1500); setTimeout(() => post('VA_READY'), 4000);
})();
