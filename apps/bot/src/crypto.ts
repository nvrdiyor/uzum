/**
 * Shifrlash — apps/api/src/lib/crypto.ts BILAN AYNAN BIR XIL.
 * Algoritm (AES-256-GCM), kalit hosil qilish va format (`v1.iv.tag.ciphertext`, base64url)
 * o'zgartirilmasligi kerak: bot shifrlagan kalitni API deshifrlay olishi SHART.
 */
import crypto from 'node:crypto';
import { env } from './lib/env.js';

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

/** Kalitning oxirgi 4 belgisi — ko'rsatish uchun */
export function maskKey(key: string): string {
  if (key.length <= 6) return '••••';
  return `••••${key.slice(-4)}`;
}
