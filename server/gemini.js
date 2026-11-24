'use strict';
/* مفاتيح Gemini (للقراءة التلقائية لصورة الجواز): أكتر من مفتاح من «الإعدادات»، والتبديل لوحده لو مفتاح خلص الكوتة.
   - المفاتيح بتتخزّن في جدول settings متشفّرة (AES-256-GCM بمفتاح مشتق من AUTH_SECRET)، ومبترجعش للواجهة غير آخر 4 حروف.
   - GEMINI_API_KEY (لو متظبط في الاستضافة) بيتحسب مفتاح زيادة في آخر القايمة.
   - الترتيب: المفاتيح المجانية الأول، والمدفوعة بعدها (عشان المدفوع ما يتصرفش إلا لما المجاني يخلص) — إلا لو الإعداد اتغيّر.
   - لو Google ردّت 429 (الكوتة خلصت): المفتاح بيستريّح (دقيقة لو كوتة الدقيقة، ولحد نص الليل بتوقيت أمريكا (Pacific) لو كوتة اليوم) ونجرّب اللي بعده. */
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const KEY = crypto.createHash('sha256').update('gemini-keys|' + config.authSecret).digest();
const enc = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return ['g1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':'); };
const dec = (s) => { try { const [v, iv, tag, ct] = String(s).split(':'); if (v !== 'g1') return ''; const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'); } catch (e) { return ''; } };
const mask = (k) => (k ? '••••' + String(k).slice(-4) : '');

const getSetting = async (k, def) => { const r = (await db.query('SELECT v FROM settings WHERE k = ?', [k]))[0]; if (!r) return def; try { return JSON.parse(r.v); } catch (e) { return def; } };
const setSetting = (k, v) => db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, JSON.stringify(v)]);

const DEFAULT_MODEL = config.geminiModel || 'gemini-2.5-flash';
/* اليوم بتوقيت Pacific (الكوتة اليومية في Gemini بتتجدد نص الليل بتوقيت Pacific) */
const pacificDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
function nextPacificMidnight(now = Date.now()) {
  const today = pacificDay(new Date(now));
  for (let t = now + 60e3; t < now + 26 * 3600e3; t += 60e3) if (pacificDay(new Date(t)) !== today) return t;
  return now + 24 * 3600e3;
}

/* الحالة (مرات الاستخدام النهارده، الراحة بعد 429، آخر خطأ) في الذاكرة + بتتحفظ */
let state = null;
async function loadState() { if (!state) { state = await getSetting('geminiState', {}); if (!state || typeof state !== 'object') state = {}; } return state; }
const saveState = () => setSetting('geminiState', state).catch(() => {});
const st = (id) => { if (!state[id]) state[id] = {}; const s = state[id]; const day = pacificDay(); if (s.day !== day) { s.day = day; s.used = 0; s.fails = 0; } return s; };

async function loadConf() {
  const c = await getSetting('gemini', {}); const keys = Array.isArray(c.keys) ? c.keys : [];
  return { model: String(c.model || '').trim() || DEFAULT_MODEL, paidLast: c.paidLast !== false, keys: keys.map((k) => ({ id: String(k.id), label: String(k.label || ''), paid: !!k.paid, enabled: k.enabled !== false, enc: String(k.enc || '') })) };
}
async function saveConf(c) { await setSetting('gemini', { model: c.model, paidLast: c.paidLast, keys: c.keys.map((k) => ({ id: k.id, label: k.label, paid: k.paid, enabled: k.enabled, enc: k.enc })) }); }

/* القايمة اللي بنجرّبها بالترتيب */
async function chain() {
  const c = await loadConf(); await loadState();
  let list = c.keys.filter((k) => k.enabled).map((k) => ({ id: k.id, label: k.label || 'مفتاح', paid: k.paid, key: dec(k.enc) })).filter((k) => k.key);
  if (c.paidLast) list = [...list.filter((k) => !k.paid), ...list.filter((k) => k.paid)];
  if (config.geminiKey) list.push({ id: 'env', label: 'مفتاح الاستضافة (GEMINI_API_KEY)', paid: false, key: config.geminiKey });
  return { model: c.model, list };
}
async function available() { try { return (await chain()).list.length > 0; } catch (e) { return !!config.geminiKey; } }

const base = () => process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const errText = async (r) => { try { const j = await r.json(); return String((j.error && (j.error.message || j.error.status)) || '').slice(0, 300); } catch (e) { return ''; } };

/* طلب واحد لـ generateContent مع التبديل بين المفاتيح */
async function generate(body) {
  const { model, list } = await chain();
  if (!list.length) { const e = new Error('القراءة التلقائية مش متفعّلة: ضيف مفتاح Gemini من «الإعدادات» (أو الصق سطري MRZ بإيدك).'); e.status = 501; throw e; }
  const now = Date.now(); const tried = []; let lastErr = '';
  for (const k of list) {
    const s = st(k.id);
    if (s.restUntil && s.restUntil > now) { tried.push(k.label + ': مستريّح (الكوتة خلصت)'); continue; }
    let r;
    try { r = await fetch(`${base()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }); }
    catch (e) { s.lastError = 'مفيش اتصال: ' + String(e && e.message || e).slice(0, 120); s.lastErrorAt = Date.now(); lastErr = s.lastError; tried.push(k.label + ': ' + s.lastError); continue; }
    if (r.ok) { s.used = (s.used || 0) + 1; s.lastOkAt = Date.now(); s.lastError = ''; saveState(); return { json: await r.json(), keyLabel: k.label }; }
    const msg = await errText(r);
    if (r.status === 429) {
      const daily = /per\s*day|PerDay|daily/i.test(msg);
      s.restUntil = daily ? nextPacificMidnight() : Date.now() + 65e3; s.lastError = (daily ? 'كوتة اليوم خلصت' : 'كوتة الدقيقة خلصت') + (msg ? ' — ' + msg.slice(0, 140) : ''); s.lastErrorAt = Date.now();
      lastErr = s.lastError; tried.push(k.label + ': ' + (daily ? 'كوتة اليوم خلصت' : 'كوتة الدقيقة خلصت')); continue;
    }
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      const bad = /API key|API_KEY|permission|PERMISSION|not valid|invalid/i.test(msg);
      s.lastError = (bad ? 'المفتاح مش شغّال: ' : 'رفض (' + r.status + '): ') + msg.slice(0, 160); s.lastErrorAt = Date.now(); lastErr = s.lastError;
      if (bad) { s.restUntil = Date.now() + 10 * 60e3; tried.push(k.label + ': المفتاح مش شغّال'); continue; }
      saveState(); const e = new Error('خدمة القراءة رفضت الطلب (' + r.status + '): ' + msg.slice(0, 160)); e.status = 502; throw e;
    }
    if (r.status === 404) { s.lastError = 'الموديل «' + model + '» مش موجود: ' + msg.slice(0, 120); s.lastErrorAt = Date.now(); saveState(); const e = new Error('موديل Gemini «' + model + '» مش موجود: غيّره من «الإعدادات»'); e.status = 502; throw e; }
    /* 5xx: الخدمة مضغوطة ← نجرّب المفتاح اللي بعده */
    s.lastError = 'الخدمة ردّت ' + r.status + (msg ? ': ' + msg.slice(0, 120) : ''); s.lastErrorAt = Date.now(); lastErr = s.lastError; tried.push(k.label + ': ' + r.status);
  }
  saveState();
  const allRest = list.every((k) => st(k.id).restUntil > Date.now());
  const e = new Error(allRest ? 'كل مفاتيح Gemini خلصت الكوتة بتاعتها دلوقتي. استنى شوية (أو للنهارده الجاي)، أو ضيف مفتاح تاني من «الإعدادات». ممكن تلصق سطري MRZ بإيدك.' : 'فشل الاتصال بخدمة القراءة: ' + (tried.join(' · ') || lastErr));
  e.status = allRest ? 429 : 502; throw e;
}

/* تجربة مفتاح: بنسأل عن الموديل (مش بيصرف من الكوتة) */
async function testKey(key, model) {
  try {
    const r = await fetch(`${base()}/v1beta/models/${encodeURIComponent(model || DEFAULT_MODEL)}`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) });
    if (r.ok) return { ok: true, message: 'المفتاح شغّال والموديل موجود' };
    const msg = await errText(r);
    if (r.status === 404) return { ok: false, message: 'المفتاح شغّال بس الموديل «' + (model || DEFAULT_MODEL) + '» مش موجود' };
    return { ok: false, message: (r.status === 400 || r.status === 403 ? 'المفتاح مش شغّال' : 'رد ' + r.status) + (msg ? ': ' + msg.slice(0, 160) : '') };
  } catch (e) { return { ok: false, message: 'مفيش اتصال بـ Google: ' + String(e && e.message || e).slice(0, 120) }; }
}

/* للواجهة: من غير المفاتيح نفسها */
async function overview() {
  const c = await loadConf(); await loadState(); const now = Date.now();
  const row = (id, label, paid, enabled, fromEnv, masked) => { const s = st(id); return { id, label, paid, enabled, fromEnv, masked, usedToday: s.used || 0, resting: !!(s.restUntil && s.restUntil > now), restUntil: s.restUntil && s.restUntil > now ? new Date(s.restUntil).toISOString() : '', lastError: s.lastError || '', lastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : '', lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : '' }; };
  const keys = c.keys.map((k) => row(k.id, k.label, k.paid, k.enabled, false, mask(dec(k.enc))));
  if (config.geminiKey) keys.push(row('env', 'مفتاح الاستضافة (GEMINI_API_KEY)', false, true, true, mask(config.geminiKey)));
  return { model: c.model, defaultModel: DEFAULT_MODEL, paidLast: c.paidLast, keys, pacificDay: pacificDay() };
}
async function addKey({ label, key, paid }) {
  const k = String(key || '').trim(); if (!/^[A-Za-z0-9_\-]{20,120}$/.test(k)) { const e = new Error('المفتاح شكله مش صح (بيبدأ عادة بـ AIza وطوله حوالي 39 حرف)'); e.status = 400; throw e; }
  const c = await loadConf(); if (c.keys.length >= 20) { const e = new Error('أقصى حاجة 20 مفتاح'); e.status = 400; throw e; }
  if (c.keys.some((x) => dec(x.enc) === k)) { const e = new Error('المفتاح ده متضاف قبل كده'); e.status = 409; throw e; }
  const id = 'k' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  c.keys.push({ id, label: String(label || '').trim().slice(0, 60) || 'مفتاح ' + (c.keys.length + 1), paid: !!paid, enabled: true, enc: enc(k) }); await saveConf(c); return id;
}
async function updateKey(id, b) {
  const c = await loadConf(); const k = c.keys.find((x) => x.id === id); if (!k) { const e = new Error('المفتاح مش موجود'); e.status = 404; throw e; }
  if (b.label !== undefined) k.label = String(b.label || '').trim().slice(0, 60) || k.label; if (b.paid !== undefined) k.paid = !!b.paid; if (b.enabled !== undefined) k.enabled = !!b.enabled;
  if (b.resetRest) { await loadState(); const s = st(id); s.restUntil = 0; s.lastError = ''; saveState(); }
  if (b.move === 'up' || b.move === 'down') { const i = c.keys.indexOf(k); const j = b.move === 'up' ? i - 1 : i + 1; if (j >= 0 && j < c.keys.length) [c.keys[i], c.keys[j]] = [c.keys[j], c.keys[i]]; }
  await saveConf(c);
}
async function removeKey(id) { const c = await loadConf(); c.keys = c.keys.filter((x) => x.id !== id); await saveConf(c); await loadState(); delete state[id]; saveState(); }
async function setOptions(b) { const c = await loadConf(); if (b.model !== undefined) { const m = String(b.model || '').trim(); if (m && !/^[a-z0-9.\-]{3,60}$/i.test(m)) { const e = new Error('اسم الموديل مش صح'); e.status = 400; throw e; } c.model = m || DEFAULT_MODEL; } if (b.paidLast !== undefined) c.paidLast = !!b.paidLast; await saveConf(c); }
async function test(id) {
  const c = await loadConf(); const key = id === 'env' ? config.geminiKey : dec((c.keys.find((x) => x.id === id) || {}).enc || '');
  if (!key) return { ok: false, message: 'المفتاح مش موجود' };
  const r = await testKey(key, c.model); await loadState(); const s = st(id); if (r.ok) { s.lastError = ''; s.restUntil = 0; } else { s.lastError = r.message; s.lastErrorAt = Date.now(); } saveState(); return r;
}

module.exports = { generate, available, overview, addKey, updateKey, removeKey, setOptions, test, pacificDay, nextPacificMidnight, _enc: enc, _dec: dec };
