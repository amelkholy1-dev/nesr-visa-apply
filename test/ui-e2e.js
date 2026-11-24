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
  AUTH_SECRET: 'ui-test-secret-ui-test-secret', PRINT_AGENT_KEY: 'ui-print-key-0123456789abcdef', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Admin#12345', VISA_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'va-ui-')) };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); const j = await r.json(); if (j.db && j.db.ready) break; } catch (e) { /* لسه */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => d.accept());
  const base = `http://127.0.0.1:${PORT}/`;
  /* بيكتب قيمة في خانة حتى لو في تبويب مخفي (زي ما المستخدم هيفتح التبويب ويكتب) */
  const setK = (root, k, v) => page.evaluate(([r, key, val]) => { const el = document.querySelector(r + ' [data-k=' + key + ']'); if (!el) throw new Error('مفيش خانة ' + key); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [root, k, v]);
  const tab = (t) => page.click('#ptabs .tabb[data-tab=' + t + ']');
  try {
    await page.goto(base); await page.waitForSelector('#u');
    await page.fill('#u', 'admin'); await page.fill('#p', 'wrong'); await page.click('#go'); await page.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    await page.fill('#p', 'Admin#12345'); await page.click('#go');
    await page.waitForSelector('.kpis');
    assert.ok(await page.isVisible('#top'), 'القائمة الجانبية ظاهرة بعد الدخول');
    assert.ok((await page.textContent('#top')).includes('إنجاز'), 'اسم السيستم المميّز ظاهر');
    assert.ok((await page.textContent('.page-head')).includes('لوحة التحكم'), 'الصفحة الرئيسية = لوحة التحكم');

    // دفعة جديدة (صفحة مخصوصة بتبويبات)
    await page.goto(base + '#/profiles/new'); await page.waitForSelector('#pname'); assert.ok(await page.isVisible('.ptabs'), 'تبويبات الدفعة ظاهرة');
    assert.deepStrictEqual(await page.$$eval('.ptabs .tabb', (b) => b.map((x) => x.textContent.trim())), ['التأشيرة (إنجاز)', 'الفحص الطبي (وافد)', 'المعامل', 'الخطابات', 'افتراضيات الأشخاص', 'الحسابات'], 'كل تبويب لخدمة');
    await page.fill('#pname', 'دفعة اختبار');
    for (const [k, v] of [['visaKind', '38'], ['embassy', '320'], ['nationality', 'EGY'], ['sponsorName', 'شركة اختبار'], ['degree', 'دبلوم'], ['degreeSource', 'مصر'], ['homeAddress', 'جدة'], ['email', 'hr@example.com'], ['religion', '1'], ['social', '2'], ['passportType', '1'], ['issueCountry', 'مصر'], ['jobText', 'سائق حافلة'], ['entryPoint', '17'], ['expectedEntryDate', '2027-01-15'], ['fee', '4500'], ['visaNumber', '1306311796']]) await setK('#peditor', k, v);
    await page.check('#pdef'); await page.click('#psave'); await page.waitForURL(/#\/profiles\/\d+/); await page.waitForTimeout(500);

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
    await tab('letters'); assert.ok(await page.isVisible('#letSuez') && await page.isVisible('#letCairo'), 'زرارين خطاب الترشيح (السويس / القاهرة) ظاهرين في تبويب الخطابات'); await tab('personal');
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
    assert.ok(await page.isHidden('.bulkbar') || (await page.locator('.bulkbar').count()) === 0, 'شريط التعليم مخفي من غير تحديد');
    await page.goto(base + '#/extension'); await page.waitForSelector('.steps');
    /* الطابور والحالة والتقارير والسجل والرفع الجماعي */
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .sel');
    assert.ok((await page.locator('#queueBtn').count()) === 0 || await page.isHidden('#queueBtn'), 'زرار الطابور مخفي من غير تحديد');
    await page.check('#rows .sel'); assert.ok(await page.isVisible('#queueBtn'), 'زرار الطابور ظهر بعد التحديد'); assert.ok(await page.isVisible('#wafQueueBtn'), 'زرار طابور وافد ظهر بعد التحديد');
    assert.ok(await page.isVisible('#bkApply') && await page.isVisible('#labQueueBtn'), 'أزرار «اعلّم» وحجز المعمل ظاهرة بعد التحديد');
    /* تعليم جماعي: المرحلة «المنصة» تتعلّم تم لكل المحدّدين */
    await page.selectOption('#bkStage', 'sent'); await page.selectOption('#bkState', 'done'); await page.click('#bkApply'); await page.waitForTimeout(900);
    assert.ok((await page.locator('#rows .dot.done').count()) >= 1, 'التعليم الجماعي اشتغل (نقطة «تم»)');
    await page.uncheck('#rows .sel').catch(() => {});
    /* صفحة الشخص: لوحة صورة الجواز جنب الحقول */
    const firstId = await page.evaluate(async () => (await (await fetch('/api/people')).json()).people[0].id);
    await page.goto(base + '#/people/' + firstId); await page.waitForSelector('.split .side');
    assert.ok(await page.isVisible('.side .pv'), 'لوحة صورة الجواز ظاهرة جنب الحقول');
    /* مراحل الطلب في صفحة الشخص + النقط في القايمة + قايمة الطباعة */
    await tab('visa'); assert.ok(await page.isVisible('#fill') && (await page.textContent('#fill')).trim() === 'عمل إنجاز', 'زرار «عمل إنجاز» في تبويب التأشيرة'); assert.ok((await page.textContent('.tp[data-tab=visa]')).includes('بيانات التأشيرة (من الدفعة)'));
    await tab('wafid'); assert.ok((await page.textContent('#ptabs')).includes('ناقص'), 'حالة جاهزية كل خدمة على التبويب'); await page.waitForSelector('.stg[data-stage="medical"]');
    await page.selectOption('.stg[data-stage="medical"] .stS', 'booked'); await page.fill('.stg[data-stage="medical"] .stD', '2026-12-05'); await page.dispatchEvent('.stg[data-stage="medical"] .stD', 'change');
    await page.waitForTimeout(600);
    assert.ok(!(await page.locator('details.menu').count()), 'مفيش زرار طباعة');
    await tab('personal');
    await page.click('#save'); await page.waitForTimeout(800); assert.ok(!(await page.textContent('#toast')).includes('trim'), 'الحفظ على شخص موجود شغّال'); assert.ok((await page.textContent('#toast')).includes('اتحفظ'), 'اتحفظ');
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .dots');
    assert.ok((await page.locator('#rows .dot.booked').count()) >= 1, 'نقطة الفحص الطبي محجوز');
    /* المستخدمين والصلاحيات + دفعات التأشيرات */
    await page.goto(base + '#/users'); await page.waitForSelector('#addU'); assert.ok((await page.textContent('#view, main, body')).includes('الأدوار الجاهزة'));
    await page.click('#addU'); await page.waitForSelector('.modal .perm-grid'); assert.ok((await page.locator('.modal [data-perm]').count()) >= 8, 'قايمة الصلاحيات ظاهرة'); await page.click('#mc');
    await page.goto(base + '#/profiles'); await page.waitForSelector('.vcard'); assert.ok((await page.textContent('.vcard')).includes('شخص'), 'كارت الدفعة فيه أعداد الأشخاص');
    await page.goto(base + '#/people'); await page.waitForSelector('#sf');
    await page.selectOption('#sf', 'b:medical'); await page.waitForTimeout(400);
    assert.ok((await page.locator('#rows tr.click').count()) >= 1, 'فلتر المراحل');
    await page.selectOption('#sf', '');
    assert.ok(!(await page.textContent('#top')).includes('إعدادات التصدير'), 'تبويب إعدادات التصدير اتشال');
    /* ضبط النموذج: أكتر من نموذج، وأي دفعة جديدة تتعبّى من النموذج الأساسي (أو اللي تختاره) */
    await page.evaluate(() => fetch('/api/batch-templates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templates: [] }) })); /* القاعدة ممكن تكون مشتركة مع اختبار الـ API */
    await page.goto(base + '#/profiles/new'); await page.waitForSelector('#pname'); assert.strictEqual(await page.locator('#ptpl').count(), 0, 'مفيش نماذج: الدفعة الجديدة فاضية'); assert.strictEqual(await page.evaluate(() => document.querySelector('#peditor [data-k=degree]').value), '');
    await page.goto(base + '#/templates'); await page.waitForSelector('#tNew'); await page.click('#tNew'); await page.waitForSelector('#tName'); await page.fill('#tName', 'نموذج العمرة');
    for (const [k, v] of [['degree', 'دبلوم'], ['passportType', '1'], ['religion', '1'], ['homeAddress', 'جدة'], ['entryPoint', '17'], ['expectedEntryDate', '2027-01-15'], ['visaKind', '13'], ['fee', '4500']]) await setK('#tForm', k, v);
    await page.click('#tSave'); await page.waitForTimeout(700);
    await page.click('#tNew'); await page.waitForSelector('#tName'); await page.fill('#tName', 'نموذج الحج'); await setK('#tForm', 'visaKind', '4'); await page.click('#tSave'); await page.waitForTimeout(700);
    assert.deepStrictEqual((await page.evaluate(async () => (await (await fetch('/api/batch-templates')).json()).templates)).map((t) => [t.name, t.isDefault, Object.keys(t.data).length]), [['نموذج العمرة', true, 8], ['نموذج الحج', false, 1]], 'نموذجين، الأول أساسي');
    await page.goto(base + '#/profiles/new'); await page.waitForSelector('#ptpl');
    assert.deepStrictEqual(await page.evaluate(() => ['degree', 'passportType', 'religion', 'homeAddress', 'entryPoint', 'expectedEntryDate', 'sponsorName', 'visaNumber', 'unifiedNumber', 'visaKind', 'fee'].map((k) => document.querySelector('#peditor [data-k=' + k + ']').value)), ['دبلوم', '1', '1', 'جدة', '17', '2027-01-15', '', '', '', '13', '4500'], 'النموذج الأساسي اتعبّى والباقي فاضي');
    await page.selectOption('#ptpl', { label: 'نموذج الحج' }); assert.strictEqual(await page.evaluate(() => document.querySelector('#peditor [data-k=visaKind]').value), '4', 'تبديل النموذج');
    /* ملف الضبط: الرقمين تحت الاسم + نتيجة «التفويض على تأشيرة» بتتحط في الخانات من غير حفظ */
    await page.goto(base + '#/profiles/new'); await page.waitForSelector('#visaLookup');
    assert.strictEqual(await page.locator('#peditor [data-k=visaNumber]').count(), 1); assert.strictEqual(await page.locator('#peditor [data-k=unifiedNumber]').count(), 1);
    await page.evaluate(() => { window.__ctl = []; window.addEventListener('message', (ev) => { if (ev.data && ev.data.type === 'VA_VISAINFO_CTL') window.__ctl.push(ev.data.data); }); window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_VISAINFO_CAPTCHA', data: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } }, location.origin); });
    await page.waitForSelector('#capImg'); assert.ok((await page.evaluate(() => (window.__visaLog || []).join(' '))).includes('وصلت صورة الكابتشا'), 'السجل بيتحفظ في الذاكرة'); assert.strictEqual(await page.locator('#visaLog').count(), 0, 'السجل مش ظاهر على الشاشة'); await page.fill('#capIn', 'a1B2'); await page.click('#capGo');
    await page.waitForFunction(() => window.__ctl.length > 0);
    assert.deepStrictEqual(await page.evaluate(() => window.__ctl), [{ op: 'submit', captcha: 'a1B2' }], 'الكابتشا اللي كتبتها بتتبعت للإضافة');
    await page.evaluate(() => window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_VISAINFO_RESULT', data: { visaNumber: '1000000001', visaDate: '1447/09/25', sponsorName: 'شركة تجربة للنقل', unifiedNumber: '7000000001', embassyCode: '320', embassyName: 'السويس',
      jobs: [{ count: '8', job: 'سائق حافلة', nationality: 'مصر', embassy: 'السويس', remaining: '0' }, { count: '5', job: 'فني', nationality: 'مصر', embassy: 'القاهرة', remaining: '2' }],
      delegations: [{ number: '20000001', embassy: 'السويس', count: '8', job: 'سائق حافلة', agencyNumber: '30000001', agencyName: 'وكالة تجربة' }, { number: '20000002', embassy: 'القاهرة', count: '5', job: 'فني', agencyNumber: '30000001', agencyName: 'وكالة تجربة' }] } }, location.origin));
    await page.waitForFunction(() => document.querySelector('#peditor [data-k=sponsorName]').value === 'شركة تجربة للنقل');
    assert.strictEqual(await page.evaluate(() => document.querySelector('#peditor [data-k=visaDate]').value), '1447/09/25', 'تاريخ التأشيرة اتملى للخطابات');
    assert.deepStrictEqual(await page.evaluate(() => ['sponsorNumber', 'unifiedNumber', 'visaNumber', 'embassy', 'jobText', 'nationality'].map((k) => document.querySelector('#peditor [data-k=' + k + ']').value)), ['7000000001', '7000000001', '1000000001', '320', '', 'EGY'], 'بيانات الجهة اتملّت والمهنة مستنية الاختيار');
    assert.strictEqual(await page.locator('input[name=visaPickRow]').count(), 2, 'قايمة التفاويض للاختيار');
    assert.ok((await page.textContent('#visaInfoBox')).includes('وكالة تجربة'));
    await page.click('input[name=visaPickRow][value="1"]'); await page.click('#visaPick');
    assert.strictEqual(await page.evaluate(() => document.querySelector('#peditor [data-k=agencyNumber]').value), '30000001', 'رقم الوكالة اتملى من التفويض المختار');
    assert.deepStrictEqual(await page.evaluate(() => ['jobText', 'embassy'].map((k) => document.querySelector('#peditor [data-k=' + k + ']').value)), ['فني', '302'], 'المهنة والممثلية (القاهرة) اللي اتختارت');
    await page.click('input[name=visaPickRow][value="0"]'); await page.click('#visaPick');
    assert.deepStrictEqual(await page.evaluate(() => ['jobText', 'embassy'].map((k) => document.querySelector('#peditor [data-k=' + k + ']').value)), ['سائق حافلة', '320']);
    /* الخطوة 2 (مستند التأشيرة): بتملا نوع التأشيرة وعدد الدخول ومدة الإقامة */
    await page.evaluate(() => window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_VISAINFO_DOC', data: { docNumber: '1000000002', docDate: '1447/09/25', sponsorName: 'شركة تجربة للنقل', visaKindId: '', rows: [{ visaKind: 'عمل موسمي', embassy: 'السويس', gender: 'ذكر', nationality: 'مصر', job: 'سائق حافلة', entries: 'سفرة واحدة', residence: '90' }] } }, location.origin));
    await page.waitForFunction(() => document.querySelector('#peditor [data-k=visaKind]').value === '13');
    assert.deepStrictEqual(await page.evaluate(() => ['entriesText', 'residence', 'nationality'].map((k) => document.querySelector('#peditor [data-k=' + k + ']').value)), ['سفرة واحدة', '90', 'EGY'], 'عدد الدخول ومدة الإقامة والجنسية من المستند');
    assert.ok((await page.textContent('#visaDocBox')).includes('نوع التأشيرة'), 'ملخص المستند');
    /* جدول المستند رجع فاضي: النظام بيعرض السبب (من غير أي تخمين لرقم تاني) */
    await page.evaluate(() => { window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_VISAINFO_CAPTCHA', data: { step: 2, only: true, image: '', error: true, empty: true, message: 'مستند التأشيرة رجع من غير بيانات (الجدول: «لا توجد بيانات!»).' } }, location.origin); });
    await page.waitForSelector('#capOpen'); assert.ok((await page.textContent('#visaCapBox')).includes('رجع من غير بيانات')); assert.strictEqual(await page.locator('#capPlus').count(), 0, 'مفيش تخمين +1');
    /* «هات رقم إنجاز»: الإضافة هنا متحاكية برسايل: طلب ← كابتشا ← نتيجة. رقم طلب لجواز تاني مبيتسجّلش */
    await page.goto(base + '#/people/' + id); await page.waitForSelector('#ptabs'); await tab('visa'); await page.waitForSelector('#appNoFetch');
    await page.evaluate(() => { window.__ap = []; window.addEventListener('message', (ev) => { if (ev.data && ev.data.source === 'nesr-visaapply' && /^VA_APPNO/.test(ev.data.type)) window.__ap.push(ev.data); }); window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_READY' }, location.origin); });
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const apRound = async (n, result) => {
      await page.waitForFunction((k) => window.__ap.filter((x) => x.type === 'VA_APPNO').length > k, n);
      await page.evaluate((img) => window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_APPNO_CAPTCHA', data: { image: img } }, location.origin), PNG);
      await page.waitForSelector('#apImg'); if (process.env.SHOT_DIR && !global.__shot) { global.__shot = 1; await page.screenshot({ path: process.env.SHOT_DIR + '/appno.png' }); } await page.fill('#apIn', 'a1B2'); await page.click('#apGo');
      await page.waitForFunction(() => window.__ap.some((x) => x.type === 'VA_APPNO_CTL' && x.data.op === 'submit' && x.data.captcha === 'a1B2'));
      await page.evaluate((d) => window.postMessage({ source: 'nesr-visaapply-ext', type: 'VA_APPNO_RESULT', data: d }, location.origin), result);
      await page.waitForSelector('#apClose');
    };
    await page.click('#appNoFetch');
    await page.waitForFunction(() => window.__ap.some((x) => x.type === 'VA_APPNO'));
    const apReq = await page.evaluate(() => window.__ap.find((x) => x.type === 'VA_APPNO').data);
    assert.deepStrictEqual([apReq.passportNo, apReq.visaType, apReq.embassy, apReq.nationality], ['A42014007', '38', '320', 'EGY'], 'بيانات رقم إنجاز من الشخص وملف الضبط');
    await apRound(0, { appNumber: 'E100000009', passportNo: 'B0000000' });
    assert.ok((await page.textContent('.modal')).includes('جواز تاني'), 'رقم لجواز تاني اتمنع'); await page.click('#apClose');
    assert.strictEqual((await page.evaluate(async (pid) => (await (await fetch('/api/people/' + pid)).json()).person.appNumber, id)) || '', '', 'مفيش رقم اتسجّل');
    await page.click('#appNoFetch'); await apRound(1, { appNumber: 'E100000009', passportNo: 'a42014007', issuedVisaNo: '1000000009' });
    assert.ok((await page.textContent('.modal')).includes('E100000009') && (await page.textContent('.modal')).includes('اتسجّل'), 'الملخص بيعرض الرقم'); await page.click('#apClose');
    await page.waitForFunction(() => document.body.textContent.includes('E100000009'));
    assert.strictEqual(await page.evaluate(async (pid) => (await (await fetch('/api/people/' + pid)).json()).person.appNumber, id), 'E100000009', 'رقم إنجاز اتسجّل للشخص');
    /* من القايمة: التحديد الجماعي (اللي عنده رقم بيتخطّى) */
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .sel'); await page.check('#rows .sel'); await page.click('#appnoBtn');
    await page.waitForSelector('#apClose'); assert.ok((await page.textContent('.modal')).includes('عنده رقم طلب بالفعل'), 'اللي عنده رقم بيتخطّى في الجماعي'); await page.click('#apClose');
    /* تجهيز الطباعة: برنامج طباعة متحاكي (نفس بروتوكول Masar Print Agent) بيسحب الأوامر ويطبعها */
    const AKEY = 'ui-print-key-0123456789abcdef'; const gotJobs = [];
    const agentFetch = (m, u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: m, headers: { 'Content-Type': 'application/json', 'X-Agent-Key': AKEY }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
    await agentFetch('POST', '/api/passports/barcode/agents/register', { agentId: 'UIPC', agentName: 'جهاز اختبار', printers: [{ name: 'BIXOLON XD5', isDefault: true }], defaultPrinter: 'BIXOLON XD5', agentVersion: '25' });
    await page.evaluate(() => fetch('/api/print/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ printAgentId: 'UIPC' }) }));
    const agentTimer = global.__agentTimer = setInterval(async () => { try { const r = await agentFetch('GET', '/api/passports/barcode/agents/UIPC/jobs/next'); if (r.job) { gotJobs.push(r.job); await agentFetch('POST', `/api/passports/barcode/agents/UIPC/jobs/${r.job.jobId}/status`, { status: 'printed' }); } } catch (x) { /* مش مهم */ } }, 400);
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .act'); await page.click('#rows tr.click:first-child .act'); await page.click('.amenu-list button[data-a="prep"]'); await page.waitForSelector('#pkGo');
    assert.ok((await page.textContent('.modal')).includes('E100000009') && (await page.textContent('.modal')).includes('1306311796'), 'رقم الطلب ورقم التأشيرة ظاهرين'); assert.strictEqual(await page.inputValue('.pkKind'), 'suez', 'الخطاب حسب الممثلية (السويس)');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#pkGo')]); assert.ok(/nomination-suez/.test(dl.suggestedFilename()), 'خطاب السويس نزل: ' + dl.suggestedFilename());
    await page.waitForFunction(() => document.querySelectorAll('#pkLog .chip.ok').length >= 3, null, { timeout: 40000 });
    assert.strictEqual(gotJobs.length, 2, 'ليبلين: رقم الطلب + التأشيرة'); assert.deepStrictEqual(gotJobs.map((j) => j.payload.code), ['E100000009', '1306311796']);
    const nj = JSON.parse(gotJobs[0].payload.nativeLabelJson); const fn = Object.values(nj.functions).map((f) => Object.keys(f)[0]); assert.ok(fn.includes('draw1DBarcode') && fn.includes('drawBitmap') && fn[fn.length - 1] === 'printBuffer', 'أوامر BIXOLON: ' + fn.join(','));
    assert.deepStrictEqual(Object.values(nj.functions).find((f) => f.draw1DBarcode).draw1DBarcode.slice(0, 7), ['E100000009', 32, 24, 1, 2, 5, 152], 'مكان وحجم الباركود زي نظام الجوازات (52×31 مم، 203 dpi)');
    assert.deepStrictEqual([gotJobs[0].payload.label.widthMm, gotJobs[0].payload.label.heightMm, gotJobs[0].payload.version, gotJobs[0].printerName], [52, 31, 4, 'BIXOLON XD5']);
    await page.click('#pkX'); clearInterval(agentTimer);
    /* فلاتر الأشخاص */
    await page.goto(base + '#/people'); await page.waitForSelector('#kf'); await page.selectOption('#kf', '38'); await page.waitForTimeout(300); assert.ok((await page.textContent('#rows')).includes('بدر خليل'), 'فلتر نوع التأشيرة'); await page.selectOption('#kf', '13'); await page.waitForTimeout(300); assert.ok(!(await page.textContent('#rows')).includes('بدر خليل'));
    await page.click('#clrF'); await page.waitForTimeout(400); await page.selectOption('#anf', 'no'); await page.waitForTimeout(300); assert.ok(!(await page.textContent('#rows')).includes('بدر خليل'), 'فلتر «من غير رقم طلب»'); await page.selectOption('#ef', '320'); await page.selectOption('#anf', 'has'); await page.waitForTimeout(300); assert.ok((await page.textContent('#rows')).includes('بدر خليل'), 'فلتر الممثلية + عنده رقم'); await page.click('#clrF'); await page.waitForTimeout(400);
    /* قايمة «الإجراءات» في الصف: كل حاجة من غير ما تدخل على الشخص */
    await page.goto(base + '#/people'); await page.waitForSelector('#rows .act'); await page.click('#rows tr.click:first-child .act'); await page.waitForSelector('.amenu-list');
    const mt = await page.textContent('.amenu-list'); for (const t of ['عمل إنجاز', 'هات رقم إنجاز', 'احجز الفحص الطبي', 'احجز المعمل', 'خطاب الترشيح — السويس', 'خطاب الترشيح — القاهرة', 'علّم: تم الفحص الطبي', 'الحسابات والدفع']) assert.ok(mt.includes(t), 'في القايمة: ' + t);
    assert.ok(!mt.includes('املى الطلب'), 'مفيش «املى الطلب»');
    await page.click('.amenu-list button[data-a="m:lab"]'); await page.waitForFunction(async (pid) => (await (await fetch('/api/people/' + pid)).json()).person.stages.lab.state === 'done', id, { timeout: 15000 }); /* علّم المعمل تم من غير ما تفتح الشخص */
    assert.strictEqual(await page.evaluate(async (pid) => (await (await fetch('/api/people/' + pid)).json()).person.stages.lab.state, id), 'done', 'التعليم السريع اتحفظ');
    /* الحسابات: تكلفة من الدفعة، دفع في محفظة من الخزينة، متبقي */
    await page.evaluate(() => fetch('/api/treasury/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'فودافون كاش', kind: 'wallet' }) }));
    await page.click('#rows tr.click:first-child .act'); await page.click('.amenu-list button[data-a="pay"]'); await page.waitForSelector('#payF');
    assert.ok((await page.textContent('.modal .money')).includes('4,500'), 'تكلفة الدفعة ظاهرة'); await page.fill('#pAmt', '2000'); await page.selectOption('#pWal', { label: 'فودافون كاش' }); await page.fill('#pNote', 'عربون'); await page.click('#pGo');
    await page.waitForFunction(() => /2,500/.test(document.querySelector('.modal .money .rem').textContent)); assert.ok((await page.textContent('.modal')).includes('فودافون كاش'), 'المحفظة اتسجّلت');
    await page.click('#payX'); await page.waitForFunction(() => /دفع جزء/.test(document.querySelector('#rows').textContent), null, { timeout: 8000 });
    await page.goto(base + '#/people/' + id); await page.waitForSelector('#ptabs'); await tab('accounts'); await page.waitForSelector('#payF'); await page.click('#pRest'); await page.click('#pGo'); await page.waitForFunction(() => document.querySelector('.money .rem.zero'));
    await page.goto(base + '#/accounts'); await page.waitForURL(/#\/treasury\/dues/); await page.waitForSelector('#trBody .money'); assert.ok((await page.textContent('main')).includes('4,500') && (await page.textContent('main')).includes('فودافون كاش'), 'مستحقات العملاء جوه الخزينة');
    /* الخزينة: محفظة جديدة + مصروف + سجل المعاملات */
    await page.goto(base + '#/treasury'); await page.waitForSelector('.wcard'); assert.ok((await page.textContent('.wgrid')).includes('فودافون كاش') && (await page.textContent('.banner')).includes('ج.م'), 'المحافظ والرصيد الإجمالي');
    await page.click('#tAddW'); await page.fill('#wN', 'بنك تجربة'); await page.selectOption('#wK', 'bank'); await page.fill('#wO', '1000'); await page.click('#wS'); await page.waitForFunction(() => document.querySelector('.wgrid').textContent.includes('بنك تجربة'));
    await page.click('#tOut'); await page.waitForSelector('#xA'); await page.selectOption('#xW', { label: 'بنك تجربة' }); await page.fill('#xA', '150'); await page.fill('#xC', 'رسوم منصة'); await page.click('#xS'); await page.waitForTimeout(700);
    assert.ok((await page.textContent('.wgrid')).includes('850'), 'رصيد البنك بعد المصروف');
    await page.goto(base + '#/treasury/log'); await page.waitForSelector('#lRows tr'); await page.waitForFunction(() => document.querySelector('#lRows').textContent.includes('رسوم منصة'));
    assert.ok((await page.textContent('#lRows')).includes('دفعة عميل') && (await page.textContent('#lSum')).includes('خارج'), 'سجل المعاملات فيه الدفعات والمصروف');
    await page.selectOption('#lK', 'expense'); await page.waitForFunction(() => !document.querySelector('#lRows').textContent.includes('دفعة عميل'));
    assert.ok((await page.textContent('#top')).includes('الخزينة') && await page.isVisible('nav .nk a.on'), 'القايمة الجانبية: قسم الخزينة مفتوح والصفحة متعلّمة');
    await page.goto(base + '#/'); await page.waitForSelector('.kpis'); assert.ok((await page.textContent('.kpis')).includes('متبقي على الأشخاص'), 'الحسابات في لوحة التحكم');
    /* أرشفة دفعة */
    await page.goto(base + '#/profiles'); await page.waitForSelector('.vcard .arch'); const archBtn = page.locator('.vcard', { hasText: 'دفعة اختبار' }).locator('.arch'); await archBtn.click(); await page.waitForSelector('details.fold');
    await page.goto(base + '#/people'); await page.waitForSelector('#rows'); await page.waitForTimeout(600); assert.ok(!(await page.textContent('#rows')).includes('بدر خليل'), 'الدفعة المؤرشفة مش في القايمة');
    await page.check('#archOnly'); await page.waitForFunction(() => document.querySelector('#rows').textContent.includes('بدر خليل')); await page.uncheck('#archOnly');
    await page.goto(base + '#/profiles'); await page.waitForSelector('details.fold'); await page.click('details.fold summary'); await page.locator('details.fold .arch').first().click(); await page.waitForFunction(() => !document.querySelector('details.fold'));
    /* الإعدادات: معالجة الصورة (خلفية بيضاء + إزالة تشويش) */
    await page.goto(base + '#/settings'); await page.waitForSelector('#pmSave'); await page.check('input[name=pm][value=clean]'); await page.click('#pmSave'); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(async () => (await (await fetch('/api/meta')).json()).photoProcess), 'clean', 'معالجة الصورة اتفعّلت');
    const pc = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 300; c.height = 380; const g = c.getContext('2d'); const d = g.createImageData(300, 380);
      for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 18; d.data[i] = 190 + n; d.data[i + 1] = 205 + n; d.data[i + 2] = 225 + n; d.data[i + 3] = 255; } g.putImageData(d, 0, 0);
      g.fillStyle = '#d9a98a'; g.beginPath(); g.ellipse(150, 200, 70, 95, 0, 0, 7); g.fill(); g.fillStyle = '#2b2220'; g.beginPath(); g.ellipse(150, 120, 75, 45, 0, 0, 7); g.fill();
      const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const out = await window.NA.photo.clean(blob);
      const bm = await createImageBitmap(out.blob); const cc = document.createElement('canvas'); cc.width = bm.width; cc.height = bm.height; const gg = cc.getContext('2d'); gg.drawImage(bm, 0, 0);
      const px = (x, y) => Array.from(gg.getImageData(Math.round(x * bm.width / 300), Math.round(y * bm.height / 380), 1, 1).data.slice(0, 3));
      return { applied: out.applied, type: out.blob.type, tl: px(6, 6), br: px(294, 374), left: px(20, 250), face: px(150, 210), note: out.note };
    });
    assert.ok(pc.applied && pc.type === 'image/jpeg', 'اتعالجت: ' + pc.note); for (const k of ['tl', 'br', 'left']) assert.ok(pc[k].every((v) => v >= 248), 'الخلفية بقت بيضاء ' + k + ' ' + pc[k]);
    assert.ok(pc.face[0] > 190 && pc.face[0] < 235 && pc.face[2] < 170, 'الوش ما اتمسّش: ' + pc.face);
    await page.click('input[name=pm][value=off]'); await page.click('#pmSave'); await page.waitForTimeout(400);
    await page.goto(base + '#/reports'); await page.waitForSelector('#rbody .card'); assert.ok((await page.textContent('#rbody')).includes('الوضع الحالي'));
    assert.ok((await page.getAttribute('#rx', 'href')).includes('/api/reports/export.csv'));
    await page.goto(base + '#/activity'); await page.waitForSelector('#arows tr'); assert.ok((await page.textContent('#arows')).includes('دخول'));
    await page.goto(base + '#/bulk'); await page.waitForSelector('#bgo');
    assert.deepStrictEqual(errs, [], 'مفيش أخطاء JS: ' + errs.join(' | '));
    console.log('UI E2E OK');
  } catch (e) { console.error('FAIL', e); await page.screenshot({ path: path.join(os.tmpdir(), 'va-ui-fail.png') }).catch(() => {}); process.exitCode = 1; }
  finally { clearInterval(global.__agentTimer); await browser.close(); srv.kill(); }
})();
