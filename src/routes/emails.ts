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
  senderId: z.string().uuid(),
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
  delayBetweenMs: z.number().int().min(0),
  hourlyLimit: z.number().int().positive(),
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
      orderBy: parsed.data.status === 'scheduled' ? { scheduledTime: 'asc' } : { sentTime: 'desc' },
      select: { recipient: true, subject: true, scheduledTime: true, sentTime: true, status: true },
    });

    return res.status(200).json({
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
    // Filtering by tenant prevents one tenant from scheduling through another
    // tenant's SMTP sender and deliberately returns the same 404 response.
    const sender = await prisma.sender.findFirst({
      where: { id: body.senderId, tenantId: req.tenantId },
      select: { id: true, email: true, displayName: true },
    });

    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const campaignId = randomUUID();

    const createdRows = await prisma.$transaction(
      body.recipients.map((recipient, index) =>
        prisma.email.create({
          data: {
            recipient,
            subject: body.subject,
            body: body.body,
            scheduledTime: new Date(
              body.startTime.getTime() + index * body.delayBetweenMs,
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

        return emailQueue.add(
          'send-email',
          { emailId: email.id },
          {
            // BullMQ de-duplicates a queue job with the same ID while it exists.
            // Using the database idempotency key makes re-enqueue attempts target
            // the same logical email rather than creating a second send job.
            jobId: email.idempotencyKey,
            delay: Math.max(0, sendAt - now),
          },
        );
      }),
    );

    return res.status(201).json({
      campaignId,
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
