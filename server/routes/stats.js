'use strict';
/* الإحصائيات: لوحة رئيسية + جدول لكل تأشيرة (ملف ضبط) */
const express = require('express');
const db = require('../db');
const F = require('../fields');
const S = require('../stages');
const R = require('../readiness');
const P = require('../perms');
const A = require('../accounts');

const router = express.Router();
const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (e) { return {}; } };
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const STATUS_KEYS = ['draft', 'ready', 'waiting', 'filled', 'submitted'];
const emptyStageCounts = () => Object.fromEntries(S.STAGES.map((x) => [x.k, { done: 0, booked: 0, pending: 0 }]));

router.get('/stats/overview', P.need('stats.view'), async (req, res) => {
  try {
    const people = await db.query('SELECT id, name_ar, status, data, profile_id, stages, app_number, personal_photo, passport_image, created_at, created_by FROM people');
    const profRows = await db.query('SELECT id, name, data, is_default, archived FROM profiles ORDER BY is_default DESC, id');
    const profs = new Map(profRows.map((p) => [p.id, { id: p.id, name: p.name, data: json(p.data), isDefault: !!p.is_default, archived: !!p.archived }]));
    const showMoney = P.has(req, 'payments.view');
    const pays = showMoney ? new Map((await db.query('SELECT person_id, SUM(amount) AS s FROM payments GROUP BY person_id')).map((r) => [r.person_id, Number(r.s)])) : null;
    const acc = { due: 0, paid: 0, remaining: 0, unpaid: 0, partial: 0, paidFull: 0, noFee: 0 }; const archived = { batches: profRows.filter((p) => p.archived).length, people: 0 };
    const users = new Map((await db.query('SELECT id, username, display_name FROM users')).map((u) => [u.id, u.display_name || u.username]));
    const today = isoDay(new Date()); const in7 = isoDay(Date.now() + 7 * 86400000); const from30 = isoDay(Date.now() - 29 * 86400000);

    const byStatus = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
    const stages = emptyStageCounts(); const service = Object.fromEntries(R.SERVICES.map(([k]) => [k, 0]));
    const alerts = { expiring: [], expired: [], waiting: [], noPhoto: 0, noProfile: 0, noAppNumber: 0, upcoming: [] };
    const daily = new Map(); for (let i = 29; i >= 0; i--) { const d = isoDay(Date.now() - i * 86400000); daily.set(d, { day: d, created: 0, sent: 0 }); }
    const perUser = new Map(); const perVisa = new Map();
    const visaOf = (pid) => { const k = pid || 0; if (!perVisa.has(k)) { const pr = profs.get(k); const d = pr ? pr.data : {};
      perVisa.set(k, { id: k, name: pr ? pr.name : 'من غير ملف ضبط', visaNumber: d.visaNumber || '', visaDate: d.visaDate || '', unifiedNumber: d.unifiedNumber || '', sponsor: d.sponsorName || '', job: d.jobText || '', embassy: d.embassy || '',
        total: 0, due: 0, paid: 0, remaining: 0, status: Object.fromEntries(STATUS_KEYS.map((x) => [x, 0])), stages: emptyStageCounts(), service: Object.fromEntries(R.SERVICES.map(([x]) => [x, 0])), expiring: 0, firstAt: null, lastAt: null, sentDays: [] }); }
      return perVisa.get(k); };
    for (const pr of profs.values()) if (!pr.archived) visaOf(pr.id); /* كل تأشيرة تظهر حتى لو لسه ما فيهاش أشخاص */

    for (const p of people) {
      const d = json(p.data); const prof = profs.get(p.profile_id); if (prof && prof.archived) { archived.people++; continue; } const st = S.parse(p.stages); const vs = visaOf(p.profile_id);
      if (showMoney) { const b = A.balance(A.feeOf(d, prof && prof.data).fee, pays.get(p.id) || 0); acc.paid += b.paid; vs.paid += b.paid; if (b.fee !== null) { acc.due += b.fee; vs.due += b.fee; } if (b.remaining > 0) { acc.remaining += b.remaining; vs.remaining += b.remaining; } if (b.state === 'unpaid') acc.unpaid++; else if (b.state === 'partial') acc.partial++; else if (b.state === 'paid' || b.state === 'over') acc.paidFull++; else acc.noFee++; }
      byStatus[p.status] = (byStatus[p.status] || 0) + 1; vs.total++; vs.status[p.status] = (vs.status[p.status] || 0) + 1;
      const created = isoDay(p.created_at); if (daily.has(created)) daily.get(created).created++;
      if (!vs.firstAt || created < vs.firstAt) vs.firstAt = created; if (!vs.lastAt || created > vs.lastAt) vs.lastAt = created;
      for (const x of S.STAGES) { const c = st[x.k]; const key = c.state === 'done' ? 'done' : c.state === 'booked' ? 'booked' : 'pending'; stages[x.k][key]++; vs.stages[x.k][key]++;
        if (c.state === 'booked' && c.date && c.date >= today && c.date <= in7) alerts.upcoming.push({ personId: p.id, name: p.name_ar, stage: x.label, date: c.date });
        if (x.k === 'sent' && c.state === 'done') { if (c.date && daily.has(c.date)) daily.get(c.date).sent++; if (c.date) vs.sentDays.push(Math.max(0, daysBetween(created, c.date))); } }
      const rd = R.readiness(p, prof, 0); for (const [k] of R.SERVICES) if (!rd[k].length) { service[k]++; vs.service[k]++; }
      const ex = F.expiryInfo(d.expiryDate, F.autoEntryDate() || d.expectedEntryDate || (prof && prof.data.expectedEntryDate));
      if (p.status !== 'submitted') { if (ex.expired) { alerts.expired.push({ personId: p.id, name: p.name_ar }); vs.expiring++; } else if (ex.short) { alerts.expiring.push({ personId: p.id, name: p.name_ar, days: ex.days }); vs.expiring++; } }
      if (p.status === 'waiting') alerts.waiting.push({ personId: p.id, name: p.name_ar });
      if (!p.personal_photo) alerts.noPhoto++; if (!p.profile_id) alerts.noProfile++; if (!p.app_number && st.sent.state !== 'done' && p.status === 'submitted') alerts.noAppNumber++;
      const un = perUser.get(p.created_by) || { user: users.get(p.created_by) || '—', created: 0 }; un.created++; perUser.set(p.created_by, un);
    }
    alerts.upcoming.sort((a, b) => a.date.localeCompare(b.date)); alerts.expiring.sort((a, b) => a.days - b.days);
    const visas = [...perVisa.values()].filter((v) => v.id || v.total).map((v) => { const sd = v.sentDays; const avg = sd.length ? Math.round(sd.reduce((a, b) => a + b, 0) / sd.length * 10) / 10 : null; delete v.sentDays; return { ...v, avgDaysToSend: avg }; }).sort((a, b) => b.total - a.total);
    const total = people.length - archived.people;
    const r2 = A.round2; for (const v of visas) { v.due = r2(v.due); v.paid = r2(v.paid); v.remaining = r2(v.remaining); if (!showMoney) { delete v.due; delete v.paid; delete v.remaining; } }
    res.json({ total, byStatus, stages, service, serviceLabels: Object.fromEntries(R.SERVICES), stageLabels: Object.fromEntries(S.STAGES.map((x) => [x.k, x.label])),
      alerts: { ...alerts, expiring: alerts.expiring.slice(0, 12), expired: alerts.expired.slice(0, 12), waiting: alerts.waiting.slice(0, 12), upcoming: alerts.upcoming.slice(0, 12), expiringCount: alerts.expiring.length, expiredCount: alerts.expired.length, waitingCount: alerts.waiting.length },
      archived, accounts: showMoney ? { ...acc, due: r2(acc.due), paid: r2(acc.paid), remaining: r2(acc.remaining) } : null,
      daily: [...daily.values()], visas, users: [...perUser.values()].sort((a, b) => b.created - a.created), range: { from: from30, to: today } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
