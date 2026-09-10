import { DelayedError, Worker, type Job } from 'bullmq';
import nodemailer from 'nodemailer';

import { emailQueue, redisConnection } from '../lib/email-queue';
import { prisma } from '../lib/prisma';
import { indexEmail } from '../services/email-search';
import { reconcileScheduledEmailsOnStartup } from '../services/reconcile-scheduled-emails';
import { notifySlack } from '../services/slack';

type SendEmailJob = { emailId: string };

const maxEmailsPerHour = Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? 100);
const workerConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

if (!Number.isInteger(maxEmailsPerHour) || maxEmailsPerHour < 1) {
  throw new Error('MAX_EMAILS_PER_HOUR_PER_SENDER must be a positive integer');
}

if (!Number.isInteger(workerConcurrency) || workerConcurrency < 1) {
  throw new Error('WORKER_CONCURRENCY must be a positive integer');
}

function hourBucket(date: Date): string {
  return date.toISOString().slice(0, 13);
}

function nextHourWindow(now: Date): number {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime();
}

async function reserveHourlySend(senderId: string): Promise<number> {
  const redis = await emailQueue.client;
  const key = `ratelimit:${senderId}:${hourBucket(new Date())}`;
  const count = await redis.incr(key);

  // Only the request that creates an hour bucket establishes its expiration.
  if (count === 1) {
    await redis.expire(key, 60 * 60);
  }

  return count;
}

async function processSendEmail(
  job: Job<SendEmailJob>,
  token?: string,
): Promise<{ skipped?: boolean; sent?: boolean }> {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true },
  });

  if (!email || email.status === 'SENT') {
    return { skipped: true };
  }

  const hourlyCount = await reserveHourlySend(email.senderId);
  if (hourlyCount > maxEmailsPerHour) {
    const deferredUntil = nextHourWindow(new Date()) + email.sequence;

    await notifySlack(
      email.sender.tenantId,
      `Email rate limit reached for sender ${email.sender.email}: ${maxEmailsPerHour} per hour.`,
    );

    // The active job already owns this deterministic jobId, so re-adding it
    // would be ignored by BullMQ. Moving the same locked job preserves its
    // idempotency key and delays it without marking it failed.
    await job.moveToDelayed(deferredUntil, token);
    throw new DelayedError();
  }

  try {
    const transporter = nodemailer.createTransport({
      host: email.sender.smtpHost,
      port: email.sender.smtpPort,
      secure: email.sender.smtpSecure,
      auth: {
        user: email.sender.smtpUsername,
        // Credentials must be decrypted before storage/read in production.
        pass: email.sender.smtpPasswordEncrypted,
      },
    });

    await transporter.sendMail({
      from: email.sender.displayName
        ? `${email.sender.displayName} <${email.sender.email}>`
        : email.sender.email,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
    });

    const sentEmail = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'SENT', sentTime: new Date(), failureReason: null },
      include: { sender: true },
    });
    await indexEmail(sentEmail);

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    const failedEmail = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'FAILED', failureReason: message, sentTime: null },
      include: { sender: true },
    });
    await indexEmail(failedEmail);
    throw error;
  }
}

export const sendEmailWorker = new Worker<SendEmailJob>(
  'email-scheduler',
  processSendEmail,
  { connection: redisConnection, concurrency: workerConcurrency },
);

void reconcileScheduledEmailsOnStartup().catch((error: unknown) => {
  console.error('Scheduled-email reconciliation failed during worker startup', error);
  process.exitCode = 1;
});
