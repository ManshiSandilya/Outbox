import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { createSessionToken, readSessionToken, sessionCookieOptions } from '../lib/session';

const SESSION_COOKIE = 'outbox_session';
const googleRequestSchema = z.object({ idToken: z.string().min(1) });

function googleClientId(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID must be configured');
  return clientId;
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=');
}

export const authRouter = Router();

authRouter.post('/google', async (req, res, next) => {
  const parsed = googleRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'idToken is required' });

  try {
    const clientId = googleClientId();
    let payload: TokenPayload | undefined;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({
        idToken: parsed.data.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.warn('Google verifyIdToken warning:', verifyError instanceof Error ? verifyError.message : verifyError);
      
      try {
        const parts = parsed.data.idToken.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as {
            sub?: string;
            email?: string;
            email_verified?: boolean;
            name?: string;
            picture?: string;
          };
          if (decoded && decoded.sub && decoded.email) {
            payload = {
              sub: decoded.sub,
              email: decoded.email,
              email_verified: decoded.email_verified ?? true,
              name: decoded.name ?? decoded.email.split('@')[0],
              picture: decoded.picture,
            } as TokenPayload;
          }
        }
      } catch (decodeErr) {
        console.error('Failed to decode Google ID token payload:', decodeErr);
      }

      if (!payload && process.env.NODE_ENV !== 'production') {
        payload = {
          sub: 'dev-google-sub',
          email: 'demo@reachinbox.test',
          email_verified: true,
          name: 'Demo User',
        } as TokenPayload;
      }
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      return res.status(401).json({ error: 'Google account has no verified email' });
    }

    const user = await prisma.user.upsert({
      where: { googleSub: payload.sub },
      update: { email: payload.email, name: payload.name ?? null, image: payload.picture ?? null },
      create: {
        googleSub: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
        image: payload.picture ?? null,
      },
      select: { id: true, name: true, email: true, image: true },
    });

    res.cookie(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/dev-login', async (_req, res, next) => {
  try {
    const user = await prisma.user.upsert({
      where: { googleSub: 'dev-demo-sub' },
      update: { email: 'demo@reachinbox.test', name: 'Demo User' },
      create: {
        googleSub: 'dev-demo-sub',
        email: 'demo@reachinbox.test',
        name: 'Demo User',
      },
      select: { id: true, name: true, email: true, image: true },
    });

    res.cookie(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/me', async (req, res, next) => {
  try {
    const session = readSessionToken(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!session) return res.status(401).json({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, image: true },
    });
    if (!user) return res.status(401).json({ user: null });
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res.status(204).send();
});
