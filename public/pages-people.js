'use strict';
/* قايمة الأشخاص: بحث وفلاتر، جاهزية كل خدمة، المراحل، وشريط تعليم/تنفيذ جماعي للمحدّدين. بتتحمّل قبل app.js وبتتسجّل في NA.pages */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const SERVICES = [['mofa', 'المنصة'], ['wafid', 'وافد'], ['lab', 'المعمل'], ['suez', 'خطاب السويس'], ['cairo', 'خطاب القاهرة']];
  const STATE_AR = { '': 'لسه', booked: 'محجوز', done: 'تم' };

  NA.goPeople = (filter) => { try { sessionStorage.setItem('peopleFilter', JSON.stringify(filter || {})); } catch (x) { /* مش مهم */ } if (location.hash === '#/people') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/people'; };

  NA.pages.people = async function () {
    const { api, e, $, view, toast, fail, STATUS, can } = NA; const meta = NA.meta;
    const profs = (await api('GET', '/profiles')).profiles;
    const state = (() => { try { return JSON.parse(sessionStorage.getItem('peopleFilter') || '{}'); } catch (x) { return {}; } })();
    const stages = meta.stages || [];
    view.innerHTML = `<div class="page-head"><div><h1>الأشخاص</h1><div class="sub" id="cnt"></div></div>
      <div class="sp">${can('export') ? '<button class="btn" id="tashBtn" title="ملف Excel (.xls) لموقع تساهيل — للمحدّدين، أو كل المعروضين">تصدير لتساهيل</button>' : ''}${can('people.edit') ? '<a href="#/bulk" class="btn" style="text-decoration:none">رفع جماعي</a><a href="#/people/new" class="btn pri" style="text-decoration:none">+ شخص جديد</a>' : ''}</div></div>
      <div class="card"><div class="filters">
        <input type="search" id="q" placeholder="بحث بالاسم أو رقم الجواز" value="${e(state.q || '')}">
        <select id="pf"><option value="">كل الدفعات (ملفات الضبط)</option>${profs.map((p) => `<option value="${p.id}"${String(state.pf) === String(p.id) ? ' selected' : ''}>${e(p.name)}</option>`).join('')}</select>
        <select id="st" style="display:none"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.st === k ? ' selected' : ''}>${e(v[0])}</option>`).join('')}</select>
        <select id="sf"><option value="">كل المراحل</option>${stages.map((x) => `<option value="p:${x.k}"${state.sf === 'p:' + x.k ? ' selected' : ''}>لسه: ${e(x.label)}</option>${x.booking ? `<option value="b:${x.k}"${state.sf === 'b:' + x.k ? ' selected' : ''}>محجوز: ${e(x.label)}</option>` : ''}<option value="d:${x.k}"${state.sf === 'd:' + x.k ? ' selected' : ''}>تم: ${e(x.label)}</option>`).join('')}</select>
        <select id="svf"><option value="">كل الجاهزية</option>${SERVICES.map(([k, l]) => `<option value="${k}:ok"${state.svf === k + ':ok' ? ' selected' : ''}>جاهز: ${l}</option><option value="${k}:no"${state.svf === k + ':no' ? ' selected' : ''}>ناقص: ${l}</option>`).join('')}</select>
        <select id="sortBy"><option value="new"${state.sort === 'new' || !state.sort ? ' selected' : ''}>الأحدث</option><option value="old"${state.sort === 'old' ? ' selected' : ''}>الأقدم</option><option value="name"${state.sort === 'name' ? ' selected' : ''}>الاسم</option></select>
        <label style="display:flex;gap:6px;align-items:center;font-size:13.5px"><input type="checkbox" id="exOnly"${state.ex ? ' checked' : ''}> جوازات قريبة الانتهاء</label>
      </div><div class="fchips" id="stChips"></div></div>
      <div id="bulk"></div>
      <div class="card" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th style="width:34px"><input type="checkbox" id="selAll" title="تحديد الكل"></th><th>الشخص</th><th>الدفعة</th><th>الحالة</th><th>الجاهزية (دوس على أي خدمة تشوف الناقص)</th><th>المراحل</th><th></th></tr></thead>
      <tbody id="rows"><tr><td colspan="7" class="muted">جاري التحميل…</td></tr></tbody></table></div></div>`;

    let all = [], shown = [];
    const selectedIds = () => [...view.querySelectorAll('.sel:checked')].map((c) => c.dataset.id);
    const itemsOf = (ids) => ids.map((id) => { const p = shown.find((x) => String(x.id) === String(id)) || all.find((x) => String(x.id) === String(id)) || {}; return { id, name: p.name || '#' + id, ready: !!p.ready }; });
    const ensureExt = async () => { if (!NA.extReady) { NA.ping(); await new Promise((r) => setTimeout(r, 700)); } if (!NA.extReady) { toast('إضافة Chrome مش متركّبة. من «الإضافة» نزّلها وركّبها الأول.', 'err'); return false; } return true; };

    const bulkHtml = (n) => {
      const sel = (id, opts, ph) => `<select id="${id}" style="padding:6px 8px;border-radius:9px;border:0;max-width:170px">${ph ? `<option value="">${ph}</option>` : ''}${opts}</select>`;
      return `<div class="bulkbar"><span class="cnt">${n} محدّد</span><button class="btn small" id="clearSel">إلغاء التحديد</button><span class="sep"></span>
        ${can('people.fill') ? `<div class="grp"><span class="gl">ابدأ طابور:</span><button class="btn pri" id="queueBtn">املى المنصة (${n})</button><button class="btn" id="wafQueueBtn">احجز وافد (${n})</button><button class="btn" id="labQueueBtn">احجز المعمل (${n})</button><button class="btn" id="appnoBtn" title="يجيب رقم الطلب (إنجاز) من المنصة لكل المحدّدين اللي لسه معندهمش رقم">هات أرقام إنجاز (${n})</button></div><span class="sep"></span>` : ''}
        ${can('people.mark') ? `<div class="grp"><span class="gl">اعلّم:</span>${sel('bkStage', stages.map((x) => `<option value="${x.k}" data-b="${x.booking ? 1 : 0}">${e(x.label)}</option>`).join(''))}
          ${sel('bkState', '<option value="done">تم ✔</option><option value="booked">محجوز</option><option value="">لسه (إلغاء)</option>')}<input type="date" id="bkDate" title="تاريخ (اختياري)" style="padding:5px 8px;border-radius:9px;border:0"><button class="btn pri" id="bkApply">علّم</button></div>
          <span class="sep"></span><div class="grp"><span class="gl">الحالة:</span>${sel('bkStatus', Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${e(v[0])}</option>`).join(''), '— اختار —')}<button class="btn" id="bkStatusGo">غيّر</button></div>` : ''}
        ${can('people.edit') ? `<span class="sep"></span><div class="grp"><span class="gl">انقل لدفعة:</span>${sel('bkProf', profs.map((p) => `<option value="${p.id}">${e(p.name)}</option>`).join(''), '— اختار —')}<button class="btn" id="bkProfGo">انقل</button></div>` : ''}
        ${can('people.delete') ? '<span class="sep"></span><button class="btn danger" id="bkDel">حذف</button>' : ''}</div>`;
    };
    const wireBulk = () => {
      const n = selectedIds().length; const box = $('#bulk'); box.innerHTML = n ? bulkHtml(n) : ''; if (!n) return;
      const ids = () => selectedIds();
      const run = async (fn) => { try { await fn(); await load(); } catch (er) { fail(er); } };
      $('#clearSel').onclick = () => { view.querySelectorAll('.sel:checked').forEach((c) => { c.checked = false; }); $('#selAll').checked = false; wireBulk(); };
      const qb = $('#queueBtn'); if (qb) qb.onclick = async () => {
        const items = itemsOf(ids()); const notReady = items.filter((x) => !x.ready).length;
        if (notReady && !confirm(`${notReady} من المحدّدين ناقصين بيانات (هيتملي اللي موجود بس). تكمّل؟`)) return;
        if (!(await ensureExt())) return; toast(`بدأ طابور ${items.length} شخص. بعد ما تحفظ كل واحد دوس «الشخص التالي» في المنصة.`, 'ok');
        NA.fillRequest(items[0].id, items.slice(1).map((x) => ({ id: x.id, name: x.name })), items.length, true);
      };
      const wq = $('#wafQueueBtn'); if (wq) wq.onclick = async () => { const items = itemsOf(ids()); if (!(await ensureExt())) return; toast(`بدأ طابور وافد: ${items.length} شخص. بعد ما تخلّص كل واحد دوس «الشخص التالي» في صفحة وافد.`, 'ok'); NA.wafidRequest(items[0].id, items.slice(1).map((x) => ({ id: x.id, name: x.name })), items.length, true); };
      const ab = $('#appnoBtn'); if (ab) ab.onclick = () => NA.appno.start(ids(), { skipHave: true, onDone: () => load().catch(() => {}) });
      const lq = $('#labQueueBtn'); if (lq) lq.onclick = async () => { const items = itemsOf(ids()); if (!(await ensureExt())) return; toast(`بدأ طابور المعمل: ${items.length} شخص. بعد ما تخلّص كل واحد دوس «الشخص التالي» في صفحة المعمل.`, 'ok'); NA.labRequest(items[0].id, items.slice(1).map((x) => ({ id: x.id, name: x.name })), items.length, true); };
      const ba = $('#bkApply'); if (ba) {
        const syncState = () => { const booking = $('#bkStage').selectedOptions[0].dataset.b === '1'; [...$('#bkState').options].forEach((o) => { o.disabled = o.value === 'booked' && !booking; }); if ($('#bkState').selectedOptions[0].disabled) $('#bkState').value = 'done'; };
        $('#bkStage').onchange = syncState; syncState();
        ba.onclick = () => run(async () => {
          const key = $('#bkStage').value; const stt = $('#bkState').value; const label = (stages.find((x) => x.k === key) || {}).label;
          if (!confirm(`تعلّم ${ids().length} شخص: «${label}» ← ${STATE_AR[stt]}؟`)) throw new Error('اتلغت');
          const r = await api('POST', '/people/bulk/stage', { ids: ids(), key, state: stt, ...($('#bkDate').value ? { date: $('#bkDate').value } : {}) }); toast(`اتعلّم ${r.updated} شخص`, 'ok');
        }).catch(() => {});
      }
      const bs = $('#bkStatusGo'); if (bs) bs.onclick = () => run(async () => { const v = $('#bkStatus').value; if (!v) throw new Error('اختار الحالة الأول'); if (!confirm(`تغيّر حالة ${ids().length} شخص؟`)) throw new Error('اتلغت'); const r = await api('POST', '/people/bulk/status', { ids: ids(), status: v }); toast(`اتغيّرت حالة ${r.updated} شخص`, 'ok'); });
      const bp = $('#bkProfGo'); if (bp) bp.onclick = () => run(async () => { const v = $('#bkProf').value; if (!v) throw new Error('اختار الدفعة الأول'); if (!confirm(`تنقل ${ids().length} شخص للدفعة المختارة؟`)) throw new Error('اتلغت'); const r = await api('POST', '/people/bulk/profile', { ids: ids(), profileId: Number(v) }); toast(`اتنقل ${r.updated} شخص`, 'ok'); });
      const bd = $('#bkDel'); if (bd) bd.onclick = () => run(async () => { if (!confirm(`تحذف ${ids().length} شخص نهائياً؟ (مش هتقدر ترجّعهم)`)) throw new Error('اتلغت'); const r = await api('POST', '/people/bulk/delete', { ids: ids() }); toast(`اتحذف ${r.deleted}${r.skipped ? ' (و' + r.skipped + ' مش مسموحلك تحذفهم)' : ''}`, r.deleted ? 'ok' : 'err'); });
    };

    const svcChips = (p) => SERVICES.map(([k, l]) => { const miss = (p.service || {})[k] || []; return miss.length ? `<span class="chip bad" title="${e('ناقص: ' + miss.join('، '))}">${l} −${miss.length}</span>` : `<span class="chip ok" title="جاهز">${l} ✓</span>`; }).join('');
    const stageCells = (p) => `<span class="stlist">${stages.map((x) => { const c = (p.stages || {})[x.k] || {}; return `<span class="sg" title="${e(x.label + ': ' + STATE_AR[c.state || ''] + (c.date ? ' ' + c.date : ''))}"><span class="dots"><i class="dot ${c.state || ''}"></i></span>${e(x.short || x.k)}</span>`; }).join('')}</span>`;
    const draw = () => {
      $('#rows').innerHTML = shown.map((p) => `<tr class="click" data-id="${p.id}"><td><input type="checkbox" class="sel" data-id="${p.id}"></td>
        <td class="pcell"><b>${e(p.name || '—')}</b><small>${e(p.passportNo)}${p.appNumber ? ' • ' + e(p.appNumber) : ''}</small>${p.hasPhoto ? '' : ' <span class="chip warn" title="الصورة الشخصية ناقصة">بدون صورة</span>'}${p.expiry && p.expiry.expired ? ' <span class="chip bad">جواز منتهي</span>' : p.expiry && p.expiry.short ? ` <span class="chip warn" title="أقل من 6 شهور من تاريخ الدخول">ينتهي بعد ${p.expiry.days} يوم</span>` : ''}</td>
        <td>${e(p.profileName || '—')}</td><td><span class="pill ${STATUS[p.status] ? STATUS[p.status][1] : ''}">${e((STATUS[p.status] || [p.status])[0])}</span></td>
        <td><span class="svc">${svcChips(p)}</span></td><td>${stageCells(p)}</td>
        <td>${can('people.fill') ? `<button class="btn small pri fill" data-id="${p.id}" title="يفتح منصة التأشيرات ويملا الطلب">املى الطلب</button>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="7"><div class="empty"><div class="big">🗂️</div>${all.length ? 'مفيش أشخاص بالفلاتر دي.' : 'لسه مفيش أشخاص. ابدأ بإضافة أول شخص أو ارفع صور جوازات.'}</div></td></tr>`;
      $('#cnt').textContent = `${shown.length} من ${all.length} شخص`;
      $('#selAll').checked = false; wireBulk();
    };
    const chipsHtml = () => {
      const counts = {}; all.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
      return `<span class="fchip${!$('#st').value ? ' on' : ''}" data-st="">الكل<b>${all.length}</b></span>` + Object.entries(STATUS).map(([k, v]) => `<span class="fchip${$('#st').value === k ? ' on' : ''}" data-st="${k}">${e(v[0])}<b>${counts[k] || 0}</b></span>`).join('');
    };
    const apply = () => {
      const st = { q: $('#q').value, st: $('#st').value, pf: $('#pf').value, ex: $('#exOnly').checked, sf: $('#sf').value, svf: $('#svf').value, sort: $('#sortBy').value }; try { sessionStorage.setItem('peopleFilter', JSON.stringify(st)); } catch (x) { /* مش مهم */ }
      shown = all.filter((p) => (!st.st || p.status === st.st) && (!st.ex || (p.expiry && (p.expiry.short || p.expiry.expired))));
      if (st.sf) { const [mode, key] = st.sf.split(':'); shown = shown.filter((p) => { const c = (p.stages || {})[key] || {}; return mode === 'p' ? !c.state : mode === 'b' ? c.state === 'booked' : c.state === 'done'; }); }
      if (st.svf) { const [k, m] = st.svf.split(':'); shown = shown.filter((p) => ((((p.service || {})[k]) || []).length === 0) === (m === 'ok')); }
      if (st.sort === 'old') shown = shown.slice().sort((a, b) => a.id - b.id); else if (st.sort === 'name') shown = shown.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')); else shown = shown.slice().sort((a, b) => b.id - a.id);
      $('#stChips').innerHTML = chipsHtml(); draw();
    };
    const load = async () => {
      const r = await api('GET', `/people?q=${encodeURIComponent($('#q').value)}&profile=${$('#pf').value}`); all = r.people; apply();
    };
    let qT; $('#q').oninput = () => { clearTimeout(qT); qT = setTimeout(() => load().catch(fail), 250); };
    $('#pf').onchange = () => load().catch(fail);
    ['st', 'exOnly', 'sf', 'svf', 'sortBy'].forEach((i) => { $('#' + i).onchange = apply; });
    $('#stChips').onclick = (ev) => { const c = ev.target.closest('.fchip'); if (!c) return; $('#st').value = c.dataset.st; apply(); };
    $('#selAll').onchange = () => { view.querySelectorAll('.sel').forEach((c) => { c.checked = $('#selAll').checked; }); wireBulk(); };
    const tash = $('#tashBtn'); if (tash) tash.onclick = () => { const ids = selectedIds().length ? selectedIds() : shown.map((p) => p.id); if (!ids.length) return toast('مفيش أشخاص للتصدير', 'err'); window.location.href = `/api/export/tasaheel.xls?ids=${ids.slice(0, 1500).join(',')}`; toast('بينزّل ملف تساهيل (' + ids.length + ' شخص)', 'ok'); };
    view.onclick = (ev) => { if (ev.target.classList.contains('sel')) { wireBulk(); return; } if (ev.target.id === 'selAll') return; const b = ev.target.closest('.fill'); if (b) { ev.stopPropagation(); return NA.fillRequest(b.dataset.id); } if (ev.target.closest('input,select,button,a,.bulkbar')) return; const tr = ev.target.closest('tr.click'); if (tr) location.hash = '#/people/' + tr.dataset.id; };
    await load();
  };
})();
