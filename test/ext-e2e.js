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

const visaLookupFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'visa-lookup.html'), 'utf8');
const visaHomeFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'visa-home.html'), 'utf8');
const visaPrintFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'visa-print.html'), 'utf8');
const printEmptyFixture = visaPrintFixture.replace(/setTimeout\(function\(\)\{[\s\S]*?\}, 700\);/, () => 'document.querySelector(".jtable-busy-panel-background").style.display = "none"; document.getElementById("tb").innerHTML = \'<tr class="jtable-no-data-row"><td colspan="11">لا توجد بيانات!</td></tr>\';');
const visaResultFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'visa-result.html'), 'utf8');
const appnoSearchFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'appno-search.html'), 'utf8');
const appnoResultFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'appno-result.html'), 'utf8');
const appListFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'visa-applist.html'), 'utf8');
const enjazMainFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'enjaz-main.html'), 'utf8');
const enjazPrintFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'enjaz-print.html'), 'utf8');
const wafidStatusFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'wafid-status.html'), 'utf8');
const wafidCardFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'wafid-status-card.html'), 'utf8');
const TINY_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
const labFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'lab-booking.html'), 'utf8');
/* بيحاكي سلوك APEX في صفحة المعمل: الأقسام مخفية لحد اختيار نوع الجنسية، والرقم القومي بيحسب تاريخ الميلاد والجنس */
const LMOCK = `<script>
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var $=function(i){return document.getElementById(i)};
    var regions=document.querySelectorAll('.t-Region'); var hold=[];
    regions.forEach(function(r){ if(r.querySelector('#P2_NATIONAL_ID')){ hold.push(r); r.style.display='none'; } });
    document.querySelectorAll('input[name=P2_NATIONALITY_TYPE]').forEach(function(r){ r.addEventListener('change', function(){ setTimeout(function(){ hold.forEach(function(x){ x.style.display=''; }); },300); }); });
    $('P2_NATIONAL_ID').addEventListener('change', function(){ var v=this.value; setTimeout(function(){ if(!/^[23]\\d{13}$/.test(v)) return; var y=(v[0]==='2'?1900:2000)+Number(v.slice(1,3)); $('P2_DATE_OF_BIRTH').value=v.slice(5,7)+'-'+v.slice(3,5)+'-'+y; $('P2_SEX').value=(Number(v[12])%2)?'1':'2'; },400); });
    window.apex={item:function(id){ return { setValue:function(v){ document.getElementById(id).value=v; } }; }};
  });
})();
</script>`;

const appHtml = `<!doctype html><meta charset=utf-8><body><script>
window.apcaps=[];window.apres=[];window.wres=[];window.got=[];window.visa=[];window.docs=[];window.caps=[];window.nexts=[];window.ready=false;window.acks=0;
window.addEventListener('message',function(e){ if(e.source!==window)return; var m=e.data; if(!m||m.source!=='nesr-visaapply-ext')return;
 if(m.type==='VA_READY')window.ready=true; if(m.type==='VA_ACK')window.acks++; if(m.type==='VA_RESULT')window.got.push(m.data); if(m.type==='VA_ERROR')window.got.push({error:m.data.message}); if(m.type==='VA_NEXT')window.nexts.push(m.data); if(m.type==='VA_VISAINFO_RESULT')window.visa.push(m.data); if(m.type==='VA_VISAINFO_CAPTCHA')window.caps.push(m.data); if(m.type==='VA_VISAINFO_DOC')window.docs.push(m.data); if(m.type==='VA_APPNO_CAPTCHA')window.apcaps.push(m.data); if(m.type==='VA_APPNO_RESULT')window.apres.push(m.data); if(m.type==='VA_WAFIDRES_RESULT')window.wres.push(m.data); });
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
    if (/\/SmartForm\/Search/i.test(rq.url())) { global.__searchCalls = (global.__searchCalls || 0) + 1; const pn = new URLSearchParams(rq.postData() || '').get('PassportNo'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Result: 'OK', Records: (global.__searchRecs || []).filter((x) => !pn || x.PASSPORT_NO === pn), TotalRecordCount: 3 }) }); }
    if (/\/Base\/GetEntryDurations/.test(rq.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(global.__only90 ? [{ Value: '', Text: '' }, { Value: 90, Text: '90' }] : [{ Value: 365, Text: '365' }]) });
    if (/\/Base\/GetResidenceDurations/.test(rq.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ Value: 90, Text: '90' }]) });
    if (/GetOccupationsByClassificationId/.test(rq.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/jobClassificationId=832/.test(rq.url()) ? [{ Value: 8321, Text: 'سائق سيارة' }, { Value: 8322, Text: 'سائق حافلة' }] : [{ Value: 1431, Text: 'مدير فندق' }]) });
    if (/\/enjaz\/getvisainformation\/person/i.test(rq.url())) return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: visaLookupFixture });
    if (/\/enjaz\/ViewVisaDetails\/person/i.test(rq.url())) { if (rq.method() === 'POST') { global.__visaPost = rq.postData() || ''; if (!/Captcha=123456/.test(global.__visaPost)) return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: visaLookupFixture }); } return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: global.__cairoOnly ? visaResultFixture.replace("'320':{", "'3200':{") : visaResultFixture }); }
    if (/\/visaperson\/(getapplicantdata|GetPersonVisa)/i.test(rq.url())) {
      const page = (err) => r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: appnoSearchFixture.replace('style="display: none"><!--ERR-->', err ? '>' + err : 'style="display: none">') });
      if (rq.method() !== 'POST') return page('');
      global.__apPost = rq.postData() || ''; const f = new URLSearchParams(global.__apPost);
      if (f.get('Captcha') !== '123456') return page('رمز الصورة غير صحيح');
      if (f.get('PassportNumber') === 'Z9999999') return page('لم يتم العثور على اي نتائج، يرجى التاكد من البيانات المدخلة');
      return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: appnoResultFixture.replace('PASSPORT_PLACEHOLDER', f.get('PassportNumber')) });
    }
    if (/\/Enjaz\/PrintApplication/i.test(rq.url())) { const no = (rq.url().match(/ApplicationNo=(\d+)/) || [])[1]; if (global.__netDirectFails && rq.method() === 'GET') return r.fulfill({ status: 302, headers: { Location: 'https://visa.mofa.gov.sa/Enjaz/Main' }, body: '' }); return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: enjazPrintFixture.replace('EAPPNO', 'E' + (no || '')) }); }
    if (/\/Enjaz\/Main/i.test(rq.url())) { if (rq.method() === 'POST') { global.__netPost = rq.postData() || ''; const no = (global.__netPost.match(/AppNo=(\d+)/) || [])[1]; if (no === '828000000') return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: enjazMainFixture.replace('</body>', '<div class="alert alert-danger">لا يوجد طلب بهذا الرقم</div></body>') }); return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: enjazPrintFixture.replace('EAPPNO', 'E' + (no || '')) }); } return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: enjazMainFixture }); }
    if (/\/SmartForm\/?(\?.*)?$/i.test(rq.url()) && rq.method() === 'GET') return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: appListFixture });
    if (/\/SmartForm\/PrintApplication\//i.test(rq.url())) return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!doctype html><meta charset=utf-8><body><h2>تم تقديم الطلب</h2><div>رقم الطلب: 830068985</div><div>رقم الجواز : A12345678</div></body>' });
    if (/\/Home\/PrintVisa/i.test(rq.url())) { global.__printUrl = rq.url(); return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: global.__printEmpty ? printEmptyFixture : visaPrintFixture }); }
    if (global.__inquiry === 'broken' && /\/Home\/Index/i.test(rq.url())) return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!doctype html><meta charset=utf-8><body><h1>صفحة غريبة</h1></body>' });
    if (global.__inquiry && /\/Home\/Index/i.test(rq.url())) return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: visaHomeFixture });
    const html = (b) => r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!doctype html><meta charset=utf-8><body>' + b + '</body>' });
    if (/\/Account\/Login/i.test(rq.url())) return html('<h2>دخول الشركات</h2><input id="user"><input id="pw" type="password">');
    if (/\/Home\/Index/i.test(rq.url())) return html('<h1>الرئيسية</h1>');
    if (!loggedIn && /\/SmartForm\/TraditionalApp/i.test(rq.url())) return r.fulfill({ status: 302, headers: { Location: 'https://visa.mofa.gov.sa/Home/Index' }, body: '' });
    if (rq.method() === 'POST' || /\/SmartForm\/Result/.test(rq.url())) { postBody = rq.postData() || ''; return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: '<!doctype html><meta charset=utf-8><body><h2>تم تقديم الطلب بنجاح</h2><p>رقم الطلب: E123456789</p></body>' }); }
    return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: fixture.replace('</body>', MOCK + '</body>') });
  });
  global.__searchRecs = [{ ID: 829000001, FullName: 'BADR KHALIL BADR ABOUELENIN', PASSPORT_NO: 'A42014007' }, { ID: 830099999, FullName: 'SAMIR TEST HASSAN', PASSPORT_NO: 'A42014007' }];
  const app = await ctx.newPage(); await app.goto('https://visa.nisrelkhaleeg.com/'); await app.waitForTimeout(1500);
  async function wresTest() {
  /* سيناريو 18: نتيجة الكشف الطبي في وافد — بيكتب الجواز والجنسية، يستنى تحقق وافد، يدوس Check، ينزّل الـ PDF ويرجّع النتيجة */
  const wresOpen = async (d) => { const [p] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((x) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_WAFIDRES', data: x }, location.origin), d)]); return p; };
  const wr1 = await wresOpen({ personId: '7', name: 'شخص تجربة', passportNo: 'A12345678', nationality: 'EGY' });
  await app.waitForFunction(() => window.wres.length > 0, null, { timeout: 30000 }).catch(async (er) => { console.log('wafid page:', wr1.url(), await wr1.evaluate(() => ({ bar: (document.getElementById('nesr-wres-bar') || {}).textContent, pass: (document.getElementById('id_passport') || {}).value, cap: (document.getElementById('id_captcha') || {}).value, res: document.documentElement.dataset.vaWafidResult })).catch((e) => e.message), global.__wresPost); throw er; });
  const w1 = await app.evaluate(() => window.wres[0]);
  assert.deepStrictEqual([w1.personId, w1.status, w1.examDate, w1.passportNo, w1.center], ['7', 'fit', '2026-08-23', 'A12345678', 'Test Clinic'], 'نتيجة وافد: ' + JSON.stringify(w1));
  const wf = new URLSearchParams(global.__wresPost); assert.deepStrictEqual([wf.get('search_variant'), wf.get('passport'), wf.get('nationality'), wf.get('captcha')], ['passport', 'A12345678', '55', 'page-token'], 'الجواز والجنسية اتكتبوا والتحقق من الصفحة نفسها: ' + global.__wresPost);
  await wr1.waitForFunction(() => document.documentElement.dataset.vaWafidPdf === '1', null, { timeout: 15000 }); assert.ok(global.__wresPdf >= 1, 'الـ PDF اتنزّل');
  await wr1.close();
  /* مفيش نتيجة: رسالة واضحة ومفيش حاجة بتتبعت */
  const nW = await app.evaluate(() => window.wres.length);
  const wr2 = await wresOpen({ personId: '8', name: 'تجربة', passportNo: 'Z9999999', nationality: 'EGY' });
  await wr2.waitForFunction(() => { const b = document.getElementById('nesr-wres-bar'); return b && /ما طلّعش نتيجة/.test(b.textContent); }, null, { timeout: 30000 });
  assert.ok(/No records found/.test(await wr2.textContent('#nesr-wres-bar')), 'رسالة وافد ظهرت'); assert.strictEqual(await app.evaluate(() => window.wres.length), nW, 'مفيش نتيجة اتبعتت');
  await wr2.close();
  }
  assert.ok(await app.evaluate(() => window.ready), 'الإضافة ردّت في صفحة النظام');

  await ctx.route('https://wafid.com/**', (r) => {
    const rq = r.request();
    if (/\/medical-status\/TESTTOKEN\/download\/?$/.test(rq.url())) { global.__wresPdf = (global.__wresPdf || 0) + 1; return r.fulfill({ status: 200, contentType: 'application/pdf', body: TINY_PDF }); }
    if (/\/medical-status-search\/?/.test(rq.url())) {
      if (rq.method() !== 'POST') return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: wafidStatusFixture });
      global.__wresPost = rq.postData() || ''; const f = new URLSearchParams(global.__wresPost);
      if (f.get('passport') === 'Z9999999') return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: wafidStatusFixture.replace('<!--ERR-->', '<div class="ui error message">No records found</div>') });
      return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: wafidStatusFixture.replace('<!--RESULT-->', wafidCardFixture.replace('PASSNO', f.get('passport')).replace('STATUS', f.get('passport') === 'U1111111' ? 'Unfit' : 'Fit')) });
    }
    return r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: wafidFixture.replace('</body>', WMOCK + '</body>') });
  });
  if (process.env.EXT_ONLY === 'wres') { await wresTest(); console.log('EXT E2E OK (وافد بس)'); await ctx.close(); process.exit(0); }
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
  /* بعد «حفظ» المنصة بترجّع لـ «قائمة طلبات التأشيرات» والرقم من غير E ← الإضافة بتلاقي صف الجواز (أحدث طلب) وتبعته بـ E */
  /* اللقطة قبل «حفظ» اتاخدت من البحث: الطلب القديم 829000001 + طلب لشخص تاني بنفس الجواز. بعد الحفظ الجديد 830068985 بيظهر ← لازم ياخده هو بس (مش القديم ولا التاني الأحدث بتاع اسم تاني) */
  assert.ok(global.__searchCalls >= 1, 'اللقطة قبل الحفظ اتاخدت');
  global.__searchRecs.push({ ID: 830068985, FullName: 'BADR KHALIL BADR ABOUELENIN', PASSPORT_NO: 'A42014007' });
  const nGot = await app.evaluate(() => window.got.length);
  await form.evaluate(() => { window.location.href = '/SmartForm'; });
  await app.waitForFunction((n) => window.got.slice(n).some((g) => g.status === 'submitted'), nGot, { timeout: 20000 });
  const lst = await app.evaluate((n) => window.got.slice(n).find((g) => g.status === 'submitted'), nGot);
  assert.deepStrictEqual([lst.appNumber, lst.personId, lst.passportNo], ['E830068985', '7', 'A42014007'], 'رقم الطلب من قايمة الطلبات: ' + JSON.stringify(lst));
  /* نفس الصفحة تاني (F5) مش بتبعت تاني */
  await form.reload(); await form.waitForTimeout(2500); assert.strictEqual(await app.evaluate((n) => window.got.slice(n).filter((g) => g.status === 'submitted').length, nGot), 1, 'مبيتبعتش مرتين');
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
  const WF = { country: 'EGY', city: 'القاهرة', traveled: 'SA', visa: 'hu', first: 'ATEF', last: 'ELSHAHAWY', dob: '1989-11-01', nationalityText: 'مصري', gender: 'male', marital: 'married', passport: 'A45449365', issueDate: '2026-06-24', expiryDate: '2033-06-23', issuePlace: 'Egypt', email: 'a@b.com', phone: '+201000000000', nationalId: '29001010100011', position: '65', autoDeclare: true };
  const [wpage] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_WAFID', data: d }, location.origin), { personId: '21', name: 'تجربة وافد', wafid: WF, issues: [], warns: [] })]);
  await wpage.waitForSelector('#nesr-wf-bar', { timeout: 30000 });
  await wpage.waitForFunction(() => /اتملى \d+ خانة/.test((document.getElementById('nesr-wf-bar') || {}).innerText || ''), null, { timeout: 90000 });
  const w7 = await wpage.evaluate(() => { const v = (id) => document.getElementById(id).value; return { country: v('id_country'), city: v('id_city'), trav: v('id_traveled_country'), first: v('id_first_name'), last: v('id_last_name'), nat: v('id_nationality'), gender: v('id_gender'), marital: v('id_marital_status'), pass: v('id_passport'), pass2: v('id_confirm_passport'), place: v('id_passport_issue_place'), email: v('id_email'), phone: v('id_phone'), nid: v('id_national_id'), pos: v('id_applied_position'), dob: v('id_dob'), iss: v('id_passport_issue_date'), exp: v('id_passport_expiry_on'), visa: v('id_visa_type'), confirm: document.getElementById('id_confirm').checked, apptDate: v('id_appointment_date'), apptType: document.getElementById('id_appointment_type_0').checked, captcha: v('id_captcha'), bar: document.getElementById('nesr-wf-bar').innerText.replace(/\s+/g, ' ') }; });
  console.log(JSON.stringify(w7));
  assert.deepStrictEqual([w7.country, w7.city, w7.trav, w7.first, w7.last, w7.nat, w7.gender, w7.marital], ['EGY', '87', 'SA', 'ATEF', 'ELSHAHAWY', '55', 'male', 'married']);
  assert.deepStrictEqual([w7.pass, w7.pass2, w7.place, w7.email, w7.phone, w7.nid, w7.pos, w7.visa], ['A45449365', 'A45449365', 'Egypt', 'a@b.com', '+201000000000', '29001010100011', '65', 'hu']);
  assert.deepStrictEqual([w7.dob, w7.iss, w7.exp], ['01/11/1989', '24/06/2026', '23/06/2033'], 'التواريخ اتحطت بتقويم الصفحة');
  assert.strictEqual(w7.confirm, true, 'الإقرار اتعلّم لأن الإعداد مفعّل'); assert.ok(w7.apptType, 'نوع الموعد اتسجّل'); assert.strictEqual(w7.apptDate, '', 'تاريخ الموعد مش بيتلمس'); assert.strictEqual(w7.captcha, '', 'الكابتشا مش بتتلمس');
  /* سيناريو 8: طابور وافد — زرار «الشخص التالي» بيبعت للنظام target=wafid */
  const nBefore = await app.evaluate(() => window.nexts.length);
  const [wpage2] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_WAFID', data: d }, location.origin), { personId: '22', name: 'أول وافد', wafid: WF, issues: [], warns: [], queue: [{ id: '23', name: 'تاني وافد' }], queueTotal: 2 })]);
  await wpage2.waitForSelector('#nesr-wf-next', { timeout: 120000 });
  await wpage2.click('#nesr-wf-next');
  await app.waitForFunction((n) => window.nexts.length > n, nBefore, { timeout: 10000 });
  const nx2 = await app.evaluate(() => window.nexts[window.nexts.length - 1]);
  assert.deepStrictEqual([nx2.personId, nx2.target, nx2.queue.length, nx2.total], ['23', 'wafid', 0, 2]);
  /* سيناريو 9: حجز المعمل (clab.mohp.gov.eg) — الرقم القومي بيحسب الميلاد والجنس، ويوم/ساعة الحجز والتحاليل والدفع و«تأكيد» مبتتلمسش */
  await ctx.route('https://clab.mohp.gov.eg/**', (r) => r.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: labFixture.replace('</body>', LMOCK + '</body>') }));
  const LAB = { natType: '1', destination: '2182', nationalId: '28901011234571', passport: 'A45449365', fullName: 'ATEF MOHAMED ELSHAHAWY', occupation: '65', phone: '+201000000000', email: 'a@b.com', netNumber: 'E123456789', dob: '1989-01-01', sex: '1' };
  const [lpage] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_LAB', data: d }, location.origin), { personId: '31', name: 'تجربة معمل', lab: LAB, issues: [], warns: [], queue: [{ id: '32', name: 'تاني معمل' }], queueTotal: 2 })]);
  await lpage.waitForSelector('#nesr-lab-bar', { timeout: 30000 });
  await lpage.waitForFunction(() => /اتملى \d+ خانة/.test((document.getElementById('nesr-lab-bar') || {}).innerText || ''), null, { timeout: 90000 });
  const l9 = await lpage.evaluate(() => { const v = (id) => document.getElementById(id).value; return { type: document.querySelector('input[name=P2_NATIONALITY_TYPE]:checked') && document.querySelector('input[name=P2_NATIONALITY_TYPE]:checked').value, fac: v('P2_FACILITY_ID'), dest: v('P2_DESTINATION_COUNTRY'), nid: v('P2_NATIONAL_ID'), pass: v('P2_PASSPORT_NUMBER'), name: v('P2_FULL_NAME'), job: v('P2_OCCUPATION'), tel: v('P2_TEL_NO'), email: v('P2_EMAIL'), dob: v('P2_DATE_OF_BIRTH'), sex: v('P2_SEX'), bdate: v('P2_BOOKING_DATE'), bhour: v('P2_BOOKING_HOUR'), pay: !!document.querySelector('input[name=P2_PAYMENT_METHOD_TYPE]:checked'), bar: document.getElementById('nesr-lab-bar').innerText.replace(/\s+/g, ' ') }; });
  console.log(JSON.stringify(l9));
  assert.deepStrictEqual([l9.type, l9.fac, l9.dest, l9.nid, l9.pass, l9.name, l9.job, l9.tel, l9.email, l9.dob, l9.sex], ['1', '1', '2182', '28901011234571', 'A45449365', 'ATEF MOHAMED ELSHAHAWY', '65', '+201000000000', 'a@b.com', '01-01-1989', '1'], 'حجز المعمل اتملى');
  assert.strictEqual(l9.bdate, '', 'يوم الحجز مش بيتلمس'); assert.strictEqual(l9.bhour, '', 'ساعة الحجز مش بتتلمس'); assert.strictEqual(l9.pay, false, 'طريقة الدفع مش بتتلمس');
  assert.ok(l9.bar.includes('تأكيد') && l9.bar.includes('الشخص 1 من 2') && l9.bar.includes('تاني معمل'), 'شريط المعمل + الطابور: ' + l9.bar);
  const nBefore2 = await app.evaluate(() => window.nexts.length);
  await lpage.click('#nesr-lab-next');
  await app.waitForFunction((n) => window.nexts.length > n, nBefore2, { timeout: 10000 });
  const nx3 = await app.evaluate(() => window.nexts[window.nexts.length - 1]);
  assert.deepStrictEqual([nx3.personId, nx3.target, nx3.queue.length, nx3.total], ['32', 'lab', 0, 2]);
  global.__inquiry = true;
  /* سيناريو 10: زرار واحد «جلب بيانات التأشيرة من المنصة»: الأول مستند التأشيرة (كابتشا غلط ثم صح) وبعده «التفويض على تأشيرة» في نفس التبويب (كابتشا غلط ثم صح)، والتبويب بيتقفل */
  const openVi = async (data) => { const [p] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_VISAINFO', data: d }, location.origin), data)]); await p.waitForTimeout(1500); await p.reload().catch(async () => { await p.waitForTimeout(2000); await p.reload(); }); return p; };
  const viSubmit = (c) => app.evaluate((cap) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_VISAINFO_CTL', data: { op: 'submit', captcha: cap } }, location.origin), c);
  const vpage = await openVi({ name: 'ملف تجربة', visaNumber: '1000000001', unifiedNumber: '7000000001', embassy: '' });
  await app.waitForFunction(() => window.caps.length > 0, null, { timeout: 40000 });
  const c1 = await app.evaluate(() => window.caps[0]);
  assert.ok(String(c1.image).startsWith('data:image/png;base64,') && !c1.error && c1.step === 2 && !c1.only, 'أول خطوة: كابتشا مستند التأشيرة');
  const h2 = await vpage.evaluate(() => ({ type: document.getElementById('SearchingType').value, no: document.getElementById('ApplicationNumber').value, sp: document.getElementById('SponserID').value, cap: document.getElementById('Captcha').value }));
  assert.deepStrictEqual([h2.type, h2.no, h2.sp, h2.cap], ['2', '1000000001', '7000000001', ''], 'استعلام المستند اتملا برقم التأشيرة والكابتشا فاضية: ' + JSON.stringify(h2));
  await app.evaluate(() => window.postMessage({ source: 'nesr-visaapply', type: 'VA_VISAINFO_CTL', data: { op: 'refresh' } }, location.origin));
  await app.waitForFunction(() => window.caps.length > 1, null, { timeout: 20000 });
  assert.notStrictEqual((await app.evaluate(() => window.caps[1])).image, c1.image, 'صورة كابتشا تانية');
  let nc = await app.evaluate(() => window.caps.length); await viSubmit('000000'); await app.waitForFunction((n) => window.caps.length > n, nc, { timeout: 30000 });
  const e2 = await app.evaluate(() => window.caps[window.caps.length - 1]); assert.ok(e2.step === 2 && e2.error === true, 'كود غلط في المستند: ' + JSON.stringify(e2).slice(0, 120));
  await viSubmit('123456'); await app.waitForFunction(() => window.docs.length > 0, null, { timeout: 40000 });
  const doc = await app.evaluate(() => window.docs[0]);
  assert.deepStrictEqual([doc.docNumber, doc.docDate, doc.sponsorName, doc.visaKindId, doc.next], ['1000000002', '1447/09/25', 'شركة تجربة للنقل', '13', true], JSON.stringify(doc));
  assert.deepStrictEqual(doc.rows, [{ visaKind: 'عمل موسمي', embassy: 'السويس', gender: 'ذكر', nationality: 'مصر', job: 'سائق حافلة', entries: 'سفرة واحدة', residence: '90' }], 'صف مستند التأشيرة');
  assert.ok(/t=2&n=1000000001&s=7000000001/.test(global.__printUrl), 'اتبعت للمنصة: ' + global.__printUrl);
  /* الخطوة 2: نفس التبويب بيروح لـ «التفويض على تأشيرة» وجهة القدوم من المستند (السويس) */
  await app.waitForFunction(() => window.caps.some((c) => c.step === 1 && c.image), null, { timeout: 40000 });
  const v10 = await vpage.evaluate(() => ({ visa: document.getElementById('VisaNumber').value, reg: document.getElementById('SponserID').value, emb: document.getElementById('Embassy').value, cap: document.getElementById('Captcha').value }));
  assert.deepStrictEqual([v10.visa, v10.reg, v10.emb, v10.cap], ['1000000001', '7000000001', '320', ''], 'صفحة التفويض اتملت والكابتشا فاضية: ' + JSON.stringify(v10));
  nc = await app.evaluate(() => window.caps.length); await viSubmit('000000'); await app.waitForFunction((n) => window.caps.length > n, nc, { timeout: 30000 });
  assert.ok((await app.evaluate(() => window.caps[window.caps.length - 1])).error === true, 'كود غلط ← تنبيه + كابتشا جديدة');
  await viSubmit('123456'); await app.waitForFunction(() => window.visa.length > 0, null, { timeout: 40000 });
  assert.ok(/VisaNumber=1000000001/.test(global.__visaPost) && /SponserID=7000000001/.test(global.__visaPost) && /Embassy=320/.test(global.__visaPost) && /Captcha=123456/.test(global.__visaPost), 'اتبعت للمنصة: ' + global.__visaPost);
  const vi = await app.evaluate(() => window.visa[0]);
  assert.deepStrictEqual([vi.visaNumber, vi.visaDate, vi.sponsorName, vi.unifiedNumber, vi.embassyCode, vi.embassyName], ['1000000001', '1447/09/25', 'شركة تجربة للنقل', '7000000001', '320', 'السويس'], JSON.stringify(vi));
  assert.deepStrictEqual(vi.delegations, [{ number: '20000001', embassy: 'السويس', count: '14', job: 'سائق حافلة', agencyNumber: '30000001', agencyName: 'وكالة تجربة' }], 'التفاويض: السويس');
  assert.deepStrictEqual(vi.jobs, [{ count: '8', job: 'سائق حافلة', nationality: 'مصر', embassy: 'السويس', remaining: '3' }], 'المهن: السويس');
  await vpage.waitForEvent('close', { timeout: 15000 }).catch(() => {}); assert.ok(vpage.isClosed(), 'تبويب المنصة اتقفل لوحده بعد الخطوتين');
  /* سيناريو 14 (التفويض بس، mode=info): البيانات في القاهرة مش السويس ← الإضافة تجرّب لوحدها وتقف عند أول واحدة فيها بيانات */
  global.__cairoOnly = true;
  const nVisa6 = await app.evaluate(() => window.visa.length); const nCaps6 = await app.evaluate(() => window.caps.length);
  const vp6 = await openVi({ name: 'ملف تجربة', visaNumber: '1000000001', unifiedNumber: '7000000001', embassy: '', mode: 'info' });
  await app.waitForFunction((n) => window.caps.length > n, nCaps6, { timeout: 40000 });
  assert.strictEqual((await app.evaluate(() => window.caps[window.caps.length - 1])).step, 1, 'mode=info بيبدأ بالتفويض');
  await viSubmit('123456'); await app.waitForFunction((n) => window.visa.length > n, nVisa6, { timeout: 60000 });
  const v6 = await app.evaluate(() => window.visa[window.visa.length - 1]);
  assert.deepStrictEqual([v6.embassyCode, v6.embassyName, v6.triedEmbassies], ['302', 'القاهرة', ['السويس', 'القاهرة']], 'جرّب السويس ثم القاهرة: ' + JSON.stringify([v6.embassyCode, v6.triedEmbassies]));
  assert.deepStrictEqual(v6.delegations.map((x) => x.embassy), ['القاهرة'], 'تفاويض القاهرة بس');
  await vp6.waitForEvent('close', { timeout: 15000 }).catch(() => {}); global.__cairoOnly = false;
  /* سيناريو 12: «مستند التأشيرة بس» (mode=doc) — كابتشا واحدة والتبويب بيتقفل بعد النتيجة */
  global.__printUrl = '';
  const nDocs = await app.evaluate(() => window.docs.length); const nCaps4 = await app.evaluate(() => window.caps.length);
  const vp4 = await openVi({ name: 'ملف تجربة', visaNumber: '1000000001', unifiedNumber: '7000000001', mode: 'doc', embassy: '' });
  await app.waitForFunction((n) => window.caps.length > n, nCaps4, { timeout: 40000 });
  const c4 = await app.evaluate(() => window.caps[window.caps.length - 1]); assert.ok(c4.step === 2 && c4.only === true && String(c4.image).startsWith('data:image/png'), 'كابتشا مستند التأشيرة بس');
  await viSubmit('123456'); await app.waitForFunction((n) => window.docs.length > n, nDocs, { timeout: 40000 });
  assert.strictEqual((await app.evaluate(() => window.docs[window.docs.length - 1])).next, false);
  await vp4.waitForEvent('close', { timeout: 15000 }).catch(() => {}); assert.ok(vp4.isClosed(), 'التبويب اتقفل بعد المستند');
  /* سيناريو 13: المستند رجع من غير بيانات ← النظام بياخد السبب، وبيكمّل لوحده ببيانات التأشيرة والمهن */
  global.__printEmpty = true;
  const nCaps5 = await app.evaluate(() => window.caps.length);
  const vp5 = await openVi({ name: 'ملف تجربة', visaNumber: '1000000001', unifiedNumber: '7000000001', embassy: '' });
  await app.waitForFunction((n) => window.caps.length > n, nCaps5, { timeout: 40000 });
  await viSubmit('123456');
  await app.waitForFunction(() => window.caps.some((c) => c.empty === true && c.next === true && /لا توجد بيانات/.test(c.message || '')), null, { timeout: 40000 });
  await app.waitForFunction((n) => window.caps.slice(n).some((c) => c.step === 1 && c.image), nCaps5, { timeout: 40000 });
  await app.evaluate(() => window.postMessage({ source: 'nesr-visaapply', type: 'VA_VISAINFO_CTL', data: { op: 'cancel' } }, location.origin)); await vp5.waitForEvent('close', { timeout: 15000 }).catch(() => {});
  global.__printEmpty = false;
  /* سيناريو 11: صفحة استعلام المستند مش زي المتوقع (تحويل/دخول…) ← النظام بيتقاله، والإضافة بتكمّل بالتفويض */
  global.__inquiry = 'broken';
  const nCaps3 = await app.evaluate(() => window.caps.length); const nVisa3 = await app.evaluate(() => window.visa.length);
  const vp3 = await openVi({ name: 'ملف تجربة', visaNumber: '1000000001', unifiedNumber: '7000000001', embassy: '' });
  await app.waitForFunction(() => window.caps.some((c) => c.step === 2 && c.image === '' && /Home\/Index/.test(c.message || '')), null, { timeout: 40000 });
  await app.waitForFunction((n) => window.caps.slice(n).some((c) => c.step === 1 && c.image), nCaps3, { timeout: 40000 });
  await viSubmit('123456'); await app.waitForFunction((n) => window.visa.length > n, nVisa3, { timeout: 40000 });
  await vp3.waitForEvent('close', { timeout: 15000 }).catch(() => {}); global.__inquiry = true;
  /* سيناريو 15: «هات رقم إنجاز»: بيكتب بيانات الشخص، الكابتشا في النظام (غلط ثم صح)، ويقرا رقم الطلب ويقفل التبويب */
  const apOpen = async (payload) => {
    const n = await app.evaluate(() => window.apcaps.length);
    const [p] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_APPNO', data: d }, location.origin), payload)]);
    await p.waitForTimeout(1500); await p.reload().catch(async () => { await p.waitForTimeout(2000); await p.reload(); });
    await app.waitForFunction((k) => window.apcaps.length > k, n, { timeout: 40000 }); return p;
  };
  const apSubmit = (cap) => app.evaluate((c) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_APPNO_CTL', data: { op: 'submit', captcha: c } }, location.origin), cap);
  const ap1 = await apOpen({ personId: '7', name: 'بدر خليل', passportNo: 'a12345678', nationality: 'EGY', visaType: '13', embassy: '320' });
  const apc1 = await app.evaluate(() => window.apcaps[window.apcaps.length - 1]); assert.ok(String(apc1.image).startsWith('data:image/png') && !apc1.error && !(apc1.problems || []).length, 'كابتشا رقم إنجاز وصلت من غير مشاكل: ' + JSON.stringify(apc1.problems));
  assert.deepStrictEqual(await ap1.evaluate(() => ['PassportNumber', 'Nationality', 'VisaType', 'Embassy'].map((i) => document.getElementById(i).value)), ['A12345678', 'EGY', '13', '320'], 'بيانات الشخص اتكتبت في صفحة البحث');
  await apSubmit('000000'); await app.waitForFunction(() => window.apcaps.some((c) => c.error && /رمز الصورة/.test(c.message || '')), null, { timeout: 40000 });
  await apSubmit('123456'); await app.waitForFunction(() => window.apres.length > 0, null, { timeout: 40000 });
  const apr = await app.evaluate(() => window.apres[0]);
  assert.strictEqual(apr.appNumber, 'E100000001'); assert.strictEqual(apr.passportNo, 'A12345678'); assert.strictEqual(apr.docNumber, '1000000002'); assert.strictEqual(apr.issuedVisaNo, '1000000009'); assert.strictEqual(apr.personId, '7'); assert.strictEqual(apr.appDate, '2026/04/12');
  await ap1.waitForEvent('close', { timeout: 15000 }).catch(() => {}); assert.ok(ap1.isClosed(), 'تبويب المنصة اتقفل بعد رقم الطلب');
  /* مفيش طلب بالبيانات دي ← notFound من غير ما يتسجّل حاجة */
  const ap2 = await apOpen({ personId: '8', name: 'تجربة', passportNo: 'Z9999999', nationality: 'EGY', visaType: '38', embassy: '302' });
  await apSubmit('123456'); await app.waitForFunction(() => window.apres.length > 1, null, { timeout: 40000 });
  const apr2 = await app.evaluate(() => window.apres[1]); assert.ok(apr2.notFound === true && /لم يتم العثور/.test(apr2.message), 'مفيش طلب: ' + JSON.stringify(apr2));
  /* سيناريو 16: بعد «حفظ» رقم الطلب بييجي من غير E ← الإضافة بتحط E وتبعته لوحدها بالمطابقة بالجواز (حتى لو الصفحة مش من زرار النظام) */
  const gotBefore = await app.evaluate(() => window.got.length);
  const sp = await ctx.newPage(); await sp.goto('https://visa.mofa.gov.sa/SmartForm/PrintApplication/830068985');
  await app.waitForFunction((n) => window.got.length > n, gotBefore, { timeout: 30000 });
  const gr = await app.evaluate(() => window.got[window.got.length - 1]); assert.strictEqual(gr.appNumber, 'E830068985', 'اتحط E: ' + JSON.stringify(gr)); assert.strictEqual(gr.passportNo, 'A12345678'); assert.strictEqual(gr.status, 'submitted');
  /* سيناريو 17: طباعة ورقة النت برقم الطلب — بتفتح «إنجاز»، تكتب الرقم وتدوس «طباعة»، وتطبع الصفحة الأولى بس */
  const netOpen = async (appNo) => { const [p] = await Promise.all([ctx.waitForEvent('page'), app.evaluate((d) => window.postMessage({ source: 'nesr-visaapply', type: 'VA_NETPRINT', data: d }, location.origin), { appNo, name: 'شخص تجربة' })]); await p.waitForTimeout(1500); await p.reload().catch(() => {}); return p; };
  global.__netPost = '';
  const np1 = await netOpen('828935966'); await np1.waitForFunction(() => document.documentElement.dataset.vaNetPrinted === '1', null, { timeout: 25000 });
  assert.ok(/AppNo=828935966/.test(global.__netPost) && /PrintApplication=PrintApplication/.test(global.__netPost), 'كتب رقم الطلب في «إنجاز» ودوس طباعة: ' + global.__netPost);
  assert.ok((await np1.textContent('#nesr-net-bar')).includes('E828935966'), 'ورقة النت اتفتحت');
  await np1.emulateMedia({ media: 'print' });
  const pr = await np1.evaluate(() => { const r = document.getElementById('nesr-net-root'); const others = [...document.body.children].filter((x) => x !== r && getComputedStyle(x).display !== 'none').map((x) => x.className || x.id); return { root: !!r && getComputedStyle(r).display !== 'none', clipped: r && getComputedStyle(r).overflow === 'hidden', code: r && /E828935966/.test(r.textContent), others }; });
  assert.ok(pr.root && pr.clipped && pr.code && !pr.others.length, 'الطباعة: الورقة بس ومقصوصة على صفحة واحدة: ' + JSON.stringify(pr));
  await np1.close();
  /* رقم غلط: المنصة بترجّع «إنجاز» برسالة ← الإضافة بتقول بوضوح وما بتطبعش */
  const np3 = await netOpen('828000000'); await np3.waitForFunction(() => { const b = document.getElementById('nesr-net-bar'); return b && /ما فتحتش/.test(b.textContent); }, null, { timeout: 25000 });
  assert.ok(/لا يوجد طلب/.test(await np3.textContent('#nesr-net-bar')) && !(await np3.evaluate(() => document.documentElement.dataset.vaNetPrinted)), 'رسالة المنصة ظهرت');
  await np3.close();
  await wresTest();
  console.log('EXT E2E OK');
  await ctx.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
