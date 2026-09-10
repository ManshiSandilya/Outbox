import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Router } from 'express';

import { prisma } from '../lib/prisma';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const STATE_TTL_MS = 10 * 60 * 1_000;

type SlackState = {
  tenantId: string;
  issuedAt: number;
  nonce: string;
};

type SlackOAuthResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  incoming_webhook?: {
    url?: string;
    channel_id?: string;
  };
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

function stateSignature(payload: string): string {
  return createHmac('sha256', requiredEnv('SLACK_OAUTH_STATE_SECRET'))
    .update(payload)
    .digest('base64url');
}

function createState(tenantId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ tenantId, issuedAt: Date.now(), nonce: randomBytes(16).toString('base64url') }),
  ).toString('base64url');
  return `${payload}.${stateSignature(payload)}`;
}

function readState(state: string): SlackState | undefined {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) {
    return undefined;
  }

  const expected = stateSignature(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SlackState;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.tenantId);
    if (!isUuid || !Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > STATE_TTL_MS) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export const slackRouter = Router();

const install: RequestHandler = (req, res, next) => {
  try {
    const params = new URLSearchParams({
      client_id: requiredEnv('SLACK_CLIENT_ID'),
      redirect_uri: requiredEnv('SLACK_REDIRECT_URI'),
      scope: 'incoming-webhook',
      state: createState(req.tenantId),
    });
    return res.redirect(`${SLACK_AUTHORIZE_URL}?${params.toString()}`);
  } catch (error) {
    return next(error);
  }
};

slackRouter.get('/install', install);

slackRouter.get('/callback', async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const installationError = typeof req.query.error === 'string' ? req.query.error : undefined;
    const verifiedState = state ? readState(state) : undefined;

    if (installationError || !code || !verifiedState) {
      return res.status(400).json({ error: installationError ?? 'Invalid Slack OAuth callback' });
    }

    const tokenResponse = await fetch(SLACK_ACCESS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: requiredEnv('SLACK_CLIENT_ID'),
        client_secret: requiredEnv('SLACK_CLIENT_SECRET'),
        redirect_uri: requiredEnv('SLACK_REDIRECT_URI'),
      }),
    });
    const token = (await tokenResponse.json()) as SlackOAuthResponse;

    if (!tokenResponse.ok || !token.ok || !token.access_token) {
      return res.status(502).json({ error: token.error ?? 'Slack token exchange failed' });
    }

    const tenant = await prisma.tenant.update({
      where: { id: verifiedState.tenantId },
      data: {
        slackAccessToken: token.access_token,
        slackWebhookUrl: token.incoming_webhook?.url ?? null,
        slackChannelId: token.incoming_webhook?.channel_id ?? null,
      },
      select: { id: true },
    });

    return res.status(200).json({ tenantId: tenant.id, installed: true });
  } catch (error) {
    return next(error);
  }
});
