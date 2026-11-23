'use strict';
/* بيشتغل على فورم «حجز موعد الفحص الطبي» في وافد (wafid.com/…/book-appointment/): بيملا بيانات المتقدم من نظام طلبات التأشيرات.
   اللي مبيلمسوش: تاريخ الموعد، الإقرار، كود التحقق/الكابتشا، وزرار «حفظ ومتابعة». كل ده بإيدك. */
(function () {
  if (!document.getElementById('id_country') || !document.querySelector('form.booking-appointment-form')) return;
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => document.getElementById(id);
  const norm = (s) => String(s == null ? '' : s).replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, '').trim().toLowerCase();
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); };
  const waitFor = async (fn, ms = 9000, step = 150) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
  const report = { ok: [], manual: [], failed: [] };
  const note = (label, st, detail) => { (st === 'ok' ? report.ok : st === 'manual' ? report.manual : report.failed).push(detail ? label + ' (' + detail + ')' : label); };
  const mark = (el) => { try { if (el) { const t = el.closest('.field') || el; t.style.outline = '3px solid #f2a31b'; t.style.outlineOffset = '2px'; } } catch (e) { /* مش مهم */ } };
  const real = (sel) => [...sel.options].filter((o) => String(o.value) !== '');
  const CITY_SYN = { 'القاهره': ['cairo'], 'الاسكندريه': ['alexandria'], 'اسيوط': ['asyut', 'assiut'], 'سوهاج': ['sohag'] };

  function setInput(id, value, label) {
    const el = byId(id); if (!el) return note(label, 'failed', 'الخانة مش موجودة'), false;
    if (value == null || String(value).trim() === '') return note(label, 'manual', 'فاضي في النظام'), mark(el), false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value)); fire(el); note(label, 'ok'); return true;
  }
  async function setSelect(id, wants, label, opts = {}) {
    const el = byId(id); if (!el) return note(label, 'failed', 'القايمة مش موجودة'), false;
    const list = [].concat(wants).filter((w) => String(w == null ? '' : w).trim());
    if (!list.length) return note(label, opts.optional ? 'ok' : 'manual', opts.optional ? 'اختياري: سيبته' : 'فاضي في النظام'), (opts.optional ? false : (mark(el), false));
    const loaded = await waitFor(() => real(el).length >= 1, opts.timeout || 10000);
    if (!loaded) return note(label, 'failed', 'القايمة ما اتحمّلتش'), mark(el), false;
    await sleep(350);
    const find = () => { for (const w of list) { const nw = norm(w); const o = real(el).find((x) => String(x.value) === String(w)) || real(el).find((x) => norm(x.textContent) === nw) || real(el).find((x) => { const t = norm(x.textContent); return nw.length >= 3 && (t.includes(nw) || nw.includes(t)); }) || real(el).find((x) => (CITY_SYN[nw] || []).some((s) => norm(x.textContent).includes(s))); if (o) return o; } return null; };
    const o = find();
    if (!o) return note(label, 'failed', 'مش لاقي «' + list[0] + '» — المتاح: ' + real(el).slice(0, 6).map((x) => x.textContent.trim()).join('، ')), mark(el), false;
    for (let i = 0; i < 3; i++) { el.value = o.value; fire(el); await sleep(500); if (String(el.value) === String(o.value)) break; await sleep(700); }
    if (String(el.value) !== String(o.value)) return note(label, 'failed', 'الموقع رجّع القيمة فاضية — اختارها بإيدك'), mark(el), false;
    note(label, 'ok'); return true;
  }
  async function setDate(id, iso, label) {
    const el = byId(id); if (!el) return note(label, 'failed', 'الخانة مش موجودة'), false;
    if (!iso) return note(label, 'manual', 'فاضي في النظام'), mark(el), false;
    const r = await send({ kind: 'wafid-date', id, iso });
    if (r && r.ok) { note(label, 'ok', r.value || ''); return true; }
    return note(label, 'failed', 'التاريخ ما اتحطّش (' + ((r && r.why) || 'تقويم الموقع مردّش') + ') — اكتبه بإيدك: ' + iso), mark(el), false;
  }

  function bar(html) {
    let b = byId('nesr-wf-bar'); if (!b) { b = document.createElement('div'); b.id = 'nesr-wf-bar'; document.body.appendChild(b); }
    b.setAttribute('dir', 'rtl');
    b.style.cssText = 'position:fixed;z-index:2147483647;left:50%;transform:translateX(-50%);bottom:10px;width:min(94vw,680px);max-height:60vh;overflow:auto;padding:10px 14px;border-radius:12px;font:600 13px Tahoma,Arial,sans-serif;background:#1d4486;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    b.innerHTML = html; return b;
  }
  const list = (arr) => (arr.length ? '<ul style="margin:4px 18px;padding:0">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');

  /* كل خطوة لوحدها: لو خطوة وقعت بخطأ، نكتب اسمها ونكمّل الباقي (بدل ما كل حاجة توقف) */
  const step = async (name, fn) => { try { await fn(); } catch (e) { report.failed.push(name + ': حصل خطأ (' + String(e && e.message || e) + ')'); } };
  async function fillAll(w, setStatus) {
    setStatus('الموقع والدولة…');
    await step('الدولة', () => setSelect('id_country', w.country, 'الدولة'));
    await step('المدينة', async () => { await waitFor(() => { const c = byId('id_city'); return c && real(c).length >= 1; }, 12000); await setSelect('id_city', w.city, 'المدينة', { timeout: 12000 }); });
    await step('الدولة المتوجه إليها', () => setSelect('id_traveled_country', w.traveled, 'الدولة المتوجه إليها'));
    setStatus('بيانات المتقدم…');
    await step('الاسمين', async () => { setInput('id_first_name', w.first, 'الاسم الأول'); setInput('id_last_name', w.last, 'اسم العائلة'); });
    await step('الجنسية', () => setSelect('id_nationality', ['55', w.nationalityText, 'Egyptian'], 'الجنسية'));
    await step('الجنس', () => setSelect('id_gender', w.gender, 'الجنس'));
    await step('الحالة الاجتماعية', () => setSelect('id_marital_status', w.marital, 'الحالة الاجتماعية'));
    await step('الجواز', async () => { setInput('id_passport', w.passport, 'رقم الجواز'); setInput('id_confirm_passport', w.passport, 'تأكيد رقم الجواز'); setInput('id_passport_issue_place', w.issuePlace, 'مكان إصدار الجواز'); });
    await step('الاتصال', async () => { setInput('id_email', w.email, 'البريد الإلكتروني'); setInput('id_phone', w.phone, 'رقم الهاتف'); setInput('id_national_id', w.nationalId, 'الهوية الوطنية'); });
    await step('الوظيفة', () => setSelect('id_applied_position', w.position, 'الوظيفة المتقدم إليها', { optional: true, timeout: 3000 }));
    setStatus('التواريخ…');
    await step('تاريخ الميلاد', () => setDate('id_dob', w.dob, 'تاريخ الميلاد'));
    await step('تاريخ إصدار الجواز', () => setDate('id_passport_issue_date', w.issueDate, 'تاريخ إصدار الجواز'));
    await step('تاريخ انتهاء الجواز', () => setDate('id_passport_expiry_on', w.expiryDate, 'تاريخ انتهاء الجواز'));
    setStatus('نوع التأشيرة…');
    await sleep(600);
    await step('نوع التأشيرة', () => setSelect('id_visa_type', w.visa, 'نوع التأشيرة', { timeout: 6000 }));
    /* نوع الموعد: لو اختيار واحد بس ظاهر (الموعد العادي) بنضغط عليه عشان الموقع يسجّله (ساعات بيبان متعلّم وهو مش متسجّل). لو فيه أكتر من اختيار (فيه فرق سعر) بنسيبهم ليك */
    await step('نوع الموعد', async () => {
      const radios = [...document.querySelectorAll('input[name="appointment_type"]')]; const vis = radios.filter((r) => { const c = r.closest('.card'); return c && c.offsetParent !== null; });
      if (vis.length === 1) { const r = vis[0]; if (!r.checked) { (r.closest('.card') || r).click(); await sleep(300); if (!r.checked) { r.checked = true; fire(r); } } note('نوع الموعد', 'ok', 'الموعد العادي'); }
      else if (vis.length > 1) { note('نوع الموعد', 'manual', 'فيه أكتر من اختيار (بسعر مختلف): اختار بإيدك'); radios.forEach((r) => mark(r.closest('.card'))); }
    });
    /* الإقرار بصحة المعلومات: بإيدك (مش بنعلّمه تلقائياً هنا) */
    /* الإقرار بصحة المعلومات: بيتعلّم بس لو أحمد فعّل «تعليم الإقرارات تلقائياً» في ملف الضبط (طلبه صراحة)، وإلا بإيدك */
    const conf = byId('id_confirm');
    if (conf && w.autoDeclare) {
      await step('الإقرار', async () => { if (!conf.checked) { (conf.closest('.checkbox') || conf).click(); await sleep(250); if (!conf.checked) { conf.checked = true; fire(conf); } } if (conf.checked) note('الإقرار بصحة المعلومات', 'ok', 'اتعلّم بطلبك'); else { note('الإقرار بصحة المعلومات', 'failed', 'ما اتعلّمش'); mark(conf.closest('.checkbox') || conf); } });
    } else if (conf) mark(conf.closest('.checkbox') || conf);
    mark(byId('id_appointment_date'));
  }

  const queueHtml = (ctx) => {
    const q = Array.isArray(ctx.queue) ? ctx.queue : []; if (!q.length) return '';
    const total = ctx.queueTotal || (q.length + 1); const idx = total - q.length;
    return '<div style="margin-top:6px;padding:6px 8px;background:#ffffff22;border-radius:8px">📋 الشخص ' + idx + ' من ' + total + ' — التالي: <b>' + esc(q[0].name) + '</b> (باقي ' + q.length + ') <button id="nesr-wf-next" style="background:#fff;color:#1d4486;border:0;border-radius:8px;padding:5px 10px;font:700 12px Tahoma;cursor:pointer;margin-inline-start:6px">الشخص التالي</button></div>';
  };

  (async function run() {
    const { ctx } = await send({ kind: 'get-wafid-ctx' }); if (!ctx || !ctx.wafid) return;
    const flag = 'va_wf_' + ctx.personId + '_' + ctx.at; try { if (sessionStorage.getItem(flag)) return; } catch (e) { /* مش مهم */ }
    const status = (t) => bar('<span>🏥 ' + esc(ctx.name || '') + ' — ' + esc(t) + '</span>');
    status('بيملا فورم الفحص الطبي…');
    try { await fillAll(ctx.wafid, status); } catch (e) { report.failed.push('حصل خطأ غير متوقع: ' + String(e && e.message || e)); }
    try { sessionStorage.setItem(flag, '1'); } catch (e) { /* مش مهم */ }
    const bad = report.failed.length || ctx.issues.length;
    const b = bar('<div><b>' + (bad ? '⚠️' : '✅') + ' اتملى ' + report.ok.length + ' خانة' + (report.failed.length ? ' · ' + report.failed.length + ' محتاجة راجعة' : '') + '</b> — دلوقتي:</div>' +
      '<ol style="margin:4px 18px;padding:0"><li>راجع الخانات اللي حواليها إطار برتقالي</li><li>اختار <b>تاريخ الموعد</b> (من الموقع)</li><li>' + (ctx.wafid.autoDeclare ? 'الإقرار اتعلّم' : 'علّم على الإقرار') + '، ولو طلب كود تحقق/OTP اكتبه</li><li>دوس «حفظ ومتابعة»</li></ol>' +
      (ctx.issues.length ? '<div>⛔ في النظام:</div>' + list(ctx.issues) : '') + (report.failed.length ? '<div>❌ مش اتملى:</div>' + list(report.failed) : '') + (report.manual.length ? '<div>✋ فاضي في النظام:</div>' + list(report.manual) : '') + ((ctx.warns || []).length ? '<div>ℹ️</div>' + list(ctx.warns) : '') +
      queueHtml(ctx) + '<div style="margin-top:6px"><button id="nesr-wf-hide" style="background:#ffffff33;color:#fff;border:0;border-radius:8px;padding:6px 12px;font:700 12px Tahoma;cursor:pointer">إخفاء</button></div>');
    const nx = b.querySelector('#nesr-wf-next');
    if (nx) nx.addEventListener('click', async () => { nx.disabled = true; nx.textContent = 'بيجهّز…'; const r = await send({ kind: 'next' }); if (!r || !r.ok) { nx.disabled = false; nx.textContent = 'الشخص التالي'; alert((r && r.error) || 'مش قادر أفتح الشخص التالي'); } });
    const h = b.querySelector('#nesr-wf-hide'); if (h) h.addEventListener('click', () => b.remove());
  })();
})();
