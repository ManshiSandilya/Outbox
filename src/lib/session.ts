import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = { sub: string; exp: number };

function requiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be configured');
  return secret;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', requiredJwtSecret()).update(value).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, exp: Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function readSessionToken(token: string | undefined): SessionPayload | undefined {
  if (!token) return undefined;
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return undefined;
  const expected = sign(`${header}.${payload}`);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    return typeof parsed.sub === 'string' && parsed.exp > Math.floor(Date.now() / 1_000) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  sameSite: (process.env.NODE_ENV === 'production' || process.env.COOKIE_SAME_SITE === 'none' ? 'none' : 'lax') as const,
  maxAge: SESSION_TTL_SECONDS * 1_000,
  path: '/',
};
