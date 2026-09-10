import { emailQueue } from '../src/lib/email-queue';

async function clearDelayedQueue() {
  console.log('Promoting delayed jobs in BullMQ...');
  const delayedJobs = await emailQueue.getDelayed();
  console.log(`Found ${delayedJobs.length} delayed jobs in BullMQ.`);

  for (const job of delayedJobs) {
    try {
      await job.promote();
      console.log(`Promoted job ${job.id} for email ${job.data.emailId}`);
    } catch (err) {
      console.warn(`Failed to promote job ${job.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('Finished promoting delayed jobs.');
}

clearDelayedQueue()
  .catch(console.error)
  .finally(() => process.exit(0));
