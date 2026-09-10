import { EmailStatus } from '@prisma/client';

import { emailQueue } from '../lib/email-queue';
import { prisma } from '../lib/prisma';

let startupReconciliation: Promise<void> | undefined;

/**
 * Restores only scheduled database records that have no job in Redis. It does
 * not alter sent/failed rows and never adds a second job for an existing ID.
 */
export async function reconcileScheduledEmails(): Promise<void> {
  const scheduledEmails = await prisma.email.findMany({
    where: { status: EmailStatus.SCHEDULED },
    select: {
      id: true,
      idempotencyKey: true,
      scheduledTime: true,
    },
  });

  await Promise.all(
    scheduledEmails.map(async (email) => {
      const jobId = email.idempotencyKey.replace(/:/g, '_');
      const existingJob = await emailQueue.getJob(jobId);
      if (existingJob) {
        return;
      }

      await emailQueue.add(
        'send-email',
        { emailId: email.id },
        {
          jobId,
          delay: Math.max(0, email.scheduledTime.getTime() - Date.now()),
        },
      );

    }),
  );
}

/** Runs reconciliation at most once in each booted Node.js process. */
export function reconcileScheduledEmailsOnStartup(): Promise<void> {
  startupReconciliation ??= reconcileScheduledEmails();
  return startupReconciliation;
}
