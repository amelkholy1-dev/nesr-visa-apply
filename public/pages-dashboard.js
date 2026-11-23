'use strict';
/* لوحة التحكم (الصفحة الرئيسية): أرقام سريعة، مسار المراحل، جاهزية الخدمات، تنبيهات، نشاط 30 يوم، وجدول لكل تأشيرة بالأرقام */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  NA.pages.dashboard = async function () {
    const { api, e, $, view, toast, fail, STATUS, can } = NA;
    if (!can('stats.view')) { view.innerHTML = `<div class="page-head"><div><h1>أهلاً ${e(NA.me.name)}</h1><div class="sub">${e(NA.meta.brandTag || '')}</div></div></div><div class="card"><a class="btn pri" href="#/people" style="text-decoration:none">فتح الأشخاص</a></div>`; return; }
    const d = await api('GET', '/stats/overview');
    const T = d.total; const sub = d.byStatus.submitted || 0;
    const sd = (k) => d.stages[k] || { done: 0, booked: 0, pending: 0 };
    const kpi = (n, l, s, color, go, href) => `<a class="kpi" href="${href || '#/people'}" ${go ? `data-go='${e(JSON.stringify(go))}'` : ''} style="--k:${color}"><div class="n">${n}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</a>`;
    const stageBar = (k) => { const s = sd(k); const tot = Math.max(1, s.done + s.booked + s.pending); return `<div class="bar"><span class="lb">${e(d.stageLabels[k])}</span><span class="tr"><i class="i-done" style="width:${pct(s.done, tot)}%"></i><i class="i-book" style="width:${pct(s.booked, tot)}%"></i><i class="i-pend" style="width:${pct(s.pending, tot)}%"></i></span><span class="vl">${s.done} تم${s.booked ? ' · ' + s.booked + ' محجوز' : ''}</span></div>`; };
    const svcBar = (k) => { const n = d.service[k] || 0; return `<div class="bar"><span class="lb">${e(d.serviceLabels[k])}</span><span class="tr"><i class="i-done" style="width:${pct(n, T)}%"></i></span><span class="vl">${n} من ${T}</span></div>`; };
    const maxDay = Math.max(1, ...d.daily.map((x) => Math.max(x.created, x.sent)));
    const chart = `<div class="legend"><span style="--c:#9cc6ca">اتسجّلوا</span><span style="--c:var(--acc)">اتبعتوا للمنصة</span></div><div class="chart">${d.daily.map((x) => `<div class="col" title="${e(x.day)}: ${x.created} اتسجّل، ${x.sent} اتبعت"><i class="c2" style="height:${Math.round((x.sent / maxDay) * 100)}%"></i><i class="c1" style="height:${Math.round((x.created / maxDay) * 100)}%"></i></div>`).join('')}</div><div class="axis"><span>${e(d.daily[0].day)}</span><span>${e(d.daily[d.daily.length - 1].day)}</span></div>`;
    const list = (arr, fmt, empty) => (arr.length ? `<ul class="alist">${arr.map(fmt).join('')}</ul>` : `<div class="muted small">${empty}</div>`);
    const person = (x) => `<a class="t" href="#/people/${x.personId}">${e(x.name || '#' + x.personId)}</a>`;
    const a = d.alerts;
    const visaRows = d.visas.map((v) => {
      const cell = (k) => { const s = v.stages[k]; return `<td title="تم ${s.done} · محجوز ${s.booked} · لسه ${s.pending}"><b>${s.done}</b><span class="muted small">/${v.total}</span>${s.booked ? ` <span class="chip warn">${s.booked} محجوز</span>` : ''}</td>`; };
      return `<tr class="click" data-pf="${v.id || ''}"><td class="pcell"><b>${e(v.name)}</b><small>${e(v.visaNumber || '')}${v.sponsor ? ' • ' + e(v.sponsor) : ''}${v.job ? ' • ' + e(v.job) : ''}</small></td>
        <td><b>${v.total}</b></td>${cell('sent')}${cell('medical')}${cell('lab')}${cell('letter')}
        ${v.due !== undefined ? `<td>${v.due ? `<b>${Number(v.paid).toLocaleString('en-US')}</b><span class="muted small"> / ${Number(v.due).toLocaleString('en-US')}</span>` : '<span class="muted">—</span>'}</td>` : ''}
        <td><span class="chip ${v.service.mofa === v.total && v.total ? 'ok' : 'bad'}">${v.service.mofa}/${v.total} جاهز</span></td>
        <td>${v.expiring ? `<span class="chip warn">${v.expiring}</span>` : '<span class="muted">—</span>'}</td>
        <td>${v.avgDaysToSend == null ? '<span class="muted">—</span>' : v.avgDaysToSend + ' يوم'}</td><td class="small muted">${e(v.firstAt || '—')}${v.lastAt && v.lastAt !== v.firstAt ? ' ← ' + e(v.lastAt) : ''}</td></tr>`; }).join('');

    view.innerHTML = `<div class="page-head"><div><h1>لوحة التحكم</h1><div class="sub">${e(NA.meta.brandTag || '')}</div></div>
      <div class="sp">${can('people.edit') ? '<a href="#/people/new" class="btn pri" style="text-decoration:none">+ شخص جديد</a><a href="#/bulk" class="btn" style="text-decoration:none">رفع جماعي</a>' : ''}<a href="#/people" class="btn" style="text-decoration:none">كل الأشخاص</a></div></div>
      <div class="kpis">
        ${kpi(T, 'إجمالي الأشخاص', d.visas.filter((v) => v.id).length + ' دفعة/تأشيرة', 'var(--acc)', {})}
        ${kpi(sd('sent').done, 'اتبعتوا للمنصة', pct(sd('sent').done, T) + '% من الكل', 'var(--ok)', { sf: 'd:sent' })}
        ${kpi(d.byStatus.waiting || 0, 'مستني تأمين الجواز', '', '#a3302a', { st: 'waiting' })}
        ${kpi(sd('medical').done + sd('medical').booked, 'فحص طبي (وافد)', sd('medical').done + ' تم · ' + sd('medical').booked + ' محجوز', '#c7512f', { sf: 'd:medical' })}
        ${kpi(sd('lab').done + sd('lab').booked, 'معمل', sd('lab').done + ' تم · ' + sd('lab').booked + ' محجوز', '#6a4fa3', { sf: 'd:lab' })}
        ${kpi(sd('letter').done, 'خطابات ترشيح اتطبعت', pct(sd('letter').done, T) + '%', '#2f7a4f', { sf: 'd:letter' })}
        ${kpi(a.expiringCount + a.expiredCount, 'جوازات محتاجة انتباه', a.expiredCount + ' منتهي · ' + a.expiringCount + ' قريب الانتهاء', '#c8962e', { ex: true })}
        ${d.accounts ? kpi(Number(d.accounts.remaining).toLocaleString('en-US') + ' ج', 'متبقي على الأشخاص', 'مدفوع ' + Number(d.accounts.paid).toLocaleString('en-US') + ' من ' + Number(d.accounts.due).toLocaleString('en-US') + ' · لسه ما دفعوش: ' + d.accounts.unpaid, '#a3302a', null, '#/accounts') : ''}
      </div>
      <div class="two"><div class="card"><h2>مسار الإنجاز</h2><div class="legend"><span style="--c:var(--ok)">تم</span><span style="--c:#e0a92b">محجوز</span><span style="--c:#cfd8d8">لسه</span></div>${['sent', 'medical', 'lab', 'letter'].map(stageBar).join('')}</div>
        <div class="card"><h2>الجاهزية لكل خدمة (بيانات كاملة)</h2>${['mofa', 'wafid', 'lab', 'suez', 'cairo'].map(svcBar).join('')}<div class="muted small" style="margin-top:6px">«جاهز» يعني كل البيانات المطلوبة للخدمة دي موجودة. افتح الشخص تشوف الناقص.</div></div></div>
      <div class="three" style="margin-top:16px">
        <div class="alert-box warn"><h3>جوازات محتاجة انتباه</h3>${list([...a.expired.map((x) => ({ ...x, tag: 'منتهي' })), ...a.expiring.map((x) => ({ ...x, tag: 'ينتهي بعد ' + x.days + ' يوم' }))].slice(0, 8), (x) => `<li>${person(x)}<span class="chip ${x.tag === 'منتهي' ? 'bad' : 'warn'}">${e(x.tag)}</span></li>`, 'مفيش جوازات قريبة الانتهاء 👌')}</div>
        <div class="alert-box"><h3>مواعيد خلال 7 أيام</h3>${list(a.upcoming.slice(0, 8), (x) => `<li>${person(x)}<span class="chip acc">${e(x.stage)}</span><span class="small muted">${e(x.date)}</span></li>`, 'مفيش مواعيد قريبة.')}</div>
        <div class="alert-box bad"><h3>مستني تأمين الجواز (${a.waitingCount})</h3>${list(a.waiting.slice(0, 8), (x) => `<li>${person(x)}</li>`, 'مفيش حد مستني.')}</div></div>
      <div class="card" style="margin-top:16px"><h2>النشاط آخر 30 يوم</h2>${chart}</div>
      <div class="card" style="padding:0;margin-top:16px"><div style="padding:16px 18px 0"><h2>كل تأشيرة بالأرقام</h2><div class="muted small" style="margin-bottom:8px">كل صف = دفعة/تأشيرة (ملف ضبط). الأرقام «تم / الإجمالي». دوس على الصف يفتح الأشخاص بتوعها.</div></div>
        <div class="tbl-wrap"><table><thead><tr><th>التأشيرة / الدفعة</th><th>الأشخاص</th><th>المنصة</th><th>وافد</th><th>المعمل</th><th>خطاب</th>${d.visas.some((v) => v.due !== undefined) ? '<th>المدفوع / المطلوب</th>' : ''}<th>جاهزين للمنصة</th><th>جوازات قريبة الانتهاء</th><th>متوسط أيام للإرسال</th><th>أول ← آخر إضافة</th></tr></thead><tbody>${visaRows || '<tr><td colspan="11"><div class="empty">لسه مفيش دفعات. اعمل أول دفعة من «دفعات التأشيرات».</div></td></tr>'}</tbody></table></div></div>
      ${d.users.length > 1 || (d.users[0] && d.users[0].user !== '—') ? `<div class="card" style="margin-top:16px"><h2>مين سجّل كام شخص</h2>${d.users.slice(0, 8).map((u) => `<div class="bar"><span class="lb">${e(u.user)}</span><span class="tr"><i class="i-done" style="width:${pct(u.created, Math.max(1, d.users[0].created))}%"></i></span><span class="vl">${u.created} شخص</span></div>`).join('')}</div>` : ''}`;

    view.onclick = (ev) => {
      const k = ev.target.closest('a.kpi'); if (k) { ev.preventDefault(); let g = {}; try { g = JSON.parse(k.dataset.go || '{}'); } catch (x) { g = {}; } return NA.goPeople(g); }
      const tr = ev.target.closest('tr.click'); if (tr) return NA.goPeople(tr.dataset.pf ? { pf: tr.dataset.pf } : {});
    };
  };
})();
