/**
 * Manual recovery check (requires a running PostgreSQL, Redis, and valid
 * Ethereal credentials on an active seeded sender):
 *
 * 1. Run: npx tsx scripts/manual-reconciliation-test.ts seed
 * 2. Start the send-email worker; after the first email is sent, stop it.
 * 3. Start the worker again. Its startup reconciliation restores missing jobs.
 * 4. Run: npx tsx scripts/manual-reconciliation-test.ts verify <campaign-id>
 */
import { randomUUID } from 'node:crypto';
import { EmailStatus } from '@prisma/client';

import { emailQueue } from '../src/lib/email-queue';
import { prisma } from '../src/lib/prisma';
import { reconcileScheduledEmails } from '../src/services/reconcile-scheduled-emails';

const command = process.argv[2];

async function seed(): Promise<void> {
  const sender = await prisma.sender.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  if (!sender) {
    throw new Error('No active sender exists. Run the seed and configure Ethereal SMTP credentials first.');
  }

  const campaignId = `manual-reconcile-${randomUUID()}`;
  const startTime = Date.now() + 5_000;
  const recipients = ['recovery-one@example.test', 'recovery-two@example.test', 'recovery-three@example.test'];

  const emails = await prisma.$transaction(
    recipients.map((recipient, sequence) =>
      prisma.email.create({
        data: {
          recipient,
          subject: 'Manual reconciliation check',
          body: 'This email verifies recovery after a worker restart.',
          senderId: sender.id,
          campaignId,
          sequence,
          scheduledTime: new Date(startTime + sequence * 30_000),
          status: EmailStatus.SCHEDULED,
          idempotencyKey: `${recipient}:${campaignId}`,
        },
      }),
    ),
  );

  await Promise.all(
    emails.map((email) =>
      emailQueue.add('send-email', { emailId: email.id }, {
        jobId: email.idempotencyKey,
        delay: Math.max(0, email.scheduledTime.getTime() - Date.now()),
      }),
    ),
  );

  console.log(`Created campaign ${campaignId}. Stop the worker after its first send, then restart it.`);
}

async function verify(campaignId: string | undefined): Promise<void> {
  if (!campaignId) {
    throw new Error('Pass the campaign ID printed by the seed command.');
  }

  // Explicitly invokes the same routine used at boot, allowing the check to be
  // run without waiting for a process manager restart during manual testing.
  await reconcileScheduledEmails();
  const emails = await prisma.email.findMany({ where: { campaignId } });

  if (emails.length !== 3) {
    throw new Error(`Expected exactly 3 email rows, found ${emails.length}.`);
  }
  if (emails.some((email) => email.status !== EmailStatus.SENT)) {
    throw new Error('Not all emails are sent yet. Wait for the restarted worker and retry.');
  }

  const jobs = await Promise.all(emails.map((email) => emailQueue.getJob(email.idempotencyKey)));
  if (jobs.some((job) => !job)) {
    throw new Error('A job unexpectedly disappeared before verification.');
  }

  console.log('Pass: exactly 3 rows were sent and each has one deterministic BullMQ job ID.');
}

async function main(): Promise<void> {
  if (command === 'seed') {
    await seed();
  } else if (command === 'verify') {
    await verify(process.argv[3]);
  } else {
    throw new Error('Usage: manual-reconciliation-test.ts <seed|verify> [campaign-id]');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), emailQueue.close()]);
  });
