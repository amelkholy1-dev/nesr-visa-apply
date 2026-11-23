'use strict';
/* بيشغّل الاختبارات: mrz/names (من غير قاعدة) · API (محتاج MySQL) · واجهة وإضافة (محتاجين Chromium + playwright) */
const { spawnSync } = require('child_process');
const path = require('path');
const run = (f) => { console.log('\n▶', f); const r = spawnSync('node', [path.join(__dirname, f)], { stdio: 'inherit' }); return r.status === 0; };
let ok = run('mrz-names.test.js');
ok = run('fields.test.js') && ok;
if (process.env.TEST_DB_NAME || process.env.RUN_DB) ok = run('api.test.js') && ok;
if (process.env.TEST_DB_NAME || process.env.RUN_DB) ok = run('gemini-mock.test.js') && ok;
if (process.env.RUN_BROWSER) { ok = run('ui-e2e.js') && ok; ok = run('ext-e2e.js') && ok; }
process.exit(ok ? 0 : 1);
