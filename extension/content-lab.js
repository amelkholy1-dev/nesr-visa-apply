'use strict';
/* بيشتغل على فورم «حجز المعمل» في معامل الصحة العامة (clab.mohp.gov.eg/booking): بيملا بيانات المصري بالرقم القومي من نظام طلبات التأشيرات.
   اللي مبيلمسوش أبداً: يوم وساعة الحجز، التحاليل (الأساسية والإضافية)، طريقة الدفع، وزرار «تأكيد». كل ده بإيدك. */
(function () {
  if (!document.getElementById('P2_NATIONALITY_TYPE_0') || !document.getElementById('P2_NATIONAL_ID')) return;
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => document.getElementById(id);
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
  const waitFor = async (fn, ms = 9000, step = 150) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const visible = (el) => !!el && el.offsetParent !== null;
  const report = { ok: [], manual: [], failed: [] };
  const note = (label, st, detail) => { (st === 'ok' ? report.ok : st === 'manual' ? report.manual : report.failed).push(detail ? label + ' (' + detail + ')' : label); };
  const mark = (el) => { try { if (el) { const t = el.closest('.t-Form-fieldContainer') || el; t.style.outline = '3px solid #f2a31b'; t.style.outlineOffset = '2px'; } } catch (e) { /* مش مهم */ } };
  const real = (sel) => [...sel.options].filter((o) => String(o.value) !== '');
  const val = (id) => { const e = byId(id); return e ? String(e.value || '') : ''; };
  const dmyToIso = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
  const isoToDmy = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };

  function setInput(id, value, label, opts = {}) {
    const el = byId(id); if (!el) return note(label, 'failed', 'الخانة مش موجودة'), false;
    if (value == null || String(value).trim() === '') return note(label, opts.optional ? 'ok' : 'manual', opts.optional ? 'اختياري: سيبته' : 'فاضي في النظام'), (opts.optional ? false : (mark(el), false));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value)); fire(el);
    note(label, 'ok'); return true;
  }
  async function setSelect(id, want, label, opts = {}) {
    const el = byId(id); if (!el) return note(label, 'failed', 'القايمة مش موجودة'), false;
    if (!String(want == null ? '' : want).trim()) return note(label, opts.optional ? 'ok' : 'manual', opts.optional ? 'اختياري: سيبته' : 'فاضي في النظام'), (opts.optional ? false : (mark(el), false));
    const loaded = await waitFor(() => real(el).length >= 1, opts.timeout || 8000);
    if (!loaded) return note(label, 'failed', 'القايمة ما اتحمّلتش'), mark(el), false;
    const o = real(el).find((x) => String(x.value) === String(want));
    if (!o) return note(label, 'failed', 'مش لاقي الاختيار ' + want + ' — اختاره بإيدك'), mark(el), false;
    for (let i = 0; i < 3; i++) { el.value = o.value; fire(el); await sleep(500); if (String(el.value) === String(o.value)) break; await sleep(500); }
    if (String(el.value) !== String(o.value)) return note(label, 'failed', 'الموقع رجّع القيمة فاضية — اختارها بإيدك'), mark(el), false;
    note(label, 'ok', o.textContent.trim().slice(0, 40)); return true;
  }

  function bar(html) {
    let b = byId('nesr-lab-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-lab-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;width:min(94vw,680px);max-height:60vh;overflow:auto;padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;background:#1d4486;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    b.innerHTML = html; return b;
  }
  const list = (arr) => (arr.length ? '<ul style="margin:4px 18px;padding:0">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  const step = async (name, fn) => { try { await fn(); } catch (e) { report.failed.push(name + ': حصل خطأ (' + String(e && e.message || e) + ')'); } };

  async function fillAll(w, setStatus) {
    setStatus('نوع الجنسية…');
    await step('الجنسية', async () => {
      const r = byId('P2_NATIONALITY_TYPE_0'); if (!r.checked) { r.click(); await sleep(300); if (!r.checked) { r.checked = true; fire(r); } }
      if (!(await waitFor(() => visible(byId('P2_NATIONAL_ID')), 8000))) return note('الجنسية', 'failed', 'خانة الرقم القومي ما ظهرتش — اختار «مصري» بإيدك');
      note('الجنسية', 'ok', 'مصري');
    });
    setStatus('جهة التحليل وجهة السفر…');
    await step('جهة التحليل', async () => { const f = byId('P2_FACILITY_ID'); const only = f && real(f).length === 1 ? real(f)[0].value : ''; await setSelect('P2_FACILITY_ID', only, 'جهة التحليل', { timeout: 6000 }); });
    await step('جهة السفر', () => setSelect('P2_DESTINATION_COUNTRY', w.destination, 'جهة السفر'));
    setStatus('الرقم القومي…');
    await step('الرقم القومي', async () => {
      if (!setInput('P2_NATIONAL_ID', w.nationalId, 'الرقم القومي')) return;
      /* الموقع بيحسب تاريخ الميلاد والجنس من الرقم القومي: بنستنى وبنتأكد */
      await waitFor(() => val('P2_DATE_OF_BIRTH'), 8000);
      const got = dmyToIso(val('P2_DATE_OF_BIRTH'));
      if (!got) {
        const r = await send({ kind: 'lab-set', id: 'P2_DATE_OF_BIRTH', value: isoToDmy(w.dob) });
        if (r && r.ok && val('P2_DATE_OF_BIRTH')) note('تاريخ الميلاد', 'ok', val('P2_DATE_OF_BIRTH') + ' (اتكتب من عندنا)');
        else { note('تاريخ الميلاد', 'failed', 'الموقع ما حسبوش من الرقم القومي — اكتبه بإيدك: ' + isoToDmy(w.dob)); mark(byId('P2_DATE_OF_BIRTH')); }
      } else if (w.dob && got !== w.dob) { note('تاريخ الميلاد', 'failed', 'الموقع حسبه ' + got + ' من الرقم القومي ومختلف عن النظام (' + w.dob + ') — راجع الرقم القومي'); mark(byId('P2_DATE_OF_BIRTH')); }
      else note('تاريخ الميلاد', 'ok', 'الموقع حسبه من الرقم القومي');
      const sx = byId('P2_SEX');
      if (sx && !sx.value) await setSelect('P2_SEX', w.sex, 'الجنس', { timeout: 3000 });
      else if (sx && w.sex && sx.value !== w.sex) { note('الجنس', 'failed', 'الموقع حسبه من الرقم القومي ومختلف عن النظام — راجع الرقم القومي'); mark(sx); }
      else note('الجنس', 'ok', 'الموقع حسبه من الرقم القومي');
    });
    setStatus('بيانات المسافر…');
    await step('الجواز', async () => { setInput('P2_PASSPORT_NUMBER', w.passport, 'رقم الجواز'); await sleep(400); });
    await step('الاسم', async () => { setInput('P2_FULL_NAME', w.fullName, 'الاسم بالكامل'); await sleep(400); });
    await step('الوظيفة', () => setSelect('P2_OCCUPATION', w.occupation, 'الوظيفة', { optional: true, timeout: 3000 }));
    await step('الموبايل', async () => { setInput('P2_TEL_NO', w.phone, 'رقم الهاتف'); await sleep(300); });
    await step('الإيميل', async () => { setInput('P2_EMAIL', w.email, 'البريد الإلكتروني', { optional: true }); });
    await step('رقم الطلب', async () => {
      const el = byId('P2_NET_NUMBER');
      if (!visible(el)) return note('رقم الطلب (وثيقة إنجاز)', 'ok', 'الموقع مش طالبه لجهة السفر دي');
      if (!w.netNumber) return note('رقم الطلب (وثيقة إنجاز)', 'manual', 'الموقع طالبه ورقم الطلب لسه مش مسجّل في النظام'), mark(el), void 0;
      setInput('P2_NET_NUMBER', w.netNumber, 'رقم الطلب (وثيقة إنجاز)');
    });
    /* يوم وساعة الحجز والتحاليل والدفع و«تأكيد»: بإيدك، بنعلّم بس مكان يوم الحجز */
    mark(byId('P2_BOOKING_DATE'));
  }

  const queueHtml = (ctx) => {
    const q = Array.isArray(ctx.queue) ? ctx.queue : []; if (!q.length) return '';
    const total = ctx.queueTotal || (q.length + 1); const idx = total - q.length;
    return '<div style="margin-top:6px;padding:6px 8px;background:#ffffff22;border-radius:8px">📋 الشخص ' + idx + ' من ' + total + ' — التالي: <b>' + esc(q[0].name) + '</b> (باقي ' + q.length + ') <button id="nesr-lab-next" style="background:#fff;color:#1d4486;border:0;border-radius:8px;padding:5px 10px;font:700 12px Tahoma;cursor:pointer;margin-inline-start:6px">الشخص التالي</button></div>';
  };

  (async function run() {
    const { ctx } = await send({ kind: 'get-lab-ctx' }); if (!ctx || !ctx.lab) return;
    const flag = 'va_lab_' + ctx.personId + '_' + ctx.at; try { if (sessionStorage.getItem(flag)) return; } catch (e) { /* مش مهم */ }
    const status = (t) => bar('<span>🧪 ' + esc(ctx.name || '') + ' — ' + esc(t) + '</span>');
    status('بيملا فورم حجز المعمل…');
    try { await fillAll(ctx.lab, status); } catch (e) { report.failed.push('حصل خطأ غير متوقع: ' + String(e && e.message || e)); }
    try { sessionStorage.setItem(flag, '1'); } catch (e) { /* مش مهم */ }
    const bad = report.failed.length || ctx.issues.length;
    const b = bar('<div><b>' + (bad ? '⚠️' : '✅') + ' اتملى ' + report.ok.length + ' خانة' + (report.failed.length ? ' · ' + report.failed.length + ' محتاجة راجعة' : '') + '</b> — دلوقتي:</div>' +
      '<ol style="margin:4px 18px;padding:0"><li>راجع الخانات اللي حواليها إطار برتقالي</li><li>اختار <b>يوم الحجز</b> و<b>ساعة الحجز</b> (من الموقع)</li><li>اختار التحاليل المطلوبة (والإضافية لو فيه)</li><li>دوس «تأكيد» واختار طريقة الدفع بنفسك</li></ol>' +
      (ctx.issues.length ? '<div>⛔ في النظام:</div>' + list(ctx.issues) : '') + (report.failed.length ? '<div>❌ مش اتملى:</div>' + list(report.failed) : '') + (report.manual.length ? '<div>✋ فاضي في النظام:</div>' + list(report.manual) : '') + ((ctx.warns || []).length ? '<div>ℹ️</div>' + list(ctx.warns) : '') +
      queueHtml(ctx) + '<div style="margin-top:6px"><button id="nesr-lab-hide" style="background:#ffffff33;color:#fff;border:0;border-radius:8px;padding:6px 12px;font:700 12px Tahoma;cursor:pointer">إخفاء</button></div>');
    const nx = b.querySelector('#nesr-lab-next');
    if (nx) nx.addEventListener('click', async () => { nx.disabled = true; nx.textContent = 'بيجهّز…'; const r = await send({ kind: 'next' }); if (!r || !r.ok) { nx.disabled = false; nx.textContent = 'الشخص التالي'; alert((r && r.error) || 'مش قادر أفتح الشخص التالي'); } });
    const h = b.querySelector('#nesr-lab-hide'); if (h) h.addEventListener('click', () => b.remove());
  })();
})();
