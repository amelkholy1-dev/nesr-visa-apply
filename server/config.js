'use strict';
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const expand = (p) => (String(p).startsWith('~') ? path.join(os.homedir(), String(p).slice(1)) : p);

const authSecret = env('AUTH_SECRET') || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  console.warn('⚠ AUTH_SECRET مش متظبط: هيتولّد سر مؤقت (الجلسات هتتمسح مع كل إعادة تشغيل). اظبطه في Environment variables.');
  return s;
})();

module.exports = {
  port: parseInt(env('PORT', '3000'), 10),
  db: { host: env('DB_HOST', '127.0.0.1'), port: parseInt(env('DB_PORT', '3306'), 10), database: env('DB_NAME'), user: env('DB_USER'), password: env('DB_PASSWORD') },
  dataDir: path.resolve(expand(env('VISA_DATA_DIR', '~/visa-apply-data'))),
  authSecret,
  brand: env('BRAND_NAME', 'إنجاز'),
  brandTag: env('BRAND_TAG', 'نظام إدارة طلبات التأشيرات'),
  printAgentKey: env('PRINT_AGENT_KEY'),   /* مفتاح برنامج طباعة الباركود (Masar Print Agent) — 16 حرف على الأقل */
  adminUser: env('ADMIN_USER', 'admin'),
  adminPassword: env('ADMIN_PASSWORD'),
  geminiKey: env('GEMINI_API_KEY'),
  geminiModel: env('GEMINI_MODEL', 'gemini-2.5-flash'),
  maxPhotoBytes: 1024 * 1024,        // المنصة بترفض أكتر من 1 ميجا للصورة الشخصية
  maxPassportBytes: 4 * 1024 * 1024
};
