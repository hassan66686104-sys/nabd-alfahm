// يُنشئ قاعدة بيانات اختبار نظيفة، يطبق محاكاة Supabase ثم الترحيلات، ثم يشغّل الاختبارات.
// الاستخدام: PGURL=postgres://postgres@localhost:54329 npm run test:db
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.PGURL ?? 'postgres://postgres@localhost:54329';
const db = 'nabd_test';
const psql = (args) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
psql([`${base}/postgres`, '-c', `drop database if exists ${db} with (force)`, '-c', `create database ${db}`]);
const files = [
  'tests/db/supabase-shim.sql',
  'tests/db/auth-min.sql',
  ...readdirSync('supabase/migrations').sort().map((f) => join('supabase/migrations', f)),
];
for (const f of files) psql([`${base}/${db}`, '-f', f]);
execFileSync(process.execPath, ['--test', 'tests/db/db.test.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: `${base}/${db}` },
});
