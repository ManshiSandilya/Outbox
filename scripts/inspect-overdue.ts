import { EmailStatus, PrismaClient } from '@prisma/client';
import { emailQueue } from '../src/lib/email-queue';

const prisma = new PrismaClient();

async function inspectOverdueScheduledEmails() {
  const overdue = await prisma.email.findMany({
    where: {
      status: EmailStatus.SCHEDULED,
      scheduledTime: { lte: new Date() },
    },
    select: {
      id: true,
      recipient: true,
      subject: true,
      scheduledTime: true,
      idempotencyKey: true,
    },
  });

  console.log(`Found ${overdue.length} overdue SCHEDULED emails in database:`);

  for (const email of overdue) {
    const jobId = email.idempotencyKey.replace(/:/g, '_');
    const job = await emailQueue.getJob(jobId);
    console.log(`Email ID: ${email.id} | Recipient: ${email.recipient} | Scheduled: ${email.scheduledTime.toISOString()}`);
    if (job) {
      const state = await job.getState();
      console.log(`  -> Redis Job state: ${state} | delayedReason: ${job.failedReason || 'none'}`);
    } else {
      console.log(`  -> No Redis job found with jobId: ${jobId}`);
    }
  }
}

inspectOverdueScheduledEmails()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
