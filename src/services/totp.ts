import { generateSync } from 'otplib';
import type { Account, AccountDraft } from '../types/account';

export function normalizeSecret(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function validateSecret(value: string): boolean {
  const secret = normalizeSecret(value);
  return secret.length >= 16 && /^[A-Z2-7]+=*$/.test(secret);
}

export function generateOtp(account: Account, secret: string): string {
  return generateSync({
    secret: normalizeSecret(secret),
    algorithm: account.algorithm,
    digits: account.digits,
    period: account.period,
  });
}

export function getTimeState(period: number, now = Date.now()): {
  remaining: number;
  progress: number;
} {
  const elapsed = Math.floor(now / 1000) % period;
  const remaining = period - elapsed;
  return { remaining, progress: remaining / period };
}

export function parseOtpAuthUri(uri: string): AccountDraft {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'otpauth:' || parsed.hostname !== 'totp') {
    throw new Error('Only TOTP provisioning QR codes are supported.');
  }

  const secret = parsed.searchParams.get('secret') ?? '';
  if (!validateSecret(secret)) {
    throw new Error('The QR code does not contain a valid secret.');
  }

  const label = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const issuer = parsed.searchParams.get('issuer') || label.split(':')[0] || 'Unknown issuer';
  const accountName = label.includes(':') ? label.slice(label.indexOf(':') + 1) : label;
  const algorithm = (parsed.searchParams.get('algorithm') || 'SHA1').toLowerCase() as Account['algorithm'];
  const digits = Number(parsed.searchParams.get('digits') || 6) as Account['digits'];
  const period = Number(parsed.searchParams.get('period') || 30);

  if (!['sha1', 'sha256', 'sha512'].includes(algorithm)) {
    throw new Error('This QR code uses an unsupported algorithm.');
  }
  if (![6, 8].includes(digits) || !Number.isInteger(period) || period < 1 || period > 3600) {
    throw new Error('This QR code contains unsupported OTP settings.');
  }

  return { issuer, accountName, algorithm, digits, period, secret: normalizeSecret(secret) };
}
