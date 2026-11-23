'use strict';
/* الطباعة من جوه النظام: ضبط الليبل + إرسال أوامر الطباعة لبرنامج Masar Print Agent + تجهيز طباعة الشخص (باركود رقم الطلب + باركود التأشيرة + خطاب الترشيح) */
const express = require('express');
const db = require('../db');
const config = require('../config');
const F = require('../fields');
const R = require('../readiness');
const letters = require('../letters');
const P = require('../perms');
const audit = require('../audit');

const router = express.Router();
const json = (v, d) => { try { const x = JSON.parse(v); return x === null || x === undefined ? d : x; } catch (e) { return d; } };

/* نفس القيم الافتراضية لإعدادات ليبل رقم الطلب في نظام الجوازات (52×31 مم، 203 dpi، باركود Code128) */
const DEFAULTS = { outputMode: 'barcode_text', labelWidthMm: 52, labelHeightMm: 31, dpi: 203, printCopies: 1, printAgentId: '', printAgentPrinterName: '', density: 15, speed: 3, gapDots: 16, mediaType: 'G', orientation: 'T',
  barcodeXmm: 4, barcodeYmm: 3, barcodeWidthMm: 44, barcodeHeightMm: 19, barcodeNarrow: 2, barcodeWide: 5, textXmm: 2, textYmm: 23, textWidthMm: 48, textHeightMm: 6, textFontSize: 20, textBold: false, showText: true };
const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number(v) || d));
function sanitize(x) {
  const t = { ...DEFAULTS, ...(x || {}) };
  t.labelWidthMm = Math.max(20, Number(t.labelWidthMm) || DEFAULTS.labelWidthMm); t.labelHeightMm = Math.max(15, Number(t.labelHeightMm) || DEFAULTS.labelHeightMm); t.dpi = Math.max(100, Number(t.dpi) || 203);
  t.printCopies = clamp(t.printCopies, 1, 20, 1); t.density = clamp(t.density, 1, 30, 15); t.speed = clamp(t.speed, 1, 6, 3); t.gapDots = Math.max(0, Number(t.gapDots) || 16);
  t.barcodeNarrow = clamp(t.barcodeNarrow, 1, 4, 2); t.barcodeWide = Math.max(t.barcodeNarrow + 1, Math.min(8, Number(t.barcodeWide) || 5));
  for (const k of ['barcodeXmm', 'barcodeYmm', 'textXmm', 'textYmm']) t[k] = Math.max(0, Number(t[k]) || 0);
  t.barcodeWidthMm = Math.max(10, Number(t.barcodeWidthMm) || 44); t.barcodeHeightMm = Math.max(4, Number(t.barcodeHeightMm) || 19); t.textWidthMm = Math.max(10, Number(t.textWidthMm) || 48); t.textHeightMm = Math.max(3, Number(t.textHeightMm) || 6); t.textFontSize = clamp(t.textFontSize, 8, 42, 20);
  t.outputMode = ['barcode_text', 'barcode_only', 'text_only'].includes(t.outputMode) ? t.outputMode : 'barcode_text';
  t.mediaType = ['G', 'I', 'B'].includes(String(t.mediaType)) ? String(t.mediaType) : 'G'; t.orientation = ['T', 'B'].includes(String(t.orientation)) ? String(t.orientation) : 'T';
  t.printAgentId = String(t.printAgentId || '').trim().slice(0, 120); t.printAgentPrinterName = String(t.printAgentPrinterName || '').trim().slice(0, 200);
  t.textBold = !!t.textBold; t.showText = t.outputMode !== 'barcode_only' && t.showText !== false;
  return t;
}
const getSettings = async () => { const r = (await db.query("SELECT v FROM settings WHERE k = 'labelPrint'"))[0]; return sanitize(r ? json(r.v, {}) : {}); };
const agentOut = (r) => ({ agentId: r.agent_id, agentName: r.name, computerName: r.computer, printers: json(r.printers, []), defaultPrinter: r.default_printer, agentVersion: r.version, lastSeenAt: r.last_seen, isOnline: !!r.last_seen && Date.now() - new Date(r.last_seen).getTime() <= 90000 });

router.get('/info', P.need('people.fill'), async (req, res) => {
  try {
    const key = String(config.printAgentKey || ''); const agents = (await db.query('SELECT * FROM print_agents ORDER BY last_seen DESC')).map(agentOut);
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0]; const host = req.headers['x-forwarded-host'] || req.headers.host;
    res.json({ configured: key.length >= 16, agentUrl: P.has(req, 'users.manage') && key.length >= 16 ? `${proto}://${host}/print-agent/${encodeURIComponent(key)}` : '', agents, settings: await getSettings(), canManage: P.has(req, 'users.manage') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/settings', P.need('users.manage'), async (req, res) => {
  try { const s = sanitize(req.body); await db.query("INSERT INTO settings (k, v) VALUES ('labelPrint', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(s)]); audit.log(req, 'settings', null, '', 'إعدادات طباعة الليبل'); res.json({ ok: true, settings: s }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* أمر طباعة ليبل: الجهاز والطابعة من الإعدادات. بنرفض لو الجهاز مش متصل (زي نظام الجوازات) */
router.post('/jobs', P.need('people.fill'), async (req, res) => {
  try {
    const b = req.body || {}; const s = await getSettings();
    const payload = b.payload; if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload).length > 600000) return res.status(400).json({ error: 'بيانات الليبل غير صالحة' });
    const agents = await db.query('SELECT * FROM print_agents ORDER BY last_seen DESC'); const online = agents.map(agentOut).filter((a) => a.isOnline);
    let agent = s.printAgentId ? agents.map(agentOut).find((a) => a.agentId === s.printAgentId) : (online.length === 1 ? online[0] : null);
    if (!agent) return res.status(400).json({ error: s.printAgentId ? 'جهاز الطباعة المختار مش مسجّل. افتح برنامج الطباعة واضغط «حفظ وتشغيل».' : online.length ? 'فيه أكتر من جهاز طباعة: اختار واحد من الإعدادات ← طباعة الباركود.' : 'مفيش جهاز طباعة متصل. شغّل برنامج طباعة الباركود على جهاز الطابعة (التفاصيل في الإعدادات).' });
    if (!agent.isOnline) return res.status(409).json({ error: `جهاز الطباعة «${agent.agentName || agent.agentId}» مش متصل دلوقتي. افتح برنامج الطباعة على جهازه واضغط «حفظ وتشغيل».` });
    const printer = s.printAgentPrinterName || agent.defaultPrinter || (agent.printers[0] && agent.printers[0].name) || '';
    if (s.printAgentPrinterName && agent.printers.length && !agent.printers.some((p) => p.name === s.printAgentPrinterName)) return res.status(400).json({ error: `الطابعة المحفوظة (${s.printAgentPrinterName}) مش موجودة على جهاز الطباعة دلوقتي. اختار الطابعة تاني من الإعدادات.` });
    const copies = Math.min(Math.max(parseInt(b.copies, 10) || 1, 1), 50);
    const r = await db.query("INSERT INTO print_jobs (agent_id, printer_name, job_type, batch_id, payload, copies, status, person_id, label, created_by) VALUES (?, ?, 'barcode_label', ?, ?, ?, 'pending', ?, ?, ?)",
      [agent.agentId, printer, String(b.batchId || '').slice(0, 120) || null, JSON.stringify(payload), copies, parseInt(b.personId, 10) || null, String(b.label || '').slice(0, 120), req.user.id]);
    audit.log(req, 'print', parseInt(b.personId, 10) || null, '', 'طباعة ' + (String(b.label || 'ليبل')) + ' — ' + copies + ' نسخة');
    res.json({ ok: true, jobId: r.insertId, agentName: agent.agentName, printerName: printer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/jobs/:id(\\d+)', P.need('people.fill'), async (req, res) => {
  try { const j = (await db.query('SELECT id, status, error, created_at, picked_at, printed_at FROM print_jobs WHERE id = ?', [req.params.id]))[0]; if (!j) return res.status(404).json({ error: 'مش موجود' }); res.json({ id: j.id, status: j.status, error: j.error || '', createdAt: j.created_at, printedAt: j.printed_at }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* تجهيز طباعة الشخص: إيه اللي هيتطبع وإيه الناقص */
router.get('/pack/:id(\\d+)', P.need('people.fill'), async (req, res) => {
  try {
    const row = (await db.query('SELECT * FROM people WHERE id = ?', [req.params.id]))[0]; if (!row) return res.status(404).json({ error: 'الشخص مش موجود' });
    const prof = row.profile_id ? (await db.query('SELECT name, data FROM profiles WHERE id = ?', [row.profile_id]))[0] : null;
    const pdata = prof ? json(prof.data, {}) : {}; const v = F.resolve(json(row.data, {}), pdata, {}).values;
    const kind = String(v.embassy) === '302' ? 'cairo' : String(v.embassy) === '320' ? 'suez' : '';
    const vars = R.letterVars(row, v); const missing = [];
    if (!row.app_number) missing.push('رقم الطلب (إنجاز) مش مسجّل: سجّله أو دوس «هات رقم إنجاز»');
    if (!pdata.visaNumber) missing.push('رقم التأشيرة ناقص في الدفعة');
    if (!kind) missing.push('الممثلية مش السويس ولا القاهرة: اختار نوع الخطاب بإيدك');
    const lc = kind ? letters.check(kind, vars) : { issues: [] };
    res.json({ personId: row.id, name: row.name_ar, passportNo: row.passport_no, appNumber: row.app_number || '', visaNumber: String(pdata.visaNumber || ''), embassy: String(v.embassy || ''), letterKind: kind, letterIssues: lc.issues || [], missing, batch: prof ? prof.name : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.sanitize = sanitize;
