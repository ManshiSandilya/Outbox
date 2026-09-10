import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { EmailStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';

const MAX_RECIPIENTS_PER_REQUEST = 1_000;

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
      select: { id: true },
    });

    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const campaignId = randomUUID();

    // Task 3 will replace this base timestamp with the final rate-limit-aware
    // staggered schedule. This task intentionally only persists the request.
    const scheduledTime = body.startTime;
    const createdRows = await prisma.$transaction(
      body.recipients.map((recipient) =>
        prisma.email.create({
          data: {
            recipient,
            subject: body.subject,
            body: body.body,
            scheduledTime,
            status: EmailStatus.SCHEDULED,
            senderId: sender.id,
            campaignId,
            idempotencyKey: `${recipient}:${campaignId}`,
          },
        }),
      ),
    );

    return res.status(201).json({
      campaignId,
      emails: createdRows,
    });
  } catch (error) {
    return next(error);
  }
});
