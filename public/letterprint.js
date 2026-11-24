'use strict';
/* طباعة خطابات الترشيح على طول (من غير تنزيل Word): السيرفر بيعمل نفس ملف الـ Word، والمتصفح بيعرضه (docx-preview)
   في إطار مخفي، كل خطاب على صفحة A4 واحدة، وبعدين بيفتح نافذة الطباعة. ملف الـ Word نفسه لسه موجود لو عايز تنزّله. */
(function () {
  const NA = window.NA;
  const kindName = { suez: 'السويس', cairo: 'القاهرة' };
  const loadScript = (doc, src) => new Promise((res, rej) => { const s = doc.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('مقدرتش أحمّل ' + src)); doc.head.appendChild(s); });

  /* list = [{ id, kind, name }] ← بيرجّع عدد الخطابات اللي اتجهّزت للطباعة */
  async function letterPrint(list, opts) {
    const { api, toast } = NA; opts = opts || {};
    list = (list || []).filter((x) => x && x.id && kindName[x.kind]); if (!list.length) return 0;
    /* النواقص الأول (زي التنزيل): بنسأل مرة واحدة للكل */
    const warns = [];
    for (const x of list) {
      try { const c = await api('GET', `/people/${x.id}/letter/${x.kind}?check=1`); const w = [...(c.hints && c.hints.length ? c.hints : (c.issues || []).map((y) => y + ' (ناقص)')), ...(c.warns || []), ...(c.hasPhoto ? [] : ['الصورة الشخصية ناقصة: الخطاب هيطلع من غير صورة'])]; if (w.length) warns.push((list.length > 1 ? (x.name || '#' + x.id) + ': ' : '') + w.join(' · ')); } catch (er) { warns.push((x.name || '#' + x.id) + ': ' + er.message); }
    }
    if (warns.length && !opts.noConfirm && !confirm('الخطاب هيطلع ناقص:\n- ' + warns.join('\n- ') + '\n\nتطبعه كده؟ (دوس إلغاء، كمّل البيانات، وجرّب تاني)')) return 0;
    toast(list.length > 1 ? `بيجهّز ${list.length} خطاب للطباعة…` : 'بيجهّز الخطاب للطباعة…', 'ok');
    const files = [];
    for (const x of list) {
      const r = await fetch(`/api/people/${x.id}/letter/${x.kind}`, { credentials: 'same-origin' });
      if (!r.ok) { let m = 'الخطاب ما اتعملش'; try { m = (await r.json()).error || m; } catch (e) { /* مش مهم */ } throw new Error((x.name ? x.name + ': ' : '') + m); }
      files.push(await r.arrayBuffer());
    }
    const old = document.getElementById('naLetterFrame'); if (old) old.remove();
    const fr = document.createElement('iframe'); fr.id = 'naLetterFrame'; fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument; doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>خطابات الترشيح</title><style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.docx-wrapper{background:none!important;padding:0!important;display:block!important}section.docx{margin:0 auto!important;box-shadow:none!important;overflow:hidden!important;break-after:page;page-break-after:always}section.docx:last-of-type{break-after:auto;page-break-after:auto}</style></head><body><div id="root"></div></body></html>');
    doc.close();
    await loadScript(doc, '/vendor/docx/jszip.min.js'); await loadScript(doc, '/vendor/docx/docx-preview.min.js');
    const W = fr.contentWindow; const root = doc.getElementById('root');
    for (const buf of files) {
      const box = doc.createElement('div'); root.appendChild(box);
      await W.docx.renderAsync(new W.Blob([buf]), box, box, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, experimental: true });
      /* صفحات فاضية في الآخر بتتشال، وكل خطاب بيتصغّر لو محتاج عشان ييجي في صفحة واحدة */
      box.querySelectorAll('section.docx').forEach((s) => { if (!s.querySelector('img,svg') && !String(s.innerText || '').trim()) s.remove(); });
    }
    await new Promise((r) => setTimeout(r, 50));
    await Promise.all([...doc.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 4000); })));
    doc.querySelectorAll('section.docx').forEach((s) => {
      if (s.style.minHeight) s.style.height = s.style.minHeight;
      const art = s.querySelector('article') || s; art.style.zoom = '';
      const inner = s.scrollHeight, h = s.clientHeight; if (h && inner > h + 2) art.style.zoom = String(Math.max(0.5, (h / inner) * 0.99).toFixed(3));
    });
    fr.dataset.ready = String(doc.querySelectorAll('section.docx').length);
    if (opts.noPrint) return list.length;
    W.focus(); W.print();
    setTimeout(() => { try { fr.remove(); } catch (e) { /* مش مهم */ } }, 120000);
    return list.length;
  }
  NA.letterPrint = async (list, opts) => { try { return await letterPrint(list, opts); } catch (er) { NA.fail(er); return 0; } };
})();
