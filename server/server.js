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

app.use('/api', require('./routes/session'));        // الدخول + المستخدمين (بعد الدخول: req.user)
app.use('/api/people', require('./routes/people'));
app.use('/api', require('./routes/misc'));
app.use('/api', require('./routes/reports'));
app.use('/api', (req, res) => res.status(404).json({ error: 'مش موجود' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'الملف كبير' : (status === 500 ? 'خطأ في السيرفر' : err.message) });
  if (status === 500) console.error(err);
});

const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { maxAge: '5m' }));
app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html')));

const server = app.listen(config.port, () => console.log(`🚀 نظام طلبات التأشيرات شغّال على بورت ${config.port}`));
try { fs.mkdirSync(config.dataDir, { recursive: true }); } catch (e) { console.error('تعذر إنشاء فولدر البيانات:', e.message); }
db.initWithRetry();

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
module.exports = { app, server };
