'use strict';
/* اختبار قراءة MRZ من صورة جوه المتصفح (Tesseract محلي). بياخد صورة اختبار من PASSPORT_IMAGE (JPG فيه سطري MRZ تحت).
   ملحوظة: ده اختبار على صورة مولّدة؛ صور الجوازات الحقيقية (تصوير موبايل) أصعب والدقة بتختلف. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 3197, IMG = process.env.PASSPORT_IMAGE;
const env = { ...process.env, PORT: String(PORT), DB_HOST: '127.0.0.1', DB_NAME: process.env.TEST_DB_NAME || 'va1', DB_USER: process.env.TEST_DB_USER || 'u', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'p',
  AUTH_SECRET: 'ocr-test-secret-ocr-test-secret', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin#12345', VISA_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'va-ocr-')) };

(async () => {
  assert.ok(IMG && fs.existsSync(IMG), 'حدد PASSPORT_IMAGE');
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) { try { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json(); if (j.db && j.db.ready) break; } catch (e) { /* لسه */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForSelector('#u');
    await page.fill('#u', 'admin'); await page.fill('#p', 'Admin#12345'); await page.click('#go'); await page.waitForSelector('#rows');
    await page.goto(`http://127.0.0.1:${PORT}/#/people/new`); await page.waitForSelector('#pasF');
    await page.setInputFiles('#pasF', IMG);
    await page.waitForSelector('#pvImg');
    const t0 = Date.now();
    await page.click('#ocrLocal');
    await page.waitForFunction(() => document.querySelector('#mrzMsg .pill'), null, { timeout: 150000 });
    console.log('OCR seconds:', ((Date.now() - t0) / 1000).toFixed(1));
    console.log('MRZ box:', JSON.stringify(await page.inputValue('#mrz')));
    console.log('msg:', await page.textContent('#mrzMsg'));
    const got = { no: await page.inputValue('[data-k=passportNo]'), birth: await page.inputValue('[data-k=birthDate]'), exp: await page.inputValue('[data-k=expiryDate]'), fam: await page.inputValue('[data-k=nameEnFamily]'), first: await page.inputValue('[data-k=nameEnFirst]'), sex: await page.inputValue('[data-k=sex]') };
    console.log(got);
    assert.strictEqual(got.no, 'A45449365'); assert.strictEqual(got.birth, '1989-11-01'); assert.strictEqual(got.exp, '2033-06-23'); assert.strictEqual(got.fam, 'ELSHAWY'); assert.strictEqual(got.first, 'ATEF'); assert.strictEqual(got.sex, '1');
    /* أداة القص: الصورة الشخصية من الجواز + تحديد منطقة MRZ يدوياً */
    await page.goto(`http://127.0.0.1:${PORT}/#/people/new`); await page.waitForSelector('#pasF');
    await page.setInputFiles('#pasF', IMG); await page.waitForSelector('#cropPhoto');
    await page.click('#cropPhoto'); await page.waitForSelector('.cropper #crSel'); await page.waitForTimeout(300);
    const box = await page.locator('#crSel').boundingBox(); assert.ok(box.width > 20 && box.height > 20, 'مربع القص ظاهر');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 4 }); await page.mouse.up();
    const box2 = await page.locator('#crSel').boundingBox(); assert.ok(Math.abs(box2.x - box.x) > 10, 'المربع اتحرّك بالسحب');
    await page.click('#crOk'); await page.waitForSelector('.side img.photo', { timeout: 20000 });
    await page.click('#cropMrz'); await page.waitForSelector('.cropper #crSel'); await page.waitForTimeout(300);
    await page.click('#crOk'); await page.waitForFunction(() => document.querySelector('#mrzMsg .pill'), null, { timeout: 150000 });
    assert.strictEqual(await page.inputValue('[data-k=passportNo]'), 'A45449365', 'قراءة من المنطقة المحددة');
    /* رفع جماعي: صورتين (نفس الصورة مرتين ← التانية مكررة) */
    await page.goto(`http://127.0.0.1:${PORT}/#/bulk`); await page.waitForSelector('#bf');
    await page.setInputFiles('#bf', [IMG, IMG]);
    await page.click('#bgo');
    await page.waitForFunction(() => /تم: 1 · مكرر: 1/.test((document.getElementById('bsum') || {}).textContent || ''), null, { timeout: 200000 });
    const bulkTxt = await page.textContent('#brows');
    console.log('bulk:', bulkTxt.replace(/\s+/g, ' ').slice(0, 200));
    const ppl = await page.evaluate(async () => (await (await fetch('/api/people?q=A45449365')).json()).people);
    assert.ok(ppl.length >= 1 && ppl.some((p) => p.hasPassport), 'الشخص اتعمل وصورة الجواز اتحفظت');
    assert.deepStrictEqual(errs, [], errs.join('|'));
    console.log('OCR E2E OK');
  } catch (e) { console.error('FAIL', e); await page.screenshot({ path: path.join(os.tmpdir(), 'va-ocr-fail.png') }).catch(() => {}); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
