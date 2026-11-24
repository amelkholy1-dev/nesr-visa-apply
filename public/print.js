'use strict';
/* طباعة الباركود عن طريق برنامج Masar Print Agent (نفس برنامج نظام الجوازات): الليبل بيتبني هنا بنفس صيغة نظام الجوازات (باركود Code128 من الطابعة نفسها)،
   والنظام بيحطه في طابور، والبرنامج على جهاز الطابعة بيسحبه ويطبعه. «تجهيز الطباعة» = باركود رقم الطلب + باركود التأشيرة + خطاب الترشيح (Word). */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const mm = (v, dpi) => Math.max(1, Math.round((Number(v) || 0) * (Number(dpi) || 203) / 25.4));
  const clean = (v) => String(v == null ? '' : v).replace(/,+/g, '').replace(/\s+/g, '').trim().toUpperCase();

  /* صورة الكود المكتوب تحت الباركود (الطابعة بتطبع الباركود نفسه، والنص صورة) */
  function textBitmap(code, s) {
    const dpi = Number(s.dpi) || 203; const w = mm(s.textWidthMm, dpi), h = mm(s.textHeightMm, dpi);
    const c = document.createElement('canvas'); c.width = 2 * w; c.height = 2 * h; const g = c.getContext('2d'); if (!g) return null;
    g.scale(2, 2); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h); g.fillStyle = '#000000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = Math.max(8, Math.round((Number(s.textFontSize) || 20) * dpi / 72)); const font = () => { g.font = `${s.textBold ? '700' : '400'} ${size}px Arial, Tahoma, sans-serif`; };
    for (font(); g.measureText(code).width > w - 4 && size > 8;) { size -= 1; font(); }
    g.fillText(code, w / 2, h / 2 + 1); return { dataUrl: c.toDataURL('image/png'), widthDots: w, heightDots: h };
  }
  /* أوامر طابعة BIXOLON (WebPrintSDK Label JSON) — نفس اللي نظام الجوازات بيبعته */
  function nativeJson(code, s) {
    const dpi = Number(s.dpi) || 203; const id = Date.now() % 1e8; const W = mm(s.labelWidthMm, dpi), H = mm(s.labelHeightMm, dpi); const lw = Math.max(1, W - 2), lh = Math.max(1, H - 2);
    const dx = (v) => Math.max(0, Math.min(mm(v, dpi), lw)), dy = (v) => Math.max(0, Math.min(mm(v, dpi), lh));
    const showBarcode = s.outputMode !== 'text_only'; const showText = s.outputMode !== 'barcode_only' && s.showText !== false;
    const f = [['setLabelId', [id]], ['checkLabelStatus', []], ['clearBuffer', []], ['setPrintingType', ['d']], ['setWidth', [W]], ['setLength', [H, Number(s.gapDots) || 16, s.mediaType || 'G', 0]], ['setMargin', [0, 0]],
      ['setOrientation', [s.orientation || 'T']], ['setSpeed', [Number(s.speed) || 3]], ['setDensity', [Number(s.density) || 15]], ['setCharacterset', [0, 19]]];
    if (showBarcode) f.push(['draw1DBarcode', [code, dx(s.barcodeXmm), dy(s.barcodeYmm), 1, Number(s.barcodeNarrow) || 2, Number(s.barcodeWide) || 5, mm(s.barcodeHeightMm, dpi), 0, 0]]);
    if (showText) { const b = textBitmap(code, s); if (b && b.dataUrl) f.push(['drawBitmap', [b.dataUrl, dx(s.textXmm), dy(s.textYmm), b.widthDots, 0]]); }
    f.push(['printBuffer', []]);
    const o = { id, functions: {} }; f.forEach(([n, a], i) => { o.functions['func' + (i + 1)] = { [n]: a }; }); return JSON.stringify(o);
  }
  function labelPayload(code, s, person) {
    code = clean(code);
    return { version: 4, type: 'passport_barcode_label', printMode: 'native-first', code, content: code, symbolData: code, fullContent: code, barcodeData: code, nativeLabelJson: nativeJson(code, s), name: '',
      label: { widthMm: Number(s.labelWidthMm) || 52, heightMm: Number(s.labelHeightMm) || 31, dpi: Number(s.dpi) || 203 },
      settings: { showName: false, showId: s.outputMode !== 'barcode_only' && !!s.showText, showBarcode: s.outputMode !== 'text_only', codeType: 'barcode', idXmm: Number(s.textXmm) || 0, idYmm: Number(s.textYmm) || 0, idWidthMm: Number(s.textWidthMm) || 48, idHeightMm: Number(s.textHeightMm) || 6, idFontSize: Number(s.textFontSize) || 20, idBold: !!s.textBold, idAlign: 'center',
        barcodeXmm: Number(s.barcodeXmm) || 0, barcodeYmm: Number(s.barcodeYmm) || 0, barcodeHeightMm: Number(s.barcodeHeightMm) || 19, barcodeNarrow: Number(s.barcodeNarrow) || 2, barcodeWide: Number(s.barcodeWide) || 5, density: Number(s.density) || 15, speed: Number(s.speed) || 3, gapDots: Number(s.gapDots) || 16, mediaType: s.mediaType || 'G', orientation: s.orientation || 'T' },
      passport: person ? { passportId: person.personId || null, officeSerial: '', passportNumber: person.passportNo || '', company: person.batch || '', delegate: '' } : null };
  }
  const info = () => NA.api('GET', '/print/info');
  async function sendLabel(code, settings, opts) {
    const o = opts || {};
    return NA.api('POST', '/print/jobs', { payload: labelPayload(code, settings, o.person), copies: o.copies || settings.printCopies || 1, batchId: o.batchId || '', personId: o.person && o.person.personId, label: o.label || '' });
  }
  async function waitJob(id, ms) {
    const t0 = Date.now(); let last = { status: 'pending' };
    while (Date.now() - t0 < (ms || 90000)) { await new Promise((r) => setTimeout(r, 1500)); try { last = await NA.api('GET', `/print/jobs/${id}`); } catch (e) { continue; } if (last.status === 'printed' || last.status === 'failed') return last; }
    return last;
  }

  /* باركود واحد بسرعة (رقم الطلب أو التأشيرة) مع رسالة واضحة بالنتيجة */
  async function quickLabel(personId, which) {
    const { api, toast } = NA;
    try {
      const [p, inf] = await Promise.all([api('GET', `/print/pack/${personId}`), info()]);
      const code = which === 'visa' ? p.visaNumber : p.appNumber; const label = which === 'visa' ? 'باركود التأشيرة' : 'باركود رقم الطلب';
      if (!code) return toast(which === 'visa' ? 'رقم التأشيرة ناقص في الدفعة' : 'الشخص ده لسه مالوش رقم طلب (إنجاز): سجّله أو دوس «هات رقم إنجاز» الأول', 'err');
      if (!inf.agents.some((a) => a.isOnline)) return toast(inf.configured ? 'برنامج الطباعة مش متصل: شغّله على جهاز الطابعة واضغط «حفظ وتشغيل» (وشوف الإعدادات ← طباعة الباركود)' : 'برنامج الطباعة لسه مش متظبط (الإعدادات ← طباعة الباركود)', 'err');
      const r = await sendLabel(code, inf.settings, { person: p, copies: inf.settings.printCopies || 1, label: label + ' ' + p.name });
      toast(`اتبعت ${label} (${code}) للطابعة ${r.printerName || ''}… بيستنى التأكيد`, 'ok');
      const j = await waitJob(r.jobId, 90000);
      if (j.status === 'printed') toast(`اتطبع ${label} ${code} ✔`, 'ok');
      else if (j.status === 'failed') toast(`الطباعة فشلت: ${j.error || 'من غير سبب'} — افحص الطابعة والورق`, 'err');
      else toast('الأمر لسه في الطابور: برنامج الطباعة مش بيسحب. افتحه واضغط «حفظ وتشغيل».', 'err');
    } catch (er) { NA.fail(er); }
  }
  /* ===== تجهيز الطباعة: باركود رقم الطلب + باركود التأشيرة + خطاب الترشيح ===== */
  NA.print = { labelPayload, nativeJson, sendLabel, info, waitJob, clean, quickLabel };
  NA.print.prepare = async function (ids) {
    const { e, api, toast, fail } = NA; ids = (ids || []).map(String); if (!ids.length) return;
    let packs, inf;
    try { [packs, inf] = await Promise.all([Promise.all(ids.map((id) => api('GET', `/print/pack/${id}`))), info()]); } catch (er) { return fail(er); }
    const many = packs.length > 1; const kindName = { suez: 'السويس', cairo: 'القاهرة' };
    const agentOk = inf.agents.some((a) => a.isOnline);
    NA.modal(`<h2>تجهيز الطباعة${many ? ' (' + packs.length + ' شخص)' : ''}</h2>
      <div class="muted small" style="margin-bottom:10px">بيطبع باركود رقم الطلب وباركود التأشيرة على الليبل (برنامج الطباعة)، وبينزّل خطاب الترشيح (Word) للطباعة.</div>
      ${agentOk ? '' : `<div class="card issues" style="margin-bottom:10px">${inf.configured ? 'مفيش جهاز طباعة متصل دلوقتي: شغّل برنامج طباعة الباركود على جهاز الطابعة. (الخطاب هينزل عادي.)' : 'برنامج الطباعة لسه مش متظبط على السيرفر (المدير: الإعدادات ← طباعة الباركود). الخطاب هينزل عادي.'}</div>`}
      <div class="tbl-wrap" style="max-height:34vh;border:1px solid var(--line);border-radius:10px"><table><thead><tr><th>الشخص</th><th>رقم الطلب</th><th>رقم التأشيرة</th><th>الخطاب</th></tr></thead><tbody>${packs.map((p, i) => `<tr data-i="${i}"><td class="pcell"><b>${e(p.name)}</b><small>${e(p.passportNo)}</small>${p.missing.length ? `<div class="small" style="color:var(--bad)">${e(p.missing.join(' · '))}</div>` : ''}</td>
        <td dir="ltr">${p.appNumber ? e(p.appNumber) : '<span class="muted">—</span>'}</td><td dir="ltr">${p.visaNumber ? e(p.visaNumber) : '<span class="muted">—</span>'}</td>
        <td><select class="pkKind"><option value="">من غير خطاب</option><option value="suez"${p.letterKind === 'suez' ? ' selected' : ''}>السويس</option><option value="cairo"${p.letterKind === 'cairo' ? ' selected' : ''}>القاهرة</option></select></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:12px"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pkApp" checked> باركود رقم الطلب</label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pkVisa" checked> باركود التأشيرة</label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pkLet" checked> خطاب الترشيح (Word)</label>
        <label class="f" style="margin-inline-start:auto;width:120px">عدد النسخ<input type="number" id="pkCopies" min="1" max="20" value="${inf.settings.printCopies || 1}"></label></div>
      <div id="pkLog" class="small" style="margin-top:10px"></div>
      <div class="foot"><button class="btn" id="pkX">قفل</button><button class="btn pri" id="pkGo">ابدأ التجهيز</button></div>`, (m, close) => {
      m.style.maxWidth = '860px'; const log = (h) => { m.querySelector('#pkLog').innerHTML = h; };
      m.querySelector('#pkX').onclick = close;
      m.querySelector('#pkGo').onclick = async () => {
        const go = m.querySelector('#pkGo'); go.disabled = true; const copies = Math.min(20, Math.max(1, Number(m.querySelector('#pkCopies').value) || 1));
        const wantApp = m.querySelector('#pkApp').checked, wantVisa = m.querySelector('#pkVisa').checked, wantLet = m.querySelector('#pkLet').checked;
        const kinds = [...m.querySelectorAll('.pkKind')].map((s2) => s2.value); const out = []; const jobs = [];
        try {
          if ((wantApp || wantVisa) && agentOk) {
            const batchId = 'prep-' + Date.now();
            for (let i = 0; i < packs.length; i++) {
              const p = packs[i]; log(`بيبعت الليبلات… ${i + 1} من ${packs.length}`);
              for (const [on, code, label] of [[wantApp, p.appNumber, 'باركود رقم الطلب'], [wantVisa, p.visaNumber, 'باركود التأشيرة']]) {
                if (!on) continue; if (!code) { out.push([p.name, label, 'skip', 'مش موجود']); continue; }
                try { const r = await sendLabel(code, inf.settings, { person: p, copies, batchId, label: label + ' ' + p.name }); jobs.push({ id: r.jobId, p, label, code }); } catch (er) { out.push([p.name, label, 'err', er.message]); if (/متصل|مسجّل|جهاز/.test(er.message)) throw er; }
              }
            }
            for (let k = 0; k < jobs.length; k++) { const j = jobs[k]; log(`بيستنى الطابعة… ${k + 1} من ${jobs.length}`); const r = await waitJob(j.id, 90000); out.push([j.p.name, j.label + ' ' + j.code, r.status === 'printed' ? 'ok' : r.status === 'failed' ? 'err' : 'wait', r.status === 'printed' ? 'اتطبع' : r.status === 'failed' ? (r.error || 'فشلت') : 'لسه في الطابور (البرنامج ممكن يكون واقف)']); }
          } else if (wantApp || wantVisa) out.push(['—', 'الباركودات', 'skip', 'مفيش جهاز طباعة متصل']);
          if (wantLet) {
            const withKind = packs.map((p, i) => ({ p, kind: kinds[i] })).filter((x) => x.kind);
            if (!withKind.length) out.push(['—', 'الخطاب', 'skip', 'اختار نوع الخطاب']);
            else if (withKind.length === 1) { await NA.letterDownload(withKind[0].p.personId, withKind[0].kind); out.push([withKind[0].p.name, 'خطاب ' + kindName[withKind[0].kind], 'ok', 'بينزّل (Word)']); }
            else { const suez = withKind.filter((x) => x.kind === 'suez').map((x) => x.p.personId), cairo = withKind.filter((x) => x.kind === 'cairo').map((x) => x.p.personId); const ids2 = []; if (suez.length) ids2.push(['suez', suez]); if (cairo.length) ids2.push(['cairo', cairo]);
              for (const [kind, list] of ids2) { const a = document.createElement('a'); a.href = `/api/people/letters-bundle?ids=${list.join(',')}&kind=${kind}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); await new Promise((r) => setTimeout(r, 900)); out.push([list.length + ' شخص', 'خطابات ' + kindName[kind], 'ok', 'ملف zip بينزّل']); } }
          }
        } catch (er) { out.push(['—', '', 'err', er.message]); }
        const cls = { ok: 'ok', err: 'bad', skip: '', wait: 'warn' }; const lab = { ok: 'تمام', err: 'مشكلة', skip: 'اتخطّى', wait: 'مستني' };
        log(`<table><tbody>${out.map((r) => `<tr><td>${e(r[0])}</td><td>${e(r[1])}</td><td><span class="chip ${cls[r[2]]}">${lab[r[2]]}</span></td><td class="small muted">${e(r[3])}</td></tr>`).join('')}</tbody></table>`);
        go.disabled = false; go.textContent = 'اعمل تاني';
      };
    }, { sticky: true });
  };
})();
