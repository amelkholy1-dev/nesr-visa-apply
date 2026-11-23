'use strict';
/* اختبار الواجهة في Chromium على السيرفر الحقيقي + قاعدة MySQL: دخول، ملف ضبط، شخص جديد، MRZ، حفظ، رفع وضغط صورة أكبر من 1 ميجا، حالة الجاهزية.
   التشغيل: BIG_IMAGE=/path/big.png node test/ui-e2e.js */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const mrz = require('../server/mrz');

const PORT = 3198;
const BIG = process.env.BIG_IMAGE;
const env = { ...process.env, PORT: String(PORT), DB_HOST: '127.0.0.1', DB_NAME: process.env.TEST_DB_NAME || 'va1', DB_USER: process.env.TEST_DB_USER || 'u', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'p',
  AUTH_SECRET: 'ui-test-secret-ui-test-secret', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin#12345', VISA_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'va-ui-')) };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); const j = await r.json(); if (j.db && j.db.ready) break; } catch (e) { /* لسه */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const base = `http://127.0.0.1:${PORT}/`;
  try {
    await page.goto(base); await page.waitForSelector('#u');
    await page.fill('#u', 'admin'); await page.fill('#p', 'wrong'); await page.click('#go'); await page.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    await page.fill('#p', 'Admin#12345'); await page.click('#go');
    await page.waitForSelector('#rows');
    assert.ok(await page.isVisible('#top'), 'الهيدر ظاهر بعد الدخول');

    // ملف ضبط
    await page.goto(base + '#/profiles'); await page.click('#newP');
    await page.fill('#pname', 'دفعة اختبار');
    await page.selectOption('[data-k=visaKind]', '38'); await page.selectOption('[data-k=embassy]', '320'); await page.selectOption('[data-k=nationality]', 'EGY');
    await page.fill('[data-k=sponsorName]', 'شركة اختبار'); await page.fill('[data-k=degree]', 'دبلوم'); await page.fill('[data-k=degreeSource]', 'مصر'); await page.fill('[data-k=homeAddress]', 'جدة');
    await page.fill('[data-k=email]', 'hr@example.com'); await page.selectOption('[data-k=religion]', '1'); await page.selectOption('[data-k=social]', '2'); await page.selectOption('[data-k=passportType]', '1');
    await page.selectOption('[data-k=issueCountry]', 'مصر'); await page.fill('[data-k=jobText]', 'سائق حافلة'); await page.selectOption('[data-k=jobClass]', '832').catch(() => {});
    await page.selectOption('[data-k=entryPoint]', '17'); await page.fill('[data-k=expectedEntryDate]', '2027-01-15');
    await page.check('#pdef'); await page.click('#psave'); await page.waitForTimeout(800);

    // شخص جديد + MRZ
    await page.goto(base + '#/people/new'); await page.waitForSelector('#mrz');
    const cd = mrz.checkDigit; const noF = 'A42014007', dob = '830101', ex = '320701', per = '29001010100011';
    const body = noF + cd(noF) + 'EGY' + dob + cd(dob) + 'M' + ex + cd(ex) + per + cd(per);
    const l2 = body + cd(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43)); const l1 = 'P<EGYABOUELENIN<<BADR<KHALIL<BADR'.padEnd(44, '<');
    await page.fill('[data-k=nameAr]', 'بدر خليل بدر ابو العنين');
    await page.fill('#mrz', l1 + '\n' + l2); await page.click('#mrzBtn'); await page.waitForSelector('#mrzMsg .pill');
    assert.strictEqual(await page.inputValue('[data-k=passportNo]'), 'A42014007');
    assert.strictEqual(await page.inputValue('[data-k=nameEnFamily]'), 'ABOUELENIN');
    assert.strictEqual(await page.inputValue('[data-k=birthDate]'), '1983-01-01');
    assert.strictEqual(await page.inputValue('[data-k=nameAr]'), 'بدر خليل بدر ابو العنين', 'الاسم العربي ما اتمسحش بعد MRZ');
    assert.ok((await page.textContent('#mrzMsg')).includes('عالية'));
    await page.fill('[data-k=birthPlace]', 'Cairo'); await page.fill('[data-k=issueDate]', '2024-07-01');
    await page.click('#save'); await page.waitForURL(/#\/people\/\d+/); await page.waitForSelector('#phF');
    const id = page.url().match(/people\/(\d+)/)[1];
    assert.ok((await page.textContent('body')).includes('الصورة الشخصية ناقصة'), 'الناقص ظاهر');
    // رفع صورة كبيرة ← بتتصغّر تحت 1 ميجا
    if (BIG) {
      await page.setInputFiles('#phF', BIG); await page.waitForSelector('img.photo', { timeout: 60000 });
      const info = await page.evaluate(async (pid) => { const r = await fetch('/api/people/' + pid + '/file/photo'); const b = await r.blob(); return { size: b.size, type: b.type }; }, id);
      console.log('photo after compress', info); assert.ok(info.size < 1048576 && info.type.includes('jpeg'), 'الصورة اتصغّرت تحت 1 ميجا');
    }
    const pay = await page.evaluate(async (pid) => (await fetch('/api/people/' + pid + '/payload')).json(), id);
    console.log('issues:', pay.issues);
    assert.strictEqual(pay.mofa.VisaKind, '38'); assert.strictEqual(pay.mofa.AFIRSTNAME, 'بدر'); assert.strictEqual(pay.mofa.AFAMILY, 'العنين'); assert.strictEqual(pay.mofa.ENTRY_POINT, '17');
    await page.goto(base + '#/people'); await page.waitForSelector('#rows tr.click');
    assert.ok((await page.textContent('#rows')).includes('بدر خليل'));
    await page.goto(base + '#/extension'); await page.waitForSelector('.steps');
    /* الطابور والحالة والتقارير والسجل والرفع الجماعي */
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .sel');
    assert.ok(await page.isHidden('#queueBtn'), 'زرار الطابور مخفي من غير تحديد');
    await page.check('#rows .sel'); assert.ok(await page.isVisible('#queueBtn'), 'زرار الطابور ظهر بعد التحديد'); assert.ok(await page.isVisible('#wafQueueBtn'), 'زرار طابور وافد ظهر بعد التحديد');
    /* صفحة الشخص: لوحة صورة الجواز جنب الحقول */
    const firstId = await page.evaluate(async () => (await (await fetch('/api/people')).json()).people[0].id);
    await page.goto(base + '#/people/' + firstId); await page.waitForSelector('.split .side');
    assert.ok(await page.isVisible('.side .pv'), 'لوحة صورة الجواز ظاهرة جنب الحقول');
    /* مراحل الطلب في صفحة الشخص + النقط في القايمة + قايمة الطباعة */
    await page.waitForSelector('.stg[data-stage="medical"]');
    await page.selectOption('.stg[data-stage="medical"] .stS', 'booked'); await page.fill('.stg[data-stage="medical"] .stD', '2026-12-05'); await page.dispatchEvent('.stg[data-stage="medical"] .stD', 'change');
    await page.waitForTimeout(600);
    assert.ok(!(await page.locator('details.menu').count()), 'مفيش زرار طباعة');
    await page.click('#save'); await page.waitForTimeout(800); assert.ok(!(await page.textContent('#toast')).includes('trim'), 'الحفظ على شخص موجود شغّال'); assert.ok((await page.textContent('#toast')).includes('اتحفظ'), 'اتحفظ');
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .dots');
    assert.ok((await page.locator('#rows .dot.booked').count()) >= 1, 'نقطة الفحص الطبي محجوز');
    await page.selectOption('#sf', 'b:medical'); await page.waitForTimeout(400);
    assert.ok((await page.locator('#rows tr.click').count()) >= 1, 'فلتر المراحل');
    await page.selectOption('#sf', '');
    await page.goto(base + '#/settings'); await page.waitForSelector('#view .card, main .card'); assert.ok((await page.textContent('body')).includes('تساهيل'), 'صفحة الإعدادات بتشرح شكل ملف تساهيل');
    /* ملف الضبط: الرقمين تحت الاسم + نتيجة «التفويض على تأشيرة» بتتحط في الخانات من غير حفظ */
    await page.goto(base + '#/profiles'); await page.click('#newP'); await page.waitForSelector('#visaLookup');
    assert.strictEqual(await page.locator('#peditor [data-k=visaNumber]').count(), 1); assert.strictEqual(await page.locator('#peditor [data-k=unifiedNumber]').count(), 1);
    await page.evaluate(() => window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_VISAINFO_RESULT', data: { visaNumber: '1000000001', visaDate: '1447/09/25', sponsorName: 'شركة تجربة للنقل', unifiedNumber: '7000000001', embassyCode: '320', embassyName: 'السويس', jobs: [{ count: '8', job: 'سائق حافلة', nationality: 'مصر', embassy: 'السويس', remaining: '0' }] } }, location.origin));
    await page.waitForFunction(() => document.querySelector('#peditor [data-k=sponsorName]').value === 'شركة تجربة للنقل');
    assert.deepStrictEqual(await page.evaluate(() => ['sponsorNumber', 'unifiedNumber', 'visaNumber', 'embassy', 'jobText'].map((k) => document.querySelector('#peditor [data-k=' + k + ']').value)), ['7000000001', '7000000001', '1000000001', '320', 'سائق حافلة']);
    assert.ok((await page.textContent('#visaInfoBox')).includes('مفيش تأشيرات متبقية'), 'تنبيه العدد المتبقي صفر');
    await page.goto(base + '#/reports'); await page.waitForSelector('#rbody .card'); assert.ok((await page.textContent('#rbody')).includes('الوضع الحالي'));
    assert.ok((await page.getAttribute('#rx', 'href')).includes('/api/reports/export.csv'));
    await page.goto(base + '#/activity'); await page.waitForSelector('#arows tr'); assert.ok((await page.textContent('#arows')).includes('دخول'));
    await page.goto(base + '#/bulk'); await page.waitForSelector('#bgo');
    assert.deepStrictEqual(errs, [], 'مفيش أخطاء JS: ' + errs.join(' | '));
    console.log('UI E2E OK');
  } catch (e) { console.error('FAIL', e); await page.screenshot({ path: path.join(os.tmpdir(), 'va-ui-fail.png') }).catch(() => {}); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
