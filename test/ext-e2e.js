'use strict';
/* اختبار الإضافة في Chromium حقيقي على نسخة منظّفة من صفحة المنصة (test/fixtures/traditional-app.html) + سكربت بيحاكي تحميل القوايم المتأخر.
   مش بيتصل بالمنصة الحقيقية. التشغيل: node test/ext-e2e.js (محتاج playwright و Chromium). */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const extDir = path.join(__dirname, '..', 'extension');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'traditional-app.html'), 'utf8');

/* بيحاكي القوايم اللي المنصة بتحمّلها بالتأخير (AJAX) وردّ رفع الصورة */
const MOCK = `<script>
(function(){
  function opts(id, list){ var s=document.getElementById(id); if(!s) return; s.innerHTML='<option value=""></option>'; list.forEach(function(o){ var e=document.createElement('option'); e.value=o[0]; e.textContent=o[1]; s.appendChild(e); }); }
  function later(fn){ setTimeout(fn, 350); }
  document.addEventListener('DOMContentLoaded', function(){
    ['NUMBER_OF_ENTRIES','Number_Entry_Day','RESIDENCY_IN_KSA'].forEach(function(i){ opts(i, []); });
    var o=document.getElementById('JOB_OR_RELATION_Id'); if(o) o.innerHTML='';
    var $=function(i){return document.getElementById(i)};
    $('NATIONALITY').addEventListener('change', function(){ later(function(){ opts('NUMBER_OF_ENTRIES', [['0','سفرة واحدة'],['1','متعددة']]); }); });
    var nodur = sessionStorage.getItem('nodur');
    $('NUMBER_OF_ENTRIES').addEventListener('change', function(){ if(nodur) return; later(function(){ opts('Number_Entry_Day', [['90','90 يوم'],['365','365 يوم']]); }); });
    $('Number_Entry_Day').addEventListener('change', function(){ if(nodur) return; later(function(){ opts('RESIDENCY_IN_KSA', [['30','30'],['90','90']]); }); });
    document.querySelector('[name=Classify_Occupations_Id]').addEventListener('change', function(){ var c=this.value; later(function(){ opts('JOB_OR_RELATION_Id', c==='832' ? [['8321','سائق سيارة'],['8322','سائق حافلة']] : [['1431','مدير فندق'],['1432','مدير مطعم']]); }); });
    $('COMING_THROUGH').addEventListener('change', function(){ var c=this.value; later(function(){ opts('ENTRY_POINT', c==='2' ? [['5','مطار جدة الدولي'],['6','مطار المدينة']] : [['17','جسر الملك فهد'],['18','منفذ الحديثة']]); }); });
    $('PersonalImage').addEventListener('change', function(){ later(function(){ $('image').setAttribute('src','/SmartForm/GetImage?rand=1'); }); });
    window.__submitted = null;
  });
})();
</script>`;

const wafidFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'wafid-book.html'), 'utf8');
const WMOCK = `<script>
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var city=document.getElementById('id_city'); city.innerHTML='<option value="" selected>اختر مدينة</option>';
    document.getElementById('id_country').addEventListener('change', function(){ setTimeout(function(){ city.innerHTML='<option value="" selected>اختر مدينة</option><option value="120">الإسكندرية</option><option value="87">القاهرة</option>'; }, 400); });
    var f=function(d){ return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear(); };
    window.jQuery=function(el){ return { closest:function(){ return { length:1, calendar:function(cmd,d,u,fc){ if(fc) throw new TypeError("Cannot read properties of undefined (reading 'trim')"); el.value=f(d); } }; } }; }; window.jQuery.fn={calendar:function(){}};
  });
})();
</script>`;

const appHtml = `<!doctype html><meta charset=utf-8><body><script>
window.got=[];window.nexts=[];window.ready=false;window.acks=0;
window.addEventListener('message',function(e){ if(e.source!==window)return; var m=e.data; if(!m||m.source!=='nesr-visaapply-ext')return;
 if(m.type==='VA_READY')window.ready=true; if(m.type==='VA_ACK')window.acks++; if(m.type==='VA_RESULT')window.got.push(m.data); if(m.type==='VA_ERROR')window.got.push({error:m.data.message}); if(m.type==='VA_NEXT')window.nexts.push(m.data); });
window.fill=function(d){ window.postMessage({source:'nesr-visaapply',type:'VA_FILL',data:d},location.origin); };
window.postMessage({source:'nesr-visaapply',type:'VA_PING'},location.origin);
</script></body>`;

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const MOFA = {
  VisaKind: '38', NATIONALITY: 'EGY', EmbassyCode: '320', NUMBER_OF_ENTRIES: 'سفرة واحدة', Number_Entry_Day: '365', RESIDENCY_IN_KSA: '90',
  AFIRSTNAME: 'بدر', AFATHER: 'خليل', AGRAND: 'بدر ابو', AFAMILY: 'العنين', EFIRSTNAME: 'BADR', EFATHER: 'KHALIL', EGRAND: 'BADR', EFAMILY: 'ABOUELENIN',
  PASSPORTnumber: 'A42014007', PASSPORType: '1', PASSPORT_ISSUE_PLACE: 'مصر', PASSPORT_ISSUE_DATE: '2024/07/01', PASSPORT_EXPIRY_DATe: '2032/07/01',
  BIRTH_PLACE: 'Cairo', BIRTH_DATE: '1983/01/01', PersonId: '29001010100011', RELIGION: '1', SOCIAL_STATUS: '2', Sex: '1',
  Classify_Occupations_Id: '832', jobText: 'سائق حافلة', DEGREE: 'دبلوم', DEGREE_SOURCE: 'مصر', ADDRESS_HOME: 'جدة حي الصفا', Personal_Email: 'hr@example.com',
  SPONSER_NAME: 'شركة تجربة', SPONSER_NUMBER: '7001185532', SPONSER_ADDRESS: 'جدة', SPONSER_PHONE: '0500000000',
  COMING_THROUGH: '2', ENTRY_POINT: '17', entryPointText: 'جسر الملك فهد', ExpectedEntryDate: '2027/01/15', porpose: '', car_number: ''
};

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'va-pw-'));
  const ctx = await chromium.launchPersistentContext(profile, { headless: false, args: ['--headless=new', '--no-sandbox', '--disable-extensions-except=' + extDir, '--load-extension=' + extDir], executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
  await ctx.route('https://visa.nisrelkhaleeg.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: appHtml }));
  let postBody = '';
  let loggedIn = true;
  await ctx.route('https://visa.mofa.gov.sa/**', (r) => {
    const rq = r.request();
    if (/\/Base\/GetEntryDurations/.test(rq.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(global.__only90 ? [{ Value: '', Text: '' }, { Value: 90, Text: '90' }] : [{ Value: 365, Text: '365' }]) });
    if (/\/Base\/GetResidenceDurations/.test(rq.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ Value: 90, Text: '90' }]) });
    if (/GetOccupationsByClassificationId/.test(rq.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/jobClassificationId=832/.test(rq.url()) ? [{ Value: 8321, Text: 'سائق سيارة' }, { Value: 8322, Text: 'سائق حافلة' }] : [{ Value: 1431, Text: 'مدير فندق' }]) });
    const html = (b) => r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!doctype html><meta charset=utf-8><body>' + b + '</body>' });
    if (/\/Account\/Login/i.test(rq.url())) return html('<h2>دخول الشركات</h2><input id="user"><input id="pw" type="password">');
    if (/\/Home\/Index/i.test(rq.url())) return html('<h1>الرئيسية</h1>');
    if (!loggedIn && /\/SmartForm\/TraditionalApp/i.test(rq.url())) return r.fulfill({ status: 302, headers: { Location: 'https://visa.mofa.gov.sa/Home/Index' }, body: '' });
    if (rq.method() === 'POST' || /\/SmartForm\/Result/.test(rq.url())) { postBody = rq.postData() || ''; return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!doctype html><meta charset=utf-8><body><h2>تم تقديم الطلب بنجاح</h2><p>رقم الطلب: E123456789</p></body>' }); }
    return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: fixture.replace('</body>', MOCK + '</body>') });
  });
  const app = await ctx.newPage(); await app.goto('https://visa.nisrelkhaleeg.com/'); await app.waitForTimeout(1500);
  assert.ok(await app.evaluate(() => window.ready), 'الإضافة ردّت في صفحة النظام');

  await ctx.route('https://wafid.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: wafidFixture.replace('</body>', WMOCK + '</body>') }));
  const [form] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.fill(d), { personId: '7', name: 'بدر خليل', mofa: MOFA, issues: [], warns: ['تنبيه تجريبي'], photo: PHOTO })]);
  await form.waitForLoadState('domcontentloaded');
  await form.waitForSelector('#nesr-va-again', { timeout: 60000 });
  await form.waitForTimeout(500);
  const state = await form.evaluate(() => {
    const v = (n) => { const e = document.querySelector('[name="' + n + '"]'); return e ? e.value : null; };
    return { VisaKind: v('VisaKind'), NAT: v('NATIONALITY'), Emb: v('EmbassyCode'), Entries: v('NUMBER_OF_ENTRIES'), Days: v('Number_Entry_Day'), Res: v('RESIDENCY_IN_KSA'),
      AF: v('AFIRSTNAME'), AFam: v('AFAMILY'), EF: v('EFIRSTNAME'), EFam: v('EFAMILY'), PNo: v('PASSPORTnumber'), PType: v('PASSPORType'), Issue: v('PASSPORT_ISSUE_PLACE'), IDate: v('PASSPORT_ISSUE_DATE'), BDate: v('BIRTH_DATE'),
      Bplace: v('BIRTH_PLACE'), NID: v('PersonId'), Rel: v('RELIGION'), Soc: v('SOCIAL_STATUS'), Sex: v('Sex'), Class: v('Classify_Occupations_Id'), Job: v('JOB_OR_RELATION_Id'), Deg: v('DEGREE'), Addr: v('ADDRESS_HOME'), Email: v('Personal_Email'),
      Sp: v('SPONSER_NAME'), Come: v('COMING_THROUGH'), Port: v('ENTRY_POINT'), Exp: v('ExpectedEntryDate'),
      prevNo: document.querySelector('input[name="Has_NATIONALITY_FIRST"][value="0"]').checked, traveledNo: document.querySelector('input[name="HaveTraveledToOtherCountries"][value="false"]').checked,
      img: document.getElementById('image').getAttribute('src'), endorse: document.querySelector('input[type=checkbox][name="Endorsement"]').checked, privacy: document.querySelector('input[type=checkbox][name="IsPrivacyPolicyAgreed"]').checked, cap: v('Captcha'),
      bar: document.getElementById('nesr-va-bar').innerText.replace(/\s+/g, ' ').slice(0, 400) };
  });
  console.log(JSON.stringify(state, null, 1));
  assert.deepStrictEqual([state.VisaKind, state.NAT, state.Emb, state.Entries, state.Days, state.Res], ['38', 'EGY', '320', '0', '365', '90']);
  assert.deepStrictEqual([state.AF, state.AFam, state.EF, state.EFam, state.PNo, state.PType], ['بدر', 'العنين', 'BADR', 'ABOUELENIN', 'A42014007', '1']);
  assert.deepStrictEqual([state.Issue, state.IDate, state.BDate, state.Bplace, state.NID, state.Rel, state.Soc, state.Sex], ['مصر', '2024/07/01', '1983/01/01', 'Cairo', '29001010100011', '1', '2', '1']);
  assert.deepStrictEqual([state.Class, state.Job, state.Deg, state.Addr, state.Email, state.Sp, state.Come, state.Port, state.Exp], ['832', '8322', 'دبلوم', 'جدة حي الصفا', 'hr@example.com', 'شركة تجربة', '1', '17', '2027/01/15']);
  assert.ok(state.prevNo && state.traveledNo, 'الراديوهات');
  assert.ok(String(state.img).includes('GetImage'), 'الصورة اترفعت');
  assert.strictEqual(state.endorse, false, 'الإقرارات متعلّمش عليها تلقائي'); assert.strictEqual(state.privacy, false); assert.strictEqual(state.cap, '', 'الكابتشا فاضية');
  const got = await app.evaluate(() => window.got); assert.ok(got.some((g) => g.status === 'filled'), 'النظام اتبلّغ إن الفورم اتملى');

  /* بعد «حفظ»: صفحة النجاح بتتقرا وتتبعت */
  await form.evaluate(() => { window.location.href = '/SmartForm/Result'; });
  await form.waitForSelector('#nesr-va-bar', { timeout: 15000 });
  await form.waitForFunction(() => document.getElementById('nesr-va-bar').innerText.includes('E123456789'), null, { timeout: 15000 }).catch(() => {});
  await app.waitForTimeout(1500);
  const got2 = await app.evaluate(() => window.got); const sub = got2.find((g) => g.status === 'submitted');
  assert.ok(sub && sub.appNumber === 'E123456789' && sub.personId === '7', 'رقم الطلب رجع للنظام: ' + JSON.stringify(got2));
  /* سيناريو 2: مش مسجّل دخول ← المنصة بترجّع للرئيسية ← الإضافة بتوديك لصفحة دخول الشركات ← بعد الدخول بتفتح الفورم وتملاه */
  loggedIn = false;
  const [form2] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.fill(d), { personId: '8', name: 'شخص تاني', mofa: MOFA, issues: [], warns: [], photo: PHOTO })]).catch(() => [null]);
  const tab = form2 || form;
  await tab.waitForURL(/Account\/Login\/enjazcompany/, { timeout: 20000 });
  await tab.waitForFunction(() => (document.getElementById('nesr-va-bar') || {}).innerText && document.getElementById('nesr-va-bar').innerText.includes('سجّل الدخول'), null, { timeout: 15000 });
  console.log('login bar:', await tab.evaluate(() => document.getElementById('nesr-va-bar').innerText.replace(/\s+/g, ' ').slice(0, 120)));
  loggedIn = true; /* المستخدم دخل بنفسه والمنصة وصّلته للرئيسية */
  await tab.goto('https://visa.mofa.gov.sa/Home/Index');
  await tab.waitForURL(/SmartForm\/TraditionalApp/, { timeout: 20000 });
  await tab.waitForSelector('#nesr-va-again', { timeout: 60000 });
  assert.strictEqual(await tab.evaluate(() => document.querySelector('[name="VisaKind"]').value), '38', 'اتملى بعد الدخول');
  /* سيناريو 3: التصنيف المهني غلط (مدير) والمهنة «سائق حافلة» ← الإضافة تلاقي التصنيف الصح لوحدها + تعليم الإقرارين لما يتفعّلوا + المنفذ مطار والوسيلة «برا» ← تتصلّح «جوا» */
  const MOFA3 = { ...MOFA, Classify_Occupations_Id: '143', AUTO_DECLARE: '1', COMING_THROUGH: '1', ENTRY_POINT: '5', entryPointText: 'مطار جدة الدولي' };
  await app.evaluate((d) => window.fill(d), { personId: '9', name: 'تجربة تالتة', mofa: MOFA3, issues: [], warns: [], photo: PHOTO });
  await tab.waitForTimeout(3000);
  await tab.waitForURL(/SmartForm\/TraditionalApp/, { timeout: 20000 });
  await tab.waitForFunction(() => { const b = document.getElementById('nesr-va-bar'); return b && /اتملى \d+ خانة/.test(b.innerText) && !!document.getElementById('nesr-va-again') && document.querySelector('input[name="Endorsement"]') && document.querySelector('input[name="Endorsement"]').checked; }, null, { timeout: 90000 });
  const s3 = await tab.evaluate(() => { const v = (n) => document.querySelector('[name="' + n + '"]').value; return { Class: v('Classify_Occupations_Id'), Job: v('JOB_OR_RELATION_Id'), Come: v('COMING_THROUGH'), Port: v('ENTRY_POINT'), Days: v('Number_Entry_Day'), Res: v('RESIDENCY_IN_KSA'), endorse: document.querySelector('input[name="Endorsement"]').checked, privacy: document.querySelector('input[name="IsPrivacyPolicyAgreed"]').checked, cap: v('Captcha'), bar: document.getElementById('nesr-va-bar').innerText.replace(/\s+/g, ' ').slice(0, 500) }; });
  console.log(JSON.stringify(s3));
  assert.deepStrictEqual([s3.Class, s3.Job, s3.Come, s3.Port, s3.Days, s3.Res], ['832', '8322', '2', '5', '365', '90']);
  assert.ok(s3.endorse && s3.privacy, 'الإقرارين اتعلّموا بالتفعيل'); assert.strictEqual(s3.cap, '', 'الكابتشا لسه فاضية');
  /* سيناريو 4: طابور — بعد «حفظ» يظهر زرار «الشخص التالي» والنظام يستلم طلب الشخص التالي مع باقي الطابور */
  await app.evaluate((d) => window.fill(d), { personId: '10', name: 'أول واحد', mofa: MOFA, issues: [], warns: [], photo: PHOTO, queue: [{ id: '11', name: 'تاني واحد' }, { id: '12', name: 'تالت واحد' }], queueTotal: 3 });
  await tab.waitForTimeout(3000);
  await tab.waitForFunction(() => { const b = document.getElementById('nesr-va-bar'); return b && /اتملى \d+ خانة/.test(b.innerText) && b.innerText.includes('تاني واحد') && !!document.getElementById('nesr-va-next'); }, null, { timeout: 90000 });
  assert.ok((await tab.evaluate(() => document.getElementById('nesr-va-bar').innerText)).includes('الشخص 1 من 3'), 'ترقيم الطابور');
  await tab.evaluate(() => { window.location.href = '/SmartForm/Result'; });
  await tab.waitForFunction(() => document.getElementById('nesr-va-bar') && document.getElementById('nesr-va-bar').innerText.includes('E123456789') && !!document.getElementById('nesr-va-next'), null, { timeout: 20000 });
  await tab.click('#nesr-va-next');
  await app.waitForFunction(() => window.nexts.length > 0, null, { timeout: 10000 });
  const nx = await app.evaluate(() => window.nexts[0]);
  assert.strictEqual(nx.personId, '11'); assert.deepStrictEqual(nx.queue.map((x) => x.id), ['12']); assert.strictEqual(nx.total, 3);
  /* سيناريو 5: المنصة ما حمّلتش صلاحية التأشيرة/مدة الإقامة بنفسها ← الإضافة تسأل نفس رابط المنصة وتحطهم */
  await tab.evaluate(() => sessionStorage.setItem('nodur', '1'));
  await app.evaluate((d) => window.fill(d), { personId: '13', name: 'تجربة API', mofa: MOFA, issues: [], warns: [], photo: PHOTO });
  await tab.waitForTimeout(3000);
  await tab.waitForFunction(() => { const b = document.getElementById('nesr-va-bar'); return b && /اتملى \d+ خانة/.test(b.innerText) && !!document.getElementById('nesr-va-again'); }, null, { timeout: 150000 }).catch(async (e) => { console.log('BAR:', await tab.evaluate(() => (document.getElementById('nesr-va-bar') || {}).innerText)); throw e; });
  const s5 = await tab.evaluate(() => ({ Days: document.querySelector('[name="Number_Entry_Day"]').value, Res: document.querySelector('[name="RESIDENCY_IN_KSA"]').value }));
  assert.deepStrictEqual([s5.Days, s5.Res], ['365', '90'], 'اتحمّلوا من المنصة مباشرة: ' + JSON.stringify(s5));
  /* سيناريو 6: المنصة بتعرض 90 يوم بس (مش 365) ← الإضافة تختار الاختيار الوحيد وتنبّه إنه اتغيّر */
  global.__only90 = true;
  await app.evaluate((d) => window.fill(d), { personId: '14', name: 'تجربة 90', mofa: MOFA, issues: [], warns: [], photo: PHOTO });
  await tab.waitForTimeout(3000);
  await tab.waitForFunction(() => { const b = document.getElementById('nesr-va-bar'); return b && /اتملى \d+ خانة/.test(b.innerText) && !!document.getElementById('nesr-va-again'); }, null, { timeout: 150000 });
  const s6 = await tab.evaluate(() => ({ Days: document.querySelector('[name="Number_Entry_Day"]').value, bar: document.getElementById('nesr-va-bar').innerText.replace(/\s+/g, ' ') }));
  assert.strictEqual(s6.Days, '90'); assert.ok(s6.bar.includes('اتغيّر عن ملف الضبط') && s6.bar.includes('«365»'), 'التنبيه: ' + s6.bar);
  /* سيناريو 7: حجز الفحص الطبي في وافد */
  const WF = { country: 'EGY', city: 'القاهرة', traveled: 'SA', visa: 'hu', first: 'ATEF', last: 'ELSHAHAWY', dob: '1989-11-01', nationalityText: 'مصري', gender: 'male', marital: 'married', passport: 'A45449365', issueDate: '2026-06-24', expiryDate: '2033-06-23', issuePlace: 'Egypt', email: 'a@b.com', phone: '01000000000', nationalId: '29001010100011', position: '65' };
  const [wpage] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_WAFID', data: d }, location.origin), { personId: '21', name: 'تجربة وافد', wafid: WF, issues: [], warns: [] })]);
  await wpage.waitForSelector('#nesr-wf-bar', { timeout: 30000 });
  await wpage.waitForFunction(() => /اتملى \d+ خانة/.test((document.getElementById('nesr-wf-bar') || {}).innerText || ''), null, { timeout: 90000 });
  const w7 = await wpage.evaluate(() => { const v = (id) => document.getElementById(id).value; return { country: v('id_country'), city: v('id_city'), trav: v('id_traveled_country'), first: v('id_first_name'), last: v('id_last_name'), nat: v('id_nationality'), gender: v('id_gender'), marital: v('id_marital_status'), pass: v('id_passport'), pass2: v('id_confirm_passport'), place: v('id_passport_issue_place'), email: v('id_email'), phone: v('id_phone'), nid: v('id_national_id'), pos: v('id_applied_position'), dob: v('id_dob'), iss: v('id_passport_issue_date'), exp: v('id_passport_expiry_on'), visa: v('id_visa_type'), confirm: document.getElementById('id_confirm').checked, apptDate: v('id_appointment_date'), captcha: v('id_captcha'), bar: document.getElementById('nesr-wf-bar').innerText.replace(/\s+/g, ' ') }; });
  console.log(JSON.stringify(w7));
  assert.deepStrictEqual([w7.country, w7.city, w7.trav, w7.first, w7.last, w7.nat, w7.gender, w7.marital], ['EGY', '87', 'SA', 'ATEF', 'ELSHAHAWY', '55', 'male', 'married']);
  assert.deepStrictEqual([w7.pass, w7.pass2, w7.place, w7.email, w7.phone, w7.nid, w7.pos, w7.visa], ['A45449365', 'A45449365', 'Egypt', 'a@b.com', '01000000000', '29001010100011', '65', 'hu']);
  assert.deepStrictEqual([w7.dob, w7.iss, w7.exp], ['01/11/1989', '24/06/2026', '23/06/2033'], 'التواريخ اتحطت بتقويم الصفحة');
  assert.strictEqual(w7.confirm, false, 'الإقرار مش بيتعلّم'); assert.strictEqual(w7.apptDate, '', 'تاريخ الموعد مش بيتلمس'); assert.strictEqual(w7.captcha, '', 'الكابتشا مش بتتلمس');
  console.log('EXT E2E OK');
  await ctx.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
