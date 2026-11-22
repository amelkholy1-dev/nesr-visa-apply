'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');
const auth = require('./auth');

let pool = null;
let ready = false;
let lastError = '';

const isReady = () => ready;
const status = () => ({ ready, error: lastError });

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL UNIQUE,
    display_name VARCHAR(120) NOT NULL DEFAULT '',
    pass_hash VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'user',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    data LONGTEXT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS people (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profile_id INT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    name_ar VARCHAR(255) NOT NULL DEFAULT '',
    passport_no VARCHAR(30) NOT NULL DEFAULT '',
    data LONGTEXT NULL,
    passport_image VARCHAR(255) NULL,
    personal_photo VARCHAR(255) NULL,
    app_number VARCHAR(40) NULL,
    filled_at DATETIME NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY ix_people_status (status), KEY ix_people_passport (passport_no), KEY ix_people_profile (profile_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

async function init() {
  if (!config.db.database || !config.db.user) throw new Error('إعدادات قاعدة البيانات ناقصة (DB_NAME / DB_USER / DB_PASSWORD)');
  if (!pool) {
    pool = mysql.createPool({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database,
      waitForConnections: true, connectionLimit: 8, charset: 'utf8mb4', timezone: 'local' });
  }
  await pool.query('SELECT 1');
  for (const t of TABLES) await pool.query(t);
  const n = (await query('SELECT COUNT(*) AS n FROM users'))[0].n;
  if (!n) {
    const pass = config.adminPassword;
    if (!pass) throw new Error('مفيش مستخدمين لسه: اظبط ADMIN_PASSWORD في Environment variables عشان يتعمل أول مدير');
    await query('INSERT INTO users (username, display_name, pass_hash, role) VALUES (?, ?, ?, ?)', [config.adminUser, 'المدير', await auth.hashPassword(pass), 'admin']);
    console.log(`✅ اتعمل أول مدير: ${config.adminUser}`);
  }
  ready = true; lastError = '';
}

/* بنحاول لحد ما القاعدة تشتغل (الاستضافة ساعات بتتأخر) من غير ما نوقّف السيرفر */
async function initWithRetry() {
  for (let i = 0; i < 40; i++) {
    try { await init(); console.log('✅ القاعدة جاهزة'); return; }
    catch (e) { lastError = e.message; console.error('⚠ القاعدة لسه مش جاهزة:', e.message); await new Promise(r => setTimeout(r, Math.min(15000, 2000 + i * 1000))); }
  }
}

module.exports = { query, initWithRetry, init, isReady, status, get pool() { return pool; } };
