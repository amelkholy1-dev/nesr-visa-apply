'use strict';
/* نظام طلبات التأشيرات.
   مهم لاستضافة Hostinger: بنعمل listen() فوراً وبعدين نحمّل القاعدة (الاستضافة بتقتل التطبيق لو ما سمعش في 3 ثواني). */
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https')) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
/* برنامج طباعة الباركود (Masar Print Agent) بيكلّم النظام على عنوان فيه المفتاح: /print-agent/<المفتاح>/api/... — بنحوّله لهيدر X-Agent-Key (زي نظام الجوازات بالظبط) */
app.use((req, res, next) => { const m = /^\/print-agent\/([^/]+)(\/api\/.*)$/.exec(req.url); if (m) { req._agentLogged = true; const method = req.method, p0 = m[2].split('?')[0]; res.on('finish', () => require('./agentlog').push({ method, path: p0, status: res.statusCode, ip: String(req.ip || '') })); try { req.headers['x-agent-key'] = decodeURIComponent(m[1]); } catch (e) { req.headers['x-agent-key'] = m[1]; } req.url = m[2]; } next(); });
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: db.status() }));

/* لحد ما القاعدة تجهز */
app.use('/api', (req, res, next) => (db.isReady() ? next() : res.status(503).json({ error: 'السيرفر لسه بيجهّز القاعدة، جرّب كمان شوية', detail: db.status().error })));

/* منع الطلبات المغيّرة من مواقع تانية (CSRF): نفس الموقع أو الإضافة */
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.headers.origin;
  if (!o) return next();
  try { if (new URL(o).host === req.headers.host) return next(); } catch (e) { /* تحت */ }
  res.status(403).json({ error: 'طلب مرفوض (مصدر غير مسموح)' });
});

app.use('/api/passports/barcode', require('./routes/print-agent'));   // برنامج الطباعة (بمفتاح، من غير دخول)
app.use('/api', require('./routes/session'));        // الدخول + المستخدمين (بعد الدخول: req.user)
app.use('/api/people', require('./routes/people'));
app.use('/api', require('./routes/misc'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/payments'));
app.use('/api/print', require('./routes/printing'));
app.use('/api', require('./routes/extras'));
app.use('/api', (req, res) => res.status(404).json({ error: 'مش موجود' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'الملف كبير' : (status === 500 ? 'خطأ في السيرفر' : err.message) });
  if (status === 500) console.error(err);
});

const pub = path.join(__dirname, '..', 'public');
/* ملفات الواجهة (app.js وغيره) بيتأكد منها المتصفح في كل مرة (ETag) عشان أي تحديث يوصل فوراً؛ مكتبة OCR الكبيرة (vendor) بتتخزّن أسبوع */
/* الصفحة الرئيسية: بنضيف رقم إصدار (من تاريخ آخر تعديل للملفات) على ملفات الواجهة، عشان أي كاش (متصفح أو استضافة) ياخد النسخة الجديدة فوراً */
const sendIndex = (req, res) => {
  try {
    const ver = ['style.css', 'app.js', 'pages-dashboard.js', 'pages-people.js', 'pages-admin.js', 'appno.js', 'photo.js', 'print.js', 'pages-accounts.js', 'pages-templates.js', 'index.html'].reduce((m, f) => Math.max(m, fs.statSync(path.join(pub, f)).mtimeMs), 0).toString(36);
    const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8').replace(/(href|src)="((?!https?:|\/)[^"?]+\.(?:css|js))"/g, `$1="$2?v=${ver}"`);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).send(html);
  } catch (e) { res.sendFile(path.join(pub, 'index.html')); }
};
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(pub, { maxAge: 0, etag: true, setHeaders: (res, file) => { if (/[\\/]vendor[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800'); else res.setHeader('Cache-Control', 'no-cache'); } }));
app.get('*', sendIndex);

const server = app.listen(config.port, () => console.log(`🚀 نظام طلبات التأشيرات شغّال على بورت ${config.port}`));
try { fs.mkdirSync(config.dataDir, { recursive: true }); } catch (e) { console.error('تعذر إنشاء فولدر البيانات:', e.message); }
db.initWithRetry();

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
module.exports = { app, server };
