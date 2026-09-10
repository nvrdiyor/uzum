#!/usr/bin/env node
/**
 * Birinchi ishga tushirish yordamchisi:
 *  • .env yaratadi (agar yo'q bo'lsa)
 *  • SESSION_SECRET va ENCRYPTION_KEY generatsiya qiladi
 *  • Prisma client'ni yaratib, bazani tayyorlaydi
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

const log = (m) => console.log(`[36m›[0m ${m}`);
const ok = (m) => console.log(`[32m✔[0m ${m}`);

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  ok('.env yaratildi (.env.example dan)');
} else {
  log('.env allaqachon mavjud — o‘zgartirilmadi');
}

let env = readFileSync(envPath, 'utf8');
let changed = false;

if (/^SESSION_SECRET=\s*$|SESSION_SECRET=change-me/m.test(env)) {
  env = env.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(32).toString('base64url')}`);
  changed = true;
}
if (/^ENCRYPTION_KEY=\s*$/m.test(env)) {
  env = env.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);
  changed = true;
}
if (changed) {
  writeFileSync(envPath, env, 'utf8');
  ok('Maxfiy kalitlar generatsiya qilindi');
}

try {
  log('Prisma client yaratilmoqda...');
  execSync('npm run db:generate', { cwd: root, stdio: 'inherit' });
  log('Baza sxemasi qo‘llanilmoqda...');
  execSync('npm run db:push', { cwd: root, stdio: 'inherit' });
  ok('Ma’lumotlar bazasi tayyor');
} catch {
  console.error('\n Baza tayyorlashda xatolik. DATABASE_URL ni tekshiring.\n');
  process.exit(1);
}

console.log(`
[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[0m
 SavdoIQ tayyor!

 1) Namunaviy ma'lumot bilan to'ldirish:   npm run db:seed
 2) Ishga tushirish:                        npm run dev
    • Sayt  → http://localhost:5173
    • API   → http://localhost:4000/api/v1

 Telegram bot uchun .env ichiga TELEGRAM_BOT_TOKEN yozing.
[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[0m
`);
