import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { EmailStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { emailQueue } from '../lib/email-queue';
import { indexEmail, searchEmails } from '../services/email-search';

const MAX_RECIPIENTS_PER_REQUEST = 1_000;
const emailListQuerySchema = z.object({
  status: z.enum(['scheduled', 'sent|failed']),
});

export const scheduleEmailSchema = z.object({
  senderId: z.string().trim().optional(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1),
  recipients: z
    .array(z.string().trim().toLowerCase().email())
    .min(1)
    .max(MAX_RECIPIENTS_PER_REQUEST)
    .refine((recipients) => new Set(recipients).size === recipients.length, {
      message: 'recipients must not contain duplicate email addresses',
    }),
  startTime: z.coerce.date(),
  delayBetweenMs: z.coerce.number().optional(),
  delayBetweenEmails: z.coerce.number().optional(),
  hourlyLimit: z.coerce.number().optional(),
});

export const emailRouter = Router();

emailRouter.get('/', async (req, res, next) => {
  const parsed = emailListQuerySchema.safeParse({ status: req.query.status });
  if (!parsed.success) {
    return res.status(400).json({ error: 'status must be scheduled or sent|failed' });
  }

  try {
    const statuses = parsed.data.status === 'scheduled' ? [EmailStatus.SCHEDULED] : [EmailStatus.SENT, EmailStatus.FAILED];
    const emails = await prisma.email.findMany({
      where: { sender: { tenantId: req.tenantId }, status: { in: statuses } },
      orderBy: parsed.data.status === 'scheduled' ? { scheduledTime: 'asc' } : { updatedAt: 'desc' },

      select: { recipient: true, subject: true, scheduledTime: true, sentTime: true, status: true },
    });

    return res.json({
      emails: emails.map((email) => ({
        email: email.recipient,
        subject: email.subject,
        scheduled_time: email.scheduledTime.toISOString(),
        sent_time: email.sentTime?.toISOString() ?? null,
        status: email.status.toLowerCase(),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

emailRouter.post('/schedule', async (req, res, next) => {
  const parsed = scheduleEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid schedule request',
      details: parsed.error.flatten(),
    });
  }

  const body = parsed.data;

  try {
    const targetSenderId = body.senderId || process.env.SEED_SENDER_EMAIL || 'sender@example.test';
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSenderId);

    let sender = await prisma.sender.findFirst({
      where: {
        tenantId: req.tenantId,
        ...(isUuid
          ? { OR: [{ id: targetSenderId }, { email: targetSenderId.toLowerCase() }] }
          : { email: targetSenderId.toLowerCase() }),
      },
      select: { id: true, email: true, displayName: true },
    });

    if (!sender) {
      sender = await prisma.sender.create({
        data: {
          tenantId: req.tenantId,
          email: targetSenderId.includes('@') ? targetSenderId.toLowerCase() : 'sender@example.test',
          displayName: targetSenderId.includes('@') ? targetSenderId.split('@')[0] : 'Default Sender',
          smtpHost: process.env.SEED_SMTP_HOST ?? 'smtp.ethereal.email',
          smtpPort: Number(process.env.SEED_SMTP_PORT ?? 587),
          smtpUsername: process.env.SEED_SMTP_USERNAME ?? 'replace-me',
          smtpPasswordEncrypted: process.env.SEED_SMTP_PASSWORD_ENCRYPTED ?? 'replace-me',
          smtpSecure: false,
        },
        select: { id: true, email: true, displayName: true },
      });
    }

    const idempotencyHeader = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
    const campaignId = idempotencyHeader ? `idem-${idempotencyHeader}` : randomUUID();

    // Idempotency check: return existing records if already processed with this key
    if (idempotencyHeader) {
      const existing = await prisma.email.findMany({
        where: { campaignId },
      });
      if (existing.length > 0) {
        return res.status(200).json({
          campaignId,
          jobIds: existing.map((e) => e.id),
          emails: existing,
        });
      }
    }

    const delayMs = body.delayBetweenMs ?? (body.delayBetweenEmails ? body.delayBetweenEmails * 1000 : 1000);

    const createdRows = await prisma.$transaction(
      body.recipients.map((recipient, index) =>
        prisma.email.create({
          data: {
            recipient,
            subject: body.subject,
            body: body.body,
            scheduledTime: new Date(
              body.startTime.getTime() + index * delayMs,
            ),
            status: EmailStatus.SCHEDULED,
            senderId: sender.id,
            campaignId,
            sequence: index,
            idempotencyKey: `${recipient}:${campaignId}`,
          },
        }),
      ),
    );

    await Promise.all(
      createdRows.map((email) => indexEmail({ ...email, sender })),
    );

    const now = Date.now();
    await Promise.all(
      createdRows.map((email) => {
        const sendAt = email.scheduledTime.getTime();

        return Promise.race([
          emailQueue.add(
            'send-email',
            { emailId: email.id },
            {
              jobId: email.idempotencyKey,
              delay: Math.max(0, sendAt - now),
            },
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis connection timeout')), 1500),
          ),
        ]).catch((queueError) => {
          console.warn(
            'BullMQ queue enqueue deferred/warning:',
            queueError instanceof Error ? queueError.message : queueError,
          );
        });
      }),
    );

    return res.status(201).json({
      campaignId,
      jobIds: createdRows.map((e) => e.id),
      emails: createdRows,
    });
  } catch (error) {
    return next(error);
  }
});

emailRouter.get('/search', async (req, res, next) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 500) {
    return res.status(400).json({ error: 'q is required and must be at most 500 characters' });
  }

  try {
    return res.status(200).json({ emails: await searchEmails(q) });
  } catch (error) {
    return next(error);
  }
});
