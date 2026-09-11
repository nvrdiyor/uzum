/**
 * Uzum API'ning XOM javobini ko'rish (mapping'ni aniqlash uchun).
 *
 *   npx tsx apps/api/src/scripts/uzum-raw.ts <companyId> <yo'l> [param=qiymat ...]
 *
 * Masalan:
 *   npx tsx apps/api/src/scripts/uzum-raw.ts CID /v1/finance/orders shopIds=130436 dateFrom=... size=5
 */
import { prisma } from '@savdoiq/db';
import { decryptSecret } from '../lib/crypto.js';
import { env } from '../env.js';

function trim(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.slice(0, Number(process.env.RAW_LIMIT ?? 2)).map((v) => trim(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = trim(v, depth + 1);
    return out;
  }
  return value;
}

async function main(): Promise<void> {
  const [companyId, path, ...rest] = process.argv.slice(2);
  if (!companyId || !path) {
    console.error('Foydalanish: uzum-raw.ts <companyId> <yo‘l> [param=qiymat ...]');
    process.exitCode = 1;
    return;
  }

  const account = await prisma.uzumAccount.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  if (!account) {
    console.error('Kabinet topilmadi');
    process.exitCode = 1;
    return;
  }

  const apiKey = decryptSecret(account.apiKeyEnc).trim().replace(/^Bearer\s+/i, '');

  const qs = new URLSearchParams();
  for (const pair of rest) {
    const i = pair.indexOf('=');
    if (i > 0) qs.append(pair.slice(0, i), pair.slice(i + 1));
  }

  const base = env.uzum.baseUrl.replace(/\/+$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}${qs.toString() ? `?${qs}` : ''}`;
  console.log(`GET ${url}\n`);

  const res = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' } });
  const text = await res.text();
  console.log(`status: ${res.status}\n`);

  try {
    const json: unknown = JSON.parse(text);
    console.log(JSON.stringify(trim(json), null, 1).slice(0, 6000));
  } catch {
    console.log(text.slice(0, 2000));
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
