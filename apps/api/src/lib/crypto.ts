import crypto from 'node:crypto';
import { env } from '../env.js';

const ALGO = 'aes-256-gcm';

function keyBuffer(): Buffer {
  const hex = env.encryptionKey;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  // Dev uchun: session secret'dan barqaror kalit hosil qilamiz
  return crypto.createHash('sha256').update(`savdoiq:${env.sessionSecret}`).digest();
}

/** API kalitlarni shifrlash (AES-256-GCM). Format: v1.iv.tag.ciphertext (base64url) */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Shifrlangan qiymat formati noto‘g‘ri');
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(), Buffer.from(ivB64!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64url')), decipher.final()]);
  return dec.toString('utf8');
}

export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.sessionSecret).update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Botdagi kod: 6 raqamli, o'qish uchun qulay */
export function randomCode(len = 6): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) out += digits[crypto.randomInt(0, digits.length)];
  return out;
}

export function randomReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

export function maskKey(key: string): string {
  if (key.length <= 6) return '••••';
  return `••••${key.slice(-4)}`;
}

/**
 * Telegram Login Widget imzosini tekshirish.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(
  data: Record<string, unknown>,
  botToken: string,
  maxAgeSeconds = 86_400,
): { ok: boolean; reason?: string } {
  if (!botToken) return { ok: false, reason: 'bot_token_missing' };
  const { hash, ...rest } = data as Record<string, string>;
  if (!hash) return { ok: false, reason: 'hash_missing' };

  const checkString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null && k !== 'ref')
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  const a = Buffer.from(hmac, 'hex');
  const b = Buffer.from(String(hash), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(rest.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'bad_auth_date' };
  if (Date.now() / 1000 - authDate > maxAgeSeconds) return { ok: false, reason: 'expired' };

  return { ok: true };
}

/**
 * Telegram Mini App initData imzosini tekshirish.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
): { ok: boolean; user?: Record<string, unknown>; reason?: string } {
  if (!botToken) return { ok: false, reason: 'bot_token_missing' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'hash_missing' };
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (hmac !== hash) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSeconds)
    return { ok: false, reason: 'expired' };

  const rawUser = params.get('user');
  return { ok: true, user: rawUser ? (JSON.parse(rawUser) as Record<string, unknown>) : undefined };
}
