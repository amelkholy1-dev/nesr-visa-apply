'use strict';
/* أيقونات خطّية بسيطة (SVG) — نفس روح نظام الجوازات */
(function () {
  const NA = (window.NA = window.NA || { pages: {} });
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    template: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    puzzle: '<path d="M10 4a2 2 0 1 1 4 0v1h4v4h1a2 2 0 1 1 0 4h-1v5h-5v-1a2 2 0 1 0-4 0v1H4v-5h1a2 2 0 1 0 0-4H4V5h6V4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    down: '<path d="M12 4v13"/><path d="m6 11 6 6 6-6"/><path d="M4 20h16"/>',
    up: '<path d="M12 20V7"/><path d="m6 13 6-6 6 6"/><path d="M4 4h16"/>',
    swap: '<path d="M4 8h14l-4-4"/><path d="M20 16H6l4 4"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M3 20h18"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    fwd: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
    collapse: '<path d="m13 6 6 6-6 6"/><path d="m5 6 6 6-6 6"/>',
    file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>'
  };
  NA.icon = (n, size) => `<svg class="ic" viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.file}</svg>`;
  /* لوجو «إنجاز»: ورقة (طلب) عليها علامة صح، بألوان الشكل المختار. tile = لون الخلفية، doc = الورقة، acc = علامة الصح */
  const SKIN = { petrol: { p: '#0f6f80', d: '#0b4f5c', a: '#f59e0b' }, olive: { p: '#557a49', d: '#3d5a35', a: '#d9b45a' } };
  NA.logoSvg = (skin, opts) => {
    const c = SKIN[skin] || SKIN.petrol; const o = opts || {}; const tile = o.tile || c.p, doc = o.doc || '#fff', line = o.line || c.p, acc = c.a;
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="إنجاز"><rect width="64" height="64" rx="16" fill="${tile}"/>`
      + `<path d="M19 10h19l11 11v29a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="${doc}"/>`
      + `<path d="M38 10v8a3 3 0 0 0 3 3h8z" fill="${line}" opacity=".28"/>`
      + `<rect x="21" y="24" width="15" height="3.4" rx="1.7" fill="${line}" opacity=".55"/><rect x="21" y="31" width="21" height="3.4" rx="1.7" fill="${line}" opacity=".35"/><rect x="21" y="38" width="11" height="3.4" rx="1.7" fill="${line}" opacity=".35"/>`
      + `<circle cx="44" cy="45" r="12" fill="${acc}" stroke="${tile}" stroke-width="3.5"/><path d="M38.6 45.2l3.9 3.9 7.2-7.6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  /* الألوان + الوضع الليلي + أيقونة التاب */
  NA.applyLook = (look) => {
    const l = look || {}; const skin = l.skin === 'olive' ? 'olive' : 'petrol';
    document.documentElement.setAttribute('data-skin', skin); if (l.dark) document.documentElement.setAttribute('data-mode', 'dark'); else document.documentElement.removeAttribute('data-mode');
    try { localStorage.setItem('look', JSON.stringify({ skin, dark: !!l.dark })); } catch (e) { /* مش مهم */ }
    let fav = document.querySelector('link[rel="icon"]'); if (!fav) { fav = document.createElement('link'); fav.rel = 'icon'; document.head.appendChild(fav); }
    fav.type = 'image/svg+xml'; fav.href = 'data:image/svg+xml,' + encodeURIComponent(NA.logoSvg(skin));
    const lg = document.querySelector('.sidebar .brand .logo'); if (lg) lg.innerHTML = NA.logoSvg(skin, { tile: '#ffffff', doc: SKIN[skin].p, line: '#fff' });
  };
})();
