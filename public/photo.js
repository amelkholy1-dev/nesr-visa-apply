'use strict';
/* معالجة الصورة الشخصية (جوه المتصفح، مفيش حاجة بتتبعت لأي سيرفر): خلفية بيضاء + إزالة تشويش.
   بتشتغل كويس مع خلفية ثابتة اللون تقريباً (زي معظم صور الجوازات). لو الخلفية معقّدة بتكتفي بإزالة التشويش من غير ما تمس الخلفية. */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const load = (blob) => new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error('الصورة مش مفهومة')); i.src = u; });

  /* تنعيم يحافظ على الحواف (bilateral 5×5) — بيشيل حبيبات الكاميرا من غير ما يطمّس الملامح */
  function denoise(d, w, h) {
    const src = d.data; const out = new Uint8ClampedArray(src.length); const R = 2, SC = 28 * 28 * 2, SS = 2 * 2 * 2;
    const ws = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) ws.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / SS)]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; const r0 = src[i], g0 = src[i + 1], b0 = src[i + 2]; let sr = 0, sg = 0, sb = 0, sw = 0;
        for (const [dx, dy, wsp] of ws) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4; const dr = src[j] - r0, dg = src[j + 1] - g0, db = src[j + 2] - b0;
          const wt = wsp * Math.exp(-(dr * dr + dg * dg + db * db) / SC); sr += src[j] * wt; sg += src[j + 1] * wt; sb += src[j + 2] * wt; sw += wt;
        }
        out[i] = sr / sw; out[i + 1] = sg / sw; out[i + 2] = sb / sw; out[i + 3] = 255;
      }
    }
    return new ImageData(out, w, h);
  }
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

  /* بترجّع { blob, applied, note }: applied=true لو الخلفية اتبيّضت */
  async function clean(file, opts) {
    const maxSide = (opts && opts.maxSide) || 900;
    const img = await load(file); const sc = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * sc)), h = Math.max(8, Math.round(img.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const smooth = denoise(g.getImageData(0, 0, w, h), w, h); const px = smooth.data;
    /* لون الخلفية = وسيط البكسلات اللي على الحواف */
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.03)); const rs = [], gs = [], bs = [];
    const take = (x, y) => { const i = (y * w + x) * 4; rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); };
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (x < band || y < band || x >= w - band) take(x, y);
    const bg = [median(rs), median(gs), median(bs)];
    const dist = (i) => { const a = px[i] - bg[0], b = px[i + 1] - bg[1], cc = px[i + 2] - bg[2]; return Math.sqrt(a * a + b * b + cc * cc); };
    const ds = []; for (let k = 0; k < rs.length; k++) ds.push(Math.sqrt((rs[k] - bg[0]) ** 2 + (gs[k] - bg[1]) ** 2 + (bs[k] - bg[2]) ** 2));
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length; const sd = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length);
    const T = Math.max(26, Math.min(62, mean + 3 * sd + 12));
    let applied = false, note = '';
    if (sd > 38) note = 'الخلفية مش ثابتة اللون: اتشال التشويش بس وسبت الخلفية.';
    else {
      /* ملء من الحواف: كل بكسل شبه لون الخلفية ومتّصل بالحافة = خلفية */
      const bgm = new Uint8Array(w * h); const stack = [];
      const push = (x, y) => { const p = y * w + x; if (!bgm[p] && dist(p * 4) < T) { bgm[p] = 1; stack.push(p); } };
      for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
      while (stack.length) { const p = stack.pop(); const x = p % w, y = (p / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
      let n = 0; for (let p = 0; p < bgm.length; p++) n += bgm[p]; const frac = n / bgm.length;
      if (frac < 0.06 || frac > 0.85) note = 'مقدرتش أفصل الخلفية بثقة (' + Math.round(frac * 100) + '%): اتشال التشويش بس.';
      else {
        /* حواف ناعمة: بنعمل blur خفيف للقناع عشان مفيش حدّة مصطنعة حوالين الشخص */
        const a = new Float32Array(w * h); for (let p = 0; p < a.length; p++) a[p] = bgm[p];
        const tmp = new Float32Array(a.length); const r = 2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, k = 0; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += a[y * w + xx]; k++; } } tmp[y * w + x] = s / k; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, k = 0; for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; k++; } } a[y * w + x] = s / k; }
        for (let p = 0; p < a.length; p++) { const al = a[p]; if (al <= 0) continue; const i = p * 4; const t = bgm[p] ? 1 : Math.min(1, al * 1.4); px[i] = px[i] * (1 - t) + 255 * t; px[i + 1] = px[i + 1] * (1 - t) + 255 * t; px[i + 2] = px[i + 2] * (1 - t) + 255 * t; }
        applied = true; note = 'الخلفية اتبيّضت (' + Math.round(frac * 100) + '% من الصورة) واتشال التشويش.';
      }
    }
    g.putImageData(smooth, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
    return { blob: new File([blob], 'photo.jpg', { type: 'image/jpeg' }), applied, note };
  }
  NA.photo = { clean };
})();
