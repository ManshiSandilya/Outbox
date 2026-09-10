import Redis from 'ioredis';
import { emailQueue } from '../src/lib/email-queue';

async function resetRateLimitAndFlush() {
  const redis = new Redis({ host: '127.0.0.1', port: 6379 });
  const keys = await redis.keys('ratelimit:*');
  console.log(`Clearing ${keys.length} rate limit keys in Redis...`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await redis.quit();

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

  console.log('Done resetting rate limit and promoting jobs!');
}

resetRateLimitAndFlush()
  .catch(console.error)
  .finally(() => process.exit(0));
