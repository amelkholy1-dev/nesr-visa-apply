'use strict';
/* الحسابات: لوحة تحكم مبسّطة للفلوس + لوحة دفع لكل شخص (تكلفة − مدفوع = متبقي) */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const STATE = { none: ['من غير تكلفة', ''], unpaid: ['لسه ما دفعش', 'bad'], partial: ['دفع جزء', 'warn'], paid: ['خالص', 'ok'], over: ['دافع زيادة', 'ok'] };
  NA.payState = (p) => { const s = STATE[(p && p.state) || 'none'] || STATE.none; return `<span class="chip ${s[1]}">${s[0]}${p && p.state === 'partial' ? ' — باقي ' + fmt(p.remaining) : ''}</span>`; };

  /* لوحة الدفع جوه عنصر (تبويب الحسابات في صفحة الشخص أو نافذة الدفع) */
  NA.payPanel = async function (el, personId, opts) {
    const { api, e, toast, fail, can } = NA; if (!el) return;
    const load = async () => {
      let r; try { r = await api('GET', `/people/${personId}/payments`); } catch (er) { el.innerHTML = `<div class="card issues">${e(er.message)}</div>`; return; }
      const canEdit = r.canEdit && can('payments.edit');
      el.innerHTML = `<div class="card"><h2>الحسابات${opts && opts.title ? ' — ' + e(opts.title) : ''}</h2>
        <div class="money"><div><span>التكلفة${r.feeSource ? ' (' + (r.feeSource === 'person' ? 'مكتوبة للشخص' : 'من الدفعة') + ')' : ''}</span><b>${r.fee === null ? 'غير محدّدة' : fmt(r.fee) + ' ج'}</b></div><div><span>المدفوع</span><b>${fmt(r.paid)} ج</b></div><div class="rem ${r.remaining !== null && r.remaining <= 0 ? 'zero' : ''}"><span>المتبقي</span><b>${r.remaining === null ? '—' : fmt(r.remaining) + ' ج'}</b></div></div>
        ${r.fee === null ? '<div class="muted small" style="margin-bottom:10px">اكتب «تكلفة الفرد» في الدفعة (أو للشخص نفسه) عشان يتحسب المتبقي.</div>' : ''}
        ${canEdit ? `<form class="payform" id="payF"><label class="f">المبلغ (ج)<input type="number" step="any" id="pAmt" inputmode="decimal" placeholder="${r.remaining > 0 ? r.remaining : '0'}"></label>
          <label class="f">طريقة الدفع<select id="pMeth">${r.methods.map((m) => `<option>${e(m)}</option>`).join('')}</select></label>
          <label class="f">التاريخ<input type="date" id="pDate" value="${today()}"></label><label class="f">ملاحظة<input id="pNote" placeholder="اختياري"></label>
          <div class="row"><button class="btn pri" id="pGo" type="submit">سجّل دفعة</button>${r.remaining > 0 ? '<button class="btn" id="pRest" type="button">دفع الباقي</button>' : ''}</div></form>
          <div class="muted small" style="margin-top:4px">الاسترجاع بيتسجّل بمبلغ بالسالب (مثلاً -500).</div>` : ''}</div>
        <div class="card" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظة</th><th>سجّله</th><th></th></tr></thead><tbody>${r.payments.map((p) => `<tr><td>${e(p.date)}</td><td><b>${fmt(p.amount)}</b></td><td>${e(p.method)}</td><td class="small">${e(p.note)}</td><td class="small muted">${e(p.by)}</td><td>${canEdit ? `<button class="btn small danger pDel" data-id="${p.id}">مسح</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center">مفيش دفعات لسه.</td></tr>'}</tbody></table></div></div>`;
      const f = el.querySelector('#payF');
      if (f) {
        f.onsubmit = async (ev) => {
          ev.preventDefault();
          try {
            const amount = el.querySelector('#pAmt').value; if (!amount) return toast('اكتب المبلغ', 'err');
            await api('POST', `/people/${personId}/payments`, { amount, method: el.querySelector('#pMeth').value, date: el.querySelector('#pDate').value, note: el.querySelector('#pNote').value });
            toast('اتسجّلت الدفعة', 'ok'); await load(); if (opts && opts.onChange) opts.onChange();
          } catch (er) { fail(er); }
        };
        const rest = el.querySelector('#pRest'); if (rest) rest.onclick = () => { el.querySelector('#pAmt').value = r.remaining; };
      }
      el.querySelectorAll('.pDel').forEach((b) => { b.onclick = async () => { if (!confirm('تمسح الدفعة دي؟')) return; try { await api('DELETE', `/payments/${b.dataset.id}`); toast('اتمسحت', 'ok'); await load(); if (opts && opts.onChange) opts.onChange(); } catch (er) { fail(er); } }; });
    };
    await load();
  };
  /* نافذة دفع سريعة من القايمة */
  NA.payModal = (personId, name, onClose) => {
    NA.modal('<div id="payHost"></div><div class="foot"><button class="btn" id="payX">قفل</button></div>', (m, close) => {
      const done = () => { close(); if (onClose) onClose(); };
      m.querySelector('#payX').onclick = done; m.style.maxWidth = '760px';
      NA.payPanel(m.querySelector('#payHost'), personId, { title: name });
    });
  };

  NA.pages.accounts = async function () {
    const { api, e, view, fail, can } = NA;
    if (!can('payments.view')) { view.innerHTML = '<div class="card issues">مش مسموحلك تشوف الحسابات.</div>'; return; }
    const r = await api('GET', '/accounts/summary'); const t = r.totals;
    view.innerHTML = `<div class="page-head"><div><h1>الحسابات</h1><div class="sub">التكلفة والمدفوع والمتبقي لكل الأشخاص في الدفعات الشغّالة (المؤرشفة مش محسوبة).</div></div></div>
      <div class="money"><div><span>إجمالي المطلوب</span><b>${fmt(t.due)} ج</b></div><div><span>إجمالي المدفوع</span><b>${fmt(t.paid)} ج</b></div><div class="rem ${t.remaining <= 0 ? 'zero' : ''}"><span>إجمالي المتبقي</span><b>${fmt(t.remaining)} ج</b></div>
        <div><span>خالصين</span><b>${t.paidFull}</b></div><div><span>دفعوا جزء</span><b>${t.partial}</b></div><div><span>لسه ما دفعوش</span><b>${t.unpaid}</b></div>${t.noFee ? `<div><span>من غير تكلفة محدّدة</span><b>${t.noFee}</b></div>` : ''}</div>
      <div class="two"><div class="card" style="padding:0"><div style="padding:16px 18px 0"><h2>حسب الدفعة</h2></div><div class="tbl-wrap"><table><thead><tr><th>الدفعة</th><th>الأشخاص</th><th>المطلوب</th><th>المدفوع</th><th>المتبقي</th></tr></thead><tbody>${r.batches.map((b) => `<tr><td><b>${e(b.name)}</b></td><td>${b.people}</td><td>${fmt(b.due)}</td><td>${fmt(b.paid)}</td><td><b>${fmt(b.remaining)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center">مفيش بيانات.</td></tr>'}</tbody></table></div></div>
        <div class="card" style="padding:0"><div style="padding:16px 18px 0"><h2>حسب طريقة الدفع</h2></div><div class="tbl-wrap"><table><thead><tr><th>الطريقة</th><th>عدد الدفعات</th><th>الإجمالي</th></tr></thead><tbody>${r.byMethod.map((m) => `<tr><td><b>${e(m.method)}</b></td><td>${m.count}</td><td>${fmt(m.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted" style="text-align:center">مفيش دفعات لسه.</td></tr>'}</tbody></table></div></div></div>
      <div class="card" style="padding:0;margin-top:16px"><div style="padding:16px 18px 0"><h2>عليهم متبقي (${r.debtorsCount})</h2></div><div class="tbl-wrap"><table><thead><tr><th>الشخص</th><th>الدفعة</th><th>التكلفة</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead><tbody>${r.debtors.map((d) => `<tr><td class="pcell"><a href="#/people/${d.id}"><b>${e(d.name || '#' + d.id)}</b></a><small>${e(d.passportNo)}</small></td><td>${e(d.batch)}</td><td>${fmt(d.fee)}</td><td>${fmt(d.paid)}</td><td><b>${fmt(d.remaining)}</b></td><td>${can('payments.edit') ? `<button class="btn small payB" data-id="${d.id}" data-n="${e(d.name)}">سجّل دفعة</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center">مفيش حد عليه متبقي.</td></tr>'}</tbody></table></div></div>
      <div class="card" style="padding:0;margin-top:16px"><div style="padding:16px 18px 0"><h2>آخر الدفعات</h2></div><div class="tbl-wrap"><table><thead><tr><th>التاريخ</th><th>الشخص</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظة</th><th>سجّله</th></tr></thead><tbody>${r.recent.map((p) => `<tr><td>${e(p.date)}</td><td><a href="#/people/${p.personId}">${e(p.name || '#' + p.personId)}</a></td><td><b>${fmt(p.amount)}</b></td><td>${e(p.method)}</td><td class="small">${e(p.note)}</td><td class="small muted">${e(p.by)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center">مفيش دفعات لسه.</td></tr>'}</tbody></table></div></div>`;
    view.onclick = (ev) => { const b = ev.target.closest('.payB'); if (b) NA.payModal(b.dataset.id, b.dataset.n, () => NA.pages.accounts().catch(fail)); };
  };
})();
