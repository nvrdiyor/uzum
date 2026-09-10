#!/usr/bin/env node
/**
 * Prisma provider'ni almashtirish: sqlite ↔ postgresql
 * Foydalanish: node scripts/switch-db.mjs postgresql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../packages/db/prisma/schema.prisma');

const target = (process.argv[2] ?? '').toLowerCase();
if (!['sqlite', 'postgresql'].includes(target)) {
  console.error('Foydalanish: node scripts/switch-db.mjs <sqlite|postgresql>');
  process.exit(1);
}

const src = readFileSync(schemaPath, 'utf8');
const next = src.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${target}"`);

if (src === next) {
  console.log(`Provider allaqachon "${target}".`);
} else {
  writeFileSync(schemaPath, next, 'utf8');
  console.log(`✔ Prisma provider → ${target}`);
}

console.log(
  target === 'postgresql'
    ? '\nKeyingi qadam:\n  1) .env ichida DATABASE_URL="postgresql://..." ni ko‘rsating\n  2) npm run db:generate && npm run db:push\n'
    : '\nKeyingi qadam:\n  1) .env ichida DATABASE_URL="file:./dev.db"\n  2) npm run db:generate && npm run db:push\n',
);
