'use strict';
/* الخزينة: محافظ (نقدي / محفظة موبايل / بنك) ولكل محفظة رصيد = رصيد أول المدة + دفعات العملاء اللي اتسجّلت فيها + الإيرادات − المصروفات ± التحويلات.
   سجل المعاملات = دفعات العملاء (من جدول payments) + الحركات اليدوية (treasury_tx) في جدول واحد. */
const express = require('express');
const db = require('../db');
const A = require('../accounts');
const P = require('../perms');
const audit = require('../audit');

const router = express.Router();
const KINDS = { cash: 'نقدي', wallet: 'محفظة موبايل', bank: 'حساب بنكي', other: 'أخرى' };
const TX = { client: 'دفعة عميل', income: 'إيراد', expense: 'مصروف', transfer: 'تحويل' };
const r2 = A.round2;
const day = (d) => { if (!d) return ''; if (typeof d === 'string') return d.slice(0, 10); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const isoOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

async function wallets(withArchived) {
  const ws = await db.query(`SELECT * FROM wallets ${withArchived ? '' : 'WHERE archived = 0'} ORDER BY archived, id`);
  const pay = new Map((await db.query('SELECT wallet_id, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS i, SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS o, COUNT(*) AS n FROM payments WHERE wallet_id IS NOT NULL GROUP BY wallet_id')).map((x) => [x.wallet_id, x]));
  const tx = new Map((await db.query('SELECT wallet_id, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS i, SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS o, COUNT(*) AS n FROM treasury_tx GROUP BY wallet_id')).map((x) => [x.wallet_id, x]));
  return ws.map((w) => { const p = pay.get(w.id) || {}, t = tx.get(w.id) || {}; const inn = Number(p.i || 0) + Number(t.i || 0), out = Number(p.o || 0) + Number(t.o || 0);
    return { id: w.id, name: w.name, kind: w.kind, kindLabel: KINDS[w.kind] || w.kind, number: w.number, opening: Number(w.opening), in: r2(inn), out: r2(out), balance: r2(Number(w.opening) + inn - out), count: Number(p.n || 0) + Number(t.n || 0), archived: !!w.archived }; });
}

router.get('/treasury', P.need('payments.view'), async (req, res) => {
  try { const ws = await wallets(req.query.all === '1'); res.json({ wallets: ws, total: r2(ws.filter((w) => !w.archived).reduce((a, w) => a + w.balance, 0)), kinds: KINDS, txKinds: TX, canEdit: P.has(req, 'payments.edit') }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const walletBody = (b) => ({ name: String(b.name || '').trim().slice(0, 120), kind: KINDS[b.kind] ? b.kind : 'cash', number: String(b.number || '').trim().slice(0, 60), opening: A.num(b.opening) || 0 });
router.post('/treasury/wallets', P.need('payments.edit'), async (req, res) => {
  try { const w = walletBody(req.body || {}); if (!w.name) return res.status(400).json({ error: 'اكتب اسم المحفظة' });
    const r = await db.query('INSERT INTO wallets (name, kind, number, opening) VALUES (?, ?, ?, ?)', [w.name, w.kind, w.number, r2(w.opening)]); audit.log(req, 'settings', null, '', 'محفظة جديدة: ' + w.name); res.json({ ok: true, id: r.insertId }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/treasury/wallets/:id(\\d+)', P.need('payments.edit'), async (req, res) => {
  try { const b = req.body || {}; const cur = (await db.query('SELECT * FROM wallets WHERE id = ?', [req.params.id]))[0]; if (!cur) return res.status(404).json({ error: 'المحفظة مش موجودة' });
    const w = walletBody({ ...cur, ...b }); if (!w.name) return res.status(400).json({ error: 'اكتب اسم المحفظة' });
    await db.query('UPDATE wallets SET name = ?, kind = ?, number = ?, opening = ?, archived = ? WHERE id = ?', [w.name, w.kind, w.number, r2(w.opening), b.archived === undefined ? cur.archived : (b.archived ? 1 : 0), cur.id]);
    await db.query('UPDATE payments SET method = ? WHERE wallet_id = ?', [w.name, cur.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/treasury/wallets/:id(\\d+)', P.need('payments.edit'), async (req, res) => {
  try { const id = parseInt(req.params.id, 10);
    const n = (await db.query('SELECT (SELECT COUNT(*) FROM payments WHERE wallet_id = ?) + (SELECT COUNT(*) FROM treasury_tx WHERE wallet_id = ?) AS n', [id, id]))[0].n;
    if (Number(n) > 0) return res.status(409).json({ error: `المحفظة فيها ${n} معاملة: ممكن تقفلها (أرشفة) بدل ما تمسحها` });
    await db.query('DELETE FROM wallets WHERE id = ?', [id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* سجل المعاملات (دفعات العملاء + الحركات اليدوية) بفلاتر: محفظة، نوع، من/إلى، بحث */
router.get('/treasury/tx', P.need('payments.view'), async (req, res) => {
  try {
    const q = req.query; const wid = parseInt(q.wallet, 10) || 0; const kind = TX[q.kind] ? q.kind : ''; const from = isoOk(q.from) ? q.from : '', to = isoOk(q.to) ? q.to : ''; const s = String(q.q || '').trim().toLowerCase();
    const rows = [];
    if (!kind || kind === 'client') {
      const w = ['p.wallet_id IS NOT NULL']; const v = []; if (wid) { w.push('p.wallet_id = ?'); v.push(wid); } if (from) { w.push('p.paid_at >= ?'); v.push(from); } if (to) { w.push('p.paid_at <= ?'); v.push(to); }
      for (const r of await db.query(`SELECT p.*, pe.name_ar, pe.passport_no, u.display_name AS uname, wl.name AS wname FROM payments p LEFT JOIN people pe ON pe.id = p.person_id LEFT JOIN users u ON u.id = p.created_by LEFT JOIN wallets wl ON wl.id = p.wallet_id WHERE ${w.join(' AND ')}`, v))
        rows.push({ id: 'p' + r.id, src: 'payment', paymentId: r.id, kind: 'client', kindLabel: Number(r.amount) < 0 ? 'استرجاع لعميل' : TX.client, walletId: r.wallet_id, wallet: r.wname || r.method, amount: Number(r.amount), date: day(r.paid_at), desc: (r.name_ar || '#' + r.person_id) + (r.note ? ' — ' + r.note : ''), personId: r.person_id, passportNo: r.passport_no || '', by: r.uname || '', at: r.created_at });
    }
    if (kind !== 'client') {
      const w = ['1=1']; const v = []; if (wid) { w.push('t.wallet_id = ?'); v.push(wid); } if (kind) { w.push('t.kind = ?'); v.push(kind); } if (from) { w.push('t.tx_date >= ?'); v.push(from); } if (to) { w.push('t.tx_date <= ?'); v.push(to); }
      for (const r of await db.query(`SELECT t.*, u.display_name AS uname, wl.name AS wname, t2.wallet_id AS other_wallet, w2.name AS other_name FROM treasury_tx t LEFT JOIN users u ON u.id = t.created_by LEFT JOIN wallets wl ON wl.id = t.wallet_id LEFT JOIN treasury_tx t2 ON t2.id = t.pair_id LEFT JOIN wallets w2 ON w2.id = t2.wallet_id WHERE ${w.join(' AND ')}`, v))
        rows.push({ id: 't' + r.id, src: 'tx', txId: r.id, kind: r.kind, kindLabel: r.kind === 'transfer' ? (Number(r.amount) < 0 ? 'تحويل لـ ' + (r.other_name || '') : 'تحويل من ' + (r.other_name || '')) : TX[r.kind] || r.kind, walletId: r.wallet_id, wallet: r.wname || '', amount: Number(r.amount), date: day(r.tx_date), desc: [r.category, r.note].filter(Boolean).join(' — '), category: r.category, by: r.uname || '', at: r.created_at });
    }
    let out = rows; if (s) out = out.filter((x) => [x.desc, x.wallet, x.kindLabel, x.passportNo, x.by].join(' ').toLowerCase().includes(s));
    out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || new Date(b.at) - new Date(a.at));
    const inn = r2(out.filter((x) => x.amount > 0).reduce((a, x) => a + x.amount, 0)), outSum = r2(out.filter((x) => x.amount < 0).reduce((a, x) => a - x.amount, 0));
    const lim = Math.min(Math.max(parseInt(q.limit, 10) || 300, 1), 2000);
    res.json({ rows: out.slice(0, lim), count: out.length, in: inn, out: outSum, net: r2(inn - outSum) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* حركة يدوية: إيراد (داخل) · مصروف (خارج) · تحويل بين محفظتين */
router.post('/treasury/tx', P.need('payments.edit'), async (req, res) => {
  try {
    const b = req.body || {}; const kind = ['income', 'expense', 'transfer'].includes(b.kind) ? b.kind : null; if (!kind) return res.status(400).json({ error: 'نوع الحركة مش معروف' });
    const amount = A.num(b.amount); if (amount === null || amount <= 0 || amount > 100000000) return res.status(400).json({ error: 'اكتب مبلغ صحيح أكبر من صفر' });
    const wid = parseInt(b.walletId, 10); const w = (await db.query('SELECT id, name FROM wallets WHERE id = ? AND archived = 0', [wid]))[0]; if (!w) return res.status(400).json({ error: 'اختار المحفظة' });
    const date = isoOk(b.date) ? b.date : today(); const cat = String(b.category || '').trim().slice(0, 80), note = String(b.note || '').trim().slice(0, 255);
    if (kind === 'transfer') {
      const tid = parseInt(b.toWalletId, 10); const w2 = (await db.query('SELECT id, name FROM wallets WHERE id = ? AND archived = 0', [tid]))[0]; if (!w2 || w2.id === w.id) return res.status(400).json({ error: 'اختار المحفظة اللي هتحوّل لها (غير المحفظة اللي بتحوّل منها)' });
      const a1 = await db.query("INSERT INTO treasury_tx (wallet_id, amount, kind, category, note, tx_date, created_by) VALUES (?, ?, 'transfer', ?, ?, ?, ?)", [w.id, -r2(amount), cat, note, date, req.user.id]);
      const a2 = await db.query("INSERT INTO treasury_tx (wallet_id, amount, kind, category, note, tx_date, pair_id, created_by) VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?)", [w2.id, r2(amount), cat, note, date, a1.insertId, req.user.id]);
      await db.query('UPDATE treasury_tx SET pair_id = ? WHERE id = ?', [a2.insertId, a1.insertId]);
      audit.log(req, 'payment', null, '', `تحويل ${amount} من ${w.name} لـ ${w2.name}`); return res.json({ ok: true, id: a1.insertId });
    }
    const r = await db.query('INSERT INTO treasury_tx (wallet_id, amount, kind, category, note, tx_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [w.id, kind === 'expense' ? -r2(amount) : r2(amount), kind, cat, note, date, req.user.id]);
    audit.log(req, 'payment', null, '', `${TX[kind]} ${amount} (${w.name})${cat ? ' — ' + cat : ''}`); res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/treasury/tx/:id(\\d+)', P.need('payments.edit'), async (req, res) => {
  try { const t = (await db.query('SELECT * FROM treasury_tx WHERE id = ?', [req.params.id]))[0]; if (!t) return res.status(404).json({ error: 'مش موجودة' });
    await db.query('DELETE FROM treasury_tx WHERE id = ? OR (pair_id IS NOT NULL AND id = ?)', [t.id, t.pair_id || 0]); audit.log(req, 'payment', null, '', 'مسح حركة خزينة ' + Number(t.amount)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.wallets = wallets;
