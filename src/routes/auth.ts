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
    } catch {
      return res.status(401).json({ error: 'Invalid Google ID token' });
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
