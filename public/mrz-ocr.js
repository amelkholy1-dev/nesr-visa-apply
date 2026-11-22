'use strict';
/* قراءة سطري MRZ من صورة الجواز جوه المتصفح (Tesseract.js، من غير مفتاح ومن غير ما الصورة تروح لأي خدمة).
   بنقصّ الجزء اللي تحت (فيه MRZ) بأكتر من مقاس، ونحسّن التباين، ونقرا بحروف وأرقام و«<» بس، وبعدين السيرفر بيفحص أرقام التحقق
   ويقول الدقة. الدقة بتتأثر بجودة الصورة: صورة مسطّحة وواضحة وبإضاءة كويسة = أحسن نتيجة. */
(function () {
  const BASE = '/vendor/tesseract/';
  let loading = null, worker = null;

  const loadScript = () => loading || (loading = new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script'); s.src = BASE + 'tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('تعذر تحميل محرك القراءة')); document.head.appendChild(s);
  }));

  async function getWorker(onProgress) {
    await loadScript();
    if (worker) return worker;
    worker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: BASE + 'worker.min.js', corePath: BASE, langPath: BASE, gzip: true, workerBlobURL: false,
      logger: (m) => { if (onProgress && m && m.status) onProgress(m); }
    });
    await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<', tessedit_pageseg_mode: '6', preserve_interword_spaces: '0' });
    return worker;
  }

  const toImage = (blob) => new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error('الصورة مش مفهومة')); i.src = u; });

  /* جزء من أسفل الصورة (fraction من الارتفاع)، متكبّر لعرض ~1800، رمادي بتباين ممدود */
  function cropCanvas(img, fraction, scaleTo) {
    const srcH = Math.round(img.naturalHeight * fraction), srcY = img.naturalHeight - srcH;
    const sc = scaleTo / img.naturalWidth;
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(srcH * sc);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data, hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) { const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0; px[i] = px[i + 1] = px[i + 2] = y; hist[y]++; }
    const total = c.width * c.height; let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
    acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
    const span = Math.max(40, hi - lo);
    for (let i = 0; i < px.length; i += 4) { const y = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span)); px[i] = px[i + 1] = px[i + 2] = y; }
    g.putImageData(d, 0, 0);
    return c;
  }

  /* بيرجّع كل النصوص المقروءة (من أكتر من قصّة) عشان السيرفر يختار أحسن واحد */
  async function read(blob, onProgress, opts) {
    if (!blob || /pdf/i.test(blob.type)) throw new Error('القراءة من الصورة بتشتغل مع JPG/PNG بس (مش PDF).');
    const w = await getWorker(onProgress);
    const img = await toImage(blob);
    const texts = [];
    const plans = opts && opts.cropped ? [[1, 1800], [1, 2400], [1, 1400]] : [[0.22, 1800], [0.30, 1800], [0.42, 2000], [0.16, 1600]]; /* cropped: المستخدم حدّد منطقة MRZ بنفسه */
    for (const [frac, width] of plans) {
      if (onProgress) onProgress({ status: 'reading', crop: frac });
      const { data } = await w.recognize(cropCanvas(img, frac, width));
      if (data && data.text && data.text.replace(/[^A-Z0-9<]/g, '').length > 40) texts.push(data.text);
    }
    return texts;
  }

  window.MrzOcr = { read };
})();
