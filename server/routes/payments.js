'use strict';
/* المدفوعات: كل شخص ليه تكلفة (من الشخص أو دفعته) ودفعات بتتسجّل بطريقة الدفع (كاش / محفظة…) */
const express = require('express');
const db = require('../db');
const A = require('../accounts');
const P = require('../perms');
const audit = require('../audit');

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const rowOut = (r) => ({ id: r.id, amount: Number(r.amount), method: r.method, note: r.note, date: r.paid_at ? (typeof r.paid_at === 'string' ? r.paid_at.slice(0, 10) : isoDay(r.paid_at.getTime() - r.paid_at.getTimezoneOffset() * 60000)) : '', by: r.user_name || '', at: r.created_at });

async function personBalance(id) {
  const row = (await db.query('SELECT id, name_ar, data, profile_id FROM people WHERE id = ?', [id]))[0]; if (!row) return null;
  const prof = row.profile_id ? (await db.query('SELECT data FROM profiles WHERE id = ?', [row.profile_id]))[0] : null;
  const f = A.feeOf(json(row.data), prof && json(prof.data));
  const paid = Number((await db.query('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE person_id = ?', [id]))[0].s);
  return { row, ...A.balance(f.fee, paid), feeSource: f.source };
}

router.get('/people/:id(\\d+)/payments', P.need('payments.view'), async (req, res) => {
  try {
    const b = await personBalance(parseInt(req.params.id, 10)); if (!b) return res.status(404).json({ error: 'الشخص مش موجود' });
    const rows = await db.query('SELECT p.*, u.display_name AS user_name FROM payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.person_id = ? ORDER BY p.paid_at DESC, p.id DESC', [b.row.id]);
    res.json({ name: b.row.name_ar, fee: b.fee, feeSource: b.feeSource, paid: b.paid, remaining: b.remaining, state: b.state, methods: A.PAY_METHODS, payments: rows.map(rowOut), canEdit: P.has(req, 'payments.edit') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/people/:id(\\d+)/payments', P.need('payments.edit'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10); const b = req.body || {};
    const amount = A.num(b.amount); if (amount === null || amount === 0 || Math.abs(amount) > 10000000) return res.status(400).json({ error: 'اكتب مبلغ صحيح (الاسترجاع بيتكتب بالسالب)' });
    const cur = await personBalance(id); if (!cur) return res.status(404).json({ error: 'الشخص مش موجود' });
    const method = A.PAY_METHODS.includes(b.method) ? b.method : 'كاش';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : isoDay(Date.now());
    const note = String(b.note || '').trim().slice(0, 200);
    const r = await db.query('INSERT INTO payments (person_id, amount, method, note, paid_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', [id, A.round2(amount), method, note, date, req.user.id]);
    audit.log(req, 'payment', id, cur.row.name_ar, (amount < 0 ? 'استرجاع ' : 'دفع ') + Math.abs(amount) + ' (' + method + ')');
    res.json({ ok: true, id: r.insertId, ...A.balance(cur.fee, cur.paid + amount) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:id(\\d+)', P.need('payments.edit'), async (req, res) => {
  try {
    const p = (await db.query('SELECT p.*, pe.name_ar FROM payments p LEFT JOIN people pe ON pe.id = p.person_id WHERE p.id = ?', [req.params.id]))[0];
    if (!p) return res.status(404).json({ error: 'مش موجود' });
    await db.query('DELETE FROM payments WHERE id = ?', [p.id]);
    audit.log(req, 'payment', p.person_id, p.name_ar || '', 'مسح دفعة ' + Number(p.amount) + ' (' + p.method + ')');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ملخص الحسابات: الإجمالي، حسب الدفعة وطريقة الدفع، واللي عليهم متبقي */
router.get('/accounts/summary', P.need('payments.view'), async (req, res) => {
  try {
    const people = await db.query('SELECT p.id, p.name_ar, p.passport_no, p.data, p.profile_id, pr.name AS pname, pr.data AS pdata, pr.archived FROM people p LEFT JOIN profiles pr ON pr.id = p.profile_id');
    const sums = new Map((await db.query('SELECT person_id, SUM(amount) AS s FROM payments GROUP BY person_id')).map((r) => [r.person_id, Number(r.s)]));
    const byBatch = new Map(); const tot = { due: 0, paid: 0, remaining: 0, unpaid: 0, partial: 0, paidFull: 0, noFee: 0, people: 0 }; const debtors = [];
    for (const p of people) {
      if (p.archived) continue;
      const b = A.balance(A.feeOf(json(p.data), p.pdata && json(p.pdata)).fee, sums.get(p.id) || 0);
      tot.people++; tot.paid += b.paid; if (b.fee !== null) tot.due += b.fee; if (b.remaining > 0) { tot.remaining += b.remaining; debtors.push({ id: p.id, name: p.name_ar, passportNo: p.passport_no, batch: p.pname || '', fee: b.fee, paid: b.paid, remaining: b.remaining }); }
      if (b.state === 'unpaid') tot.unpaid++; else if (b.state === 'partial') tot.partial++; else if (b.state === 'paid' || b.state === 'over') tot.paidFull++; else tot.noFee++;
      const k = p.profile_id || 0; const o = byBatch.get(k) || { id: k, name: p.pname || 'من غير دفعة', people: 0, due: 0, paid: 0, remaining: 0 }; o.people++; o.paid += b.paid; if (b.fee !== null) o.due += b.fee; if (b.remaining > 0) o.remaining += b.remaining; byBatch.set(k, o);
    }
    const byMethod = (await db.query('SELECT method, SUM(amount) AS s, COUNT(*) AS n FROM payments GROUP BY method ORDER BY s DESC')).map((r) => ({ method: r.method, total: Number(r.s), count: r.n }));
    const recent = (await db.query('SELECT p.*, u.display_name AS user_name, pe.name_ar FROM payments p LEFT JOIN users u ON u.id = p.created_by LEFT JOIN people pe ON pe.id = p.person_id ORDER BY p.id DESC LIMIT 15')).map((r) => ({ ...rowOut(r), personId: r.person_id, name: r.name_ar || '' }));
    debtors.sort((a, b) => b.remaining - a.remaining);
    const r2 = (n) => A.round2(n);
    res.json({ totals: { ...tot, due: r2(tot.due), paid: r2(tot.paid), remaining: r2(tot.remaining) }, batches: [...byBatch.values()].map((o) => ({ ...o, due: r2(o.due), paid: r2(o.paid), remaining: r2(o.remaining) })).sort((a, b) => b.remaining - a.remaining), byMethod, debtors: debtors.slice(0, 50), debtorsCount: debtors.length, recent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
