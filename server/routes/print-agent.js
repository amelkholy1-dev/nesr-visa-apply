'use strict';
/* بروتوكول برنامج طباعة الباركود (Masar Print Agent) — نفس مسارات ومعاني نظام الجوازات بالظبط، عشان نفس البرنامج يشتغل مع النظام ده:
   البرنامج بيدخل بمفتاح PRINT_AGENT_KEY (هيدر X-Agent-Key أو عنوان https://الموقع/print-agent/<المفتاح>) من غير تسجيل دخول:
   POST /agents/register · GET /agents/:agentId/jobs/next · POST /agents/:agentId/jobs/:jobId/status · GET /print-agent/health · GET /print-server/health */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');

const router = express.Router();
const agentlog = require('../agentlog');
const json = (v, d) => { try { const x = JSON.parse(v); return x === null || x === undefined ? d : x; } catch (e) { return d; } };

const keyOk = (req) => {
  const want = String(config.printAgentKey || ''); const got = String(req.get('x-agent-key') || '');
  if (want.length < 16 || !got) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(got).digest(), crypto.createHash('sha256').update(want).digest());
};
router.use((req, res, next) => {
  if (!req._agentLogged) { const method = req.method, p0 = (req.baseUrl + req.path); res.on('finish', () => agentlog.push({ method, path: p0, status: res.statusCode, ip: String(req.ip || '') })); }
  if (keyOk(req)) return next();
  res.status(403).json({ success: false, error: String(config.printAgentKey || '').length < 16 ? 'مفتاح برنامج الطباعة مش متظبط على السيرفر (PRINT_AGENT_KEY لازم 16 حرف على الأقل)' : 'مفتاح برنامج الطباعة غلط' });
});

router.post('/agents/register', async (req, res) => {
  try {
    const b = req.body || {}; const id = String(b.agentId || b.computerName || '').trim().slice(0, 120);
    if (!id) return res.status(400).json({ success: false, error: 'AgentID غير موجود' });
    const printers = (Array.isArray(b.printers) ? b.printers : []).map((p) => (typeof p === 'string' ? { name: p } : { name: String((p && (p.name || p.printerName)) || '').trim(), isDefault: !!(p && p.isDefault) })).filter((p) => p.name);
    const caps = (Array.isArray(b.capabilities) ? b.capabilities : []).map((c) => String(c || '').trim()).filter(Boolean);
    await db.query(`INSERT INTO print_agents (agent_id, name, computer, ip, printers, default_printer, version, capabilities, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE name = VALUES(name), computer = VALUES(computer), ip = VALUES(ip), printers = VALUES(printers), default_printer = VALUES(default_printer), version = VALUES(version), capabilities = VALUES(capabilities), last_seen = NOW()`,
    [id, String(b.agentName || id).trim().slice(0, 160), String(b.computerName || '').trim().slice(0, 160), String(req.ip || '').slice(0, 80), JSON.stringify(printers), String(b.defaultPrinter || '').trim().slice(0, 200), String(b.agentVersion || '').trim().slice(0, 60), JSON.stringify(caps)]);
    res.json({ success: true, message: 'تم تسجيل جهاز الطباعة', agentId: id, printers, agentVersion: String(b.agentVersion || '').trim(), capabilities: caps });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* الأمر اللي لسه مستني (الأقدم الأول). بنعلّمه «printing» وهو بيتسحب عشان محدّش تاني ياخده */
router.get('/agents/:agentId/jobs/next', async (req, res) => {
  try {
    const id = String(req.params.agentId || '').trim(); if (!id) return res.status(400).json({ success: false, error: 'AgentID غير موجود' });
    await db.query('UPDATE print_agents SET last_seen = NOW() WHERE agent_id = ?', [id]);
    await db.query("UPDATE print_jobs SET status = 'failed', error = 'الأداة ما أكدتش إن الطباعة خلصت (أكتر من 3 دقايق). افحص الطابعة.' WHERE status = 'printing' AND picked_at < DATE_SUB(NOW(), INTERVAL 3 MINUTE)");
    await db.query("UPDATE print_jobs SET status = 'failed', error = 'الأمر استنّى أكتر من 15 دقيقة من غير ما الأداة تسحبه. أعد الإرسال.' WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    const row = (await db.query("SELECT * FROM print_jobs WHERE agent_id = ? AND status = 'pending' ORDER BY id ASC LIMIT 1", [id]))[0];
    if (!row) return res.json({ success: true, job: null });
    const claim = await db.query("UPDATE print_jobs SET status = 'printing', picked_at = NOW() WHERE id = ? AND status = 'pending'", [row.id]);
    if (!claim.affectedRows) return res.json({ success: true, job: null });
    res.json({ success: true, job: { jobId: row.id, agentId: row.agent_id, printerName: row.printer_name || '', jobType: row.job_type, batchId: row.batch_id || '', copies: row.copies, payload: json(row.payload, {}), status: 'printing', errorMessage: '', createdAt: row.created_at, pickedAt: new Date(), printedAt: null } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/agents/:agentId/jobs/:jobId/status', async (req, res) => {
  try {
    const id = String(req.params.agentId || '').trim(); const jobId = parseInt(req.params.jobId, 10); const st = String((req.body && req.body.status) || '').trim();
    if (!id || !jobId || !['printed', 'failed'].includes(st)) return res.status(400).json({ success: false, error: 'حالة أمر الطباعة غير صالحة' });
    await db.query(`UPDATE print_jobs SET status = ?, error = ?, printed_at = IF(? = 'printed', NOW(), printed_at) WHERE id = ? AND agent_id = ?`, [st, st === 'failed' ? String((req.body && req.body.errorMessage) || '').slice(0, 1000) : '', st, jobId, id]);
    res.json({ success: true, message: 'تم تحديث حالة أمر الطباعة' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/agents', async (req, res) => {
  try { const rows = await db.query('SELECT *, (last_seen IS NOT NULL AND last_seen >= DATE_SUB(NOW(), INTERVAL 90 SECOND)) AS is_online FROM print_agents ORDER BY last_seen DESC'); res.json({ success: true, agents: rows.map((r) => ({ agentId: r.agent_id, agentName: r.name, computerName: r.computer, printers: json(r.printers, []), defaultPrinter: r.default_printer, agentVersion: r.version, capabilities: json(r.capabilities, []), lastSeenAt: r.last_seen, isOnline: !!r.is_online })) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
const health = (req, res) => res.json({ success: true, message: 'Masar Print Agent API يعمل.' });
router.get('/print-agent/health', health);
router.get('/print-server/health', health);

module.exports = router;
