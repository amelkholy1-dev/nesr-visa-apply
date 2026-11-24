'use strict';
/* الخزينة: المحافظ وأرصدتها · سجل المعاملات (دفعات العملاء + إيراد/مصروف/تحويل) · مستحقات العملاء */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const KIND_CLS = { cash: 'k-cash', wallet: 'k-wallet', bank: 'k-bank', other: '' };

  NA.pages.treasury = async function (tab) {
    const { api, e, $, view, toast, fail, can } = NA; const I = NA.icon || (() => '');
    if (!can('payments.view')) { view.innerHTML = '<div class="card issues">مش مسموحلك تشوف الخزينة.</div>'; return; }
    tab = ['wallets', 'log', 'dues'].includes(tab) ? tab : 'wallets';
    const d = await api('GET', '/treasury'); const canEdit = d.canEdit;
    view.innerHTML = `<div class="page-head card-head"><div class="ph-t"><span class="ph-ic">${I('wallet')}</span><div><h1>الخزينة والمحافظ</h1><div class="sub">الرصيد في كل محفظة، وكل حركة داخلة وخارجة.</div></div></div>
      <div class="sp">${canEdit ? `<button class="btn green" id="tAddW">${I('plus')} إضافة محفظة</button><button class="btn blue" id="tIn">${I('down')} إيراد</button><button class="btn red" id="tOut">${I('up')} مصروف</button><button class="btn orange" id="tTr">${I('swap')} تحويل بين المحافظ</button>` : ''}</div></div>
      <div class="banner"><div><div class="bl">الرصيد الإجمالي</div><div class="bs">إجمالي الرصيد في كل المحافظ</div></div><div class="bv">${fmt(d.total)} ج.م</div></div>
      <div class="tabs" id="trTabs"><button class="tabb${tab === 'wallets' ? ' on' : ''}" data-t="wallets">المحافظ</button><button class="tabb${tab === 'log' ? ' on' : ''}" data-t="log">سجل المعاملات</button><button class="tabb${tab === 'dues' ? ' on' : ''}" data-t="dues">مستحقات العملاء</button></div>
      <div id="trBody"></div>`;
    view.querySelectorAll('#trTabs .tabb').forEach((b) => { b.onclick = () => { location.hash = b.dataset.t === 'wallets' ? '#/treasury' : '#/treasury/' + b.dataset.t; }; });
    const body = $('#trBody'); const active = d.wallets.filter((w) => !w.archived);
    const wOpts = (sel) => active.map((w) => `<option value="${w.id}"${String(sel) === String(w.id) ? ' selected' : ''}>${e(w.name)}</option>`).join('');

    /* نوافذ: محفظة / حركة */
    const walletForm = (w) => NA.modal(`<h2>${w ? 'تعديل محفظة' : 'محفظة جديدة'}</h2><div class="grid"><label class="f">اسم المحفظة<input id="wN" value="${e(w ? w.name : '')}" placeholder="مثلاً: فودافون كاش - سامي"></label>
      <label class="f">النوع<select id="wK">${Object.entries(d.kinds).map(([k, l]) => `<option value="${k}"${w && w.kind === k ? ' selected' : ''}>${e(l)}</option>`).join('')}</select></label>
      <label class="f">رقم الحساب/الموبايل (اختياري)<input id="wNo" value="${e(w ? w.number : '')}" dir="ltr"></label><label class="f">رصيد أول المدة (ج)<input id="wO" type="number" step="any" value="${w ? w.opening : 0}"></label></div>
      <div class="foot">${w ? `<button class="btn" id="wArch">${w.archived ? 'رجّعها' : 'قفل المحفظة (أرشفة)'}</button>` : ''}<button class="btn" id="wX">إلغاء</button><button class="btn green" id="wS">حفظ</button></div>`, (m, close) => {
      m.querySelector('#wX').onclick = close;
      m.querySelector('#wS').onclick = async () => { try { const b = { name: m.querySelector('#wN').value, kind: m.querySelector('#wK').value, number: m.querySelector('#wNo').value, opening: m.querySelector('#wO').value }; if (w) await api('PUT', `/treasury/wallets/${w.id}`, b); else await api('POST', '/treasury/wallets', b); close(); toast('اتحفظت المحفظة', 'ok'); NA.pages.treasury(tab); } catch (er) { fail(er); } };
      const ar = m.querySelector('#wArch'); if (ar) ar.onclick = async () => { try { await api('PUT', `/treasury/wallets/${w.id}`, { archived: !w.archived }); close(); NA.pages.treasury(tab); } catch (er) { fail(er); } };
    });
    const txForm = (kind, walletId) => {
      if (!active.length) return toast('اعمل محفظة الأول', 'err');
      const title = { income: 'إيراد (فلوس داخلة)', expense: 'مصروف (فلوس خارجة)', transfer: 'تحويل بين المحافظ' }[kind];
      NA.modal(`<h2>${title}</h2><div class="grid"><label class="f">${kind === 'transfer' ? 'من محفظة' : 'المحفظة'}<select id="xW">${wOpts(walletId)}</select></label>
        ${kind === 'transfer' ? `<label class="f">إلى محفظة<select id="xW2">${wOpts(active.find((w) => String(w.id) !== String(walletId || active[0].id)) ? active.find((w) => String(w.id) !== String(walletId || active[0].id)).id : '')}</select></label>` : ''}
        <label class="f">المبلغ (ج)<input id="xA" type="number" step="any" min="0" inputmode="decimal"></label><label class="f">التاريخ<input id="xD" type="date" value="${today()}"></label>
        ${kind === 'transfer' ? '' : `<label class="f">التصنيف<input id="xC" list="xCats" placeholder="${kind === 'expense' ? 'مثلاً: كهرباء، انتقالات، رسوم' : 'مثلاً: إيداع، عمولة'}"><datalist id="xCats">${(kind === 'expense' ? ['رسوم منصة', 'كشف طبي', 'معمل', 'انتقالات', 'كهرباء', 'إيجار', 'مرتبات', 'نظافة', 'أخرى'] : ['إيداع', 'عمولة', 'أخرى']).map((x) => `<option value="${x}">`).join('')}</datalist></label>`}
        <label class="f" style="grid-column:1/-1">الوصف<input id="xN" placeholder="اختياري"></label></div>
        <div class="foot"><button class="btn" id="xX">إلغاء</button><button class="btn ${kind === 'expense' ? 'red' : kind === 'transfer' ? 'orange' : 'green'}" id="xS">حفظ</button></div>`, (m, close) => {
        m.querySelector('#xX').onclick = close; m.querySelector('#xA').focus();
        m.querySelector('#xS').onclick = async () => { try { await api('POST', '/treasury/tx', { kind, walletId: m.querySelector('#xW').value, toWalletId: m.querySelector('#xW2') ? m.querySelector('#xW2').value : undefined, amount: m.querySelector('#xA').value, date: m.querySelector('#xD').value, category: m.querySelector('#xC') ? m.querySelector('#xC').value : '', note: m.querySelector('#xN').value }); close(); toast('اتسجّلت الحركة', 'ok'); NA.pages.treasury(tab); } catch (er) { fail(er); } };
      });
    };
    if (canEdit) { $('#tAddW').onclick = () => walletForm(null); $('#tIn').onclick = () => txForm('income'); $('#tOut').onclick = () => txForm('expense'); $('#tTr').onclick = () => txForm('transfer'); }

    if (tab === 'wallets') {
      body.innerHTML = `<div class="wgrid">${d.wallets.map((w) => `<div class="wcard${w.archived ? ' arch-row' : ''}"><div class="wt"><span class="wic ${KIND_CLS[w.kind] || ''}">${I(w.kind === 'bank' ? 'bank' : w.kind === 'wallet' ? 'phone' : 'cash')}</span><div class="wn"><b>${e(w.name)}</b><small>${e(w.kindLabel)}${w.number ? ' · <span dir="ltr">' + e(w.number) + '</span>' : ''}${w.archived ? ' · مقفولة' : ''}</small></div><div class="wb ${w.balance < 0 ? 'neg' : 'pos'}">${fmt(w.balance)} ج.م</div></div>
        <div class="wm"><span>داخل <b>${fmt(w.in)}</b></span><span>خارج <b>${fmt(w.out)}</b></span><span>${w.count} معاملة</span></div>
        <div class="wf"><a href="#/treasury/log" class="lnk wlog" data-id="${w.id}">${I('list')} سجل المعاملات</a>${canEdit ? `<span class="sp2"></span><button class="ibtn" title="إيراد" data-in="${w.id}">${I('down')}</button><button class="ibtn" title="مصروف" data-out="${w.id}">${I('up')}</button><button class="ibtn" title="تعديل" data-ed="${w.id}">${I('edit')}</button>` : ''}</div></div>`).join('') || '<div class="card empty">لسه مفيش محافظ. دوس «إضافة محفظة».</div>'}</div>`;
      body.onclick = (ev) => {
        const l = ev.target.closest('.wlog'); if (l) { ev.preventDefault(); try { sessionStorage.setItem('trWallet', l.dataset.id); } catch (x) { /* مش مهم */ } location.hash = '#/treasury/log'; return; }
        const a = ev.target.closest('[data-in]'); if (a) return txForm('income', a.dataset.in); const o = ev.target.closest('[data-out]'); if (o) return txForm('expense', o.dataset.out);
        const ed = ev.target.closest('[data-ed]'); if (ed) return walletForm(d.wallets.find((w) => String(w.id) === ed.dataset.ed));
      };
    } else if (tab === 'log') {
      let pre = ''; try { pre = sessionStorage.getItem('trWallet') || ''; sessionStorage.removeItem('trWallet'); } catch (x) { /* مش مهم */ }
      body.innerHTML = `<div class="card"><div class="filters"><input type="search" id="lQ" placeholder="بحث في المعاملات (اسم، تصنيف، وصف)…"><select id="lW"><option value="">كل المحافظ</option>${d.wallets.map((w) => `<option value="${w.id}"${String(pre) === String(w.id) ? ' selected' : ''}>${e(w.name)}</option>`).join('')}</select>
        <select id="lK"><option value="">كل المعاملات</option>${Object.entries(d.txKinds).map(([k, l]) => `<option value="${k}">${e(l)}</option>`).join('')}</select><label class="f2">من<input type="date" id="lF"></label><label class="f2">إلى<input type="date" id="lT"></label></div></div>
        <div class="kpis3" id="lSum"></div><div class="card" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المحفظة</th><th>الوصف</th><th>المبلغ</th><th>أضيف بواسطة</th><th>الإجراءات</th></tr></thead><tbody id="lRows"><tr><td colspan="7" class="muted">جاري التحميل…</td></tr></tbody></table></div></div>`;
      const load = async () => {
        const qs = new URLSearchParams({ q: $('#lQ').value, wallet: $('#lW').value, kind: $('#lK').value, from: $('#lF').value, to: $('#lT').value });
        const r = await api('GET', '/treasury/tx?' + qs.toString());
        $('#lSum').innerHTML = `<div class="kc green"><span>داخل</span><b>${fmt(r.in)} ج.م</b></div><div class="kc red"><span>خارج</span><b>${fmt(r.out)} ج.م</b></div><div class="kc blue"><span>الصافي (${r.count} معاملة)</span><b>${fmt(r.net)} ج.م</b></div>`;
        $('#lRows').innerHTML = r.rows.map((x) => `<tr><td>${e(x.date)}</td><td><span class="chip ${x.amount < 0 ? 'bad' : 'ok'}">${e(x.kindLabel)}</span></td><td>${e(x.wallet)}</td>
          <td>${x.personId ? `<a href="#/people/${x.personId}">${e(x.desc)}</a>` : e(x.desc || '—')}</td><td><b class="${x.amount < 0 ? 'neg' : 'pos'}" dir="ltr">${x.amount < 0 ? '−' : '+'}${fmt(Math.abs(x.amount))}</b></td><td class="small muted">${e(x.by)}</td>
          <td>${x.src === 'tx' && canEdit ? `<button class="ibtn danger" title="مسح" data-del="${x.txId}">${I('trash')}</button>` : x.personId ? `<a class="ibtn" title="فتح الشخص" href="#/people/${x.personId}">${I('eye')}</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center">مفيش معاملات بالفلاتر دي.</td></tr>';
      };
      let qT; $('#lQ').oninput = () => { clearTimeout(qT); qT = setTimeout(() => load().catch(fail), 250); }; ['lW', 'lK', 'lF', 'lT'].forEach((i) => { $('#' + i).onchange = () => load().catch(fail); });
      body.onclick = async (ev) => { const b = ev.target.closest('[data-del]'); if (!b) return; if (!confirm('تمسح الحركة دي؟ (التحويل بيتمسح من المحفظتين)')) return; try { await api('DELETE', `/treasury/tx/${b.dataset.del}`); toast('اتمسحت', 'ok'); NA.pages.treasury('log'); } catch (er) { fail(er); } };
      await load();
    } else {
      await NA.pages.accounts(body);
    }
  };
})();
