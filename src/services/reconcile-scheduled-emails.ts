import { EmailStatus } from '@prisma/client';

import { emailQueue } from '../lib/email-queue';
import { prisma } from '../lib/prisma';

let startupReconciliation: Promise<void> | undefined;

/**
 * Restores only scheduled database records that have no job in Redis. It does
 * not alter sent/failed rows and never adds a second job for an existing ID.
 */
export async function reconcileScheduledEmails(): Promise<void> {
  console.log('[Reconciliation] Executing reconcileScheduledEmailsOnStartup() on boot...');
  const scheduledEmails = await prisma.email.findMany({
    where: { status: EmailStatus.SCHEDULED },
    select: {
      id: true,
      idempotencyKey: true,
      scheduledTime: true,
    },
  });

  console.log(`[Reconciliation] Found ${scheduledEmails.length} scheduled email(s) in DB to reconcile.`);

  await Promise.all(
    scheduledEmails.map(async (email) => {
      try {
        const jobId = email.idempotencyKey ? email.idempotencyKey.replace(/:/g, '_') : email.id;
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
        console.log(`[Reconciliation] Re-enqueued job ${jobId} for email ${email.id}`);
      } catch (err) {
        console.warn(`Failed to reconcile email ${email.id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );

  console.log('[Reconciliation] Startup reconciliation complete.');
}

/** Runs reconciliation at most once in each booted Node.js process. */
export function reconcileScheduledEmailsOnStartup(): Promise<void> {
  startupReconciliation ??= reconcileScheduledEmails();
  return startupReconciliation;
}
