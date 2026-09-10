import { Queue } from 'bullmq';

export const redisConnection = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const emailQueue = new Queue('email-scheduler', {
  connection: redisConnection,
});
