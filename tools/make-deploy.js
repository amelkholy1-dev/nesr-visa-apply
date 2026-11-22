'use strict';
/* بيجهّز ملفات رفع النظام على Hostinger في فولدر deploy/:
     visa-apply.zip   ← البرنامج (بيترفع كتطبيق Node.js، والاستضافة بتسطّب المكتبات)
     hostinger-env.txt ← القيم اللي هتنسخها في Environment variables (سري، بيتعمل مرة واحدة)
   التشغيل: node tools/make-deploy.js   (أو دبل كليك على MAKE-DEPLOY.bat) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'deploy');
let archiver;
try { archiver = require('archiver'); } catch (e) { console.error('لازم تشغّل الأول:  npm install'); process.exit(1); }

const INCLUDE = ['server.js', 'package.json', 'package-lock.json', '.env.example', 'server', 'public', 'extension'];
fs.mkdirSync(OUT, { recursive: true });

function zipApp() {
  return new Promise((resolve, reject) => {
    const file = path.join(OUT, 'visa-apply.zip');
    const out = fs.createWriteStream(file);
    const z = archiver('zip', { zlib: { level: 6 } });
    out.on('close', () => resolve({ file, size: fs.statSync(file).size }));
    z.on('error', reject); z.pipe(out);
    for (const name of INCLUDE) {
      const p = path.join(ROOT, name);
      if (!fs.existsSync(p)) continue;
      if (fs.statSync(p).isDirectory()) z.directory(p, name); else z.file(p, { name });
    }
    z.finalize();
  });
}

function writeEnv() {
  const file = path.join(OUT, 'hostinger-env.txt');
  if (fs.existsSync(file)) { console.log('hostinger-env.txt موجود من قبل — اتساب زي ما هو (المفاتيح اللي فيه ممكن تكون اتكتبت على الاستضافة)'); return; }
  const rnd = (n) => crypto.randomBytes(n).toString('base64url');
  fs.writeFileSync(file, [
    '===== Environment variables لتطبيق نظام طلبات التأشيرات =====',
    'DB_HOST=127.0.0.1', 'DB_PORT=3306',
    'DB_NAME=<اسم قاعدة البيانات اللي عملتها>', 'DB_USER=<مستخدم قاعدة البيانات>', 'DB_PASSWORD=<كلمة سر قاعدة البيانات>',
    'VISA_DATA_DIR=~/visa-apply-data',
    'AUTH_SECRET=' + rnd(48),
    '# كلمة سر أول دخول للمدير (غيّرها بعد الدخول):',
    'ADMIN_USER=admin',
    'ADMIN_PASSWORD=' + rnd(12),
    'TZ=Africa/Cairo',
    '# اختياري (قراءة الجواز من الصورة تلقائي): GEMINI_API_KEY=<المفتاح>',
    ''
  ].join('\n'));
  console.log('اتعمل hostinger-env.txt');
}

(async () => {
  const r = await zipApp();
  writeEnv();
  console.log(`\nvisa-apply.zip  ${(r.size / 1048576).toFixed(2)} MB`);
  console.log('الخطوات كاملة في DEPLOY-AR.md');
})().catch((e) => { console.error(e); process.exit(1); });
