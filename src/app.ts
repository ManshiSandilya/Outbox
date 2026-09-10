import express from 'express';

import { attachTenant } from './middleware/tenant';
import { emailRouter } from './routes/emails';
import { authRouter } from './routes/auth';
import { slackRouter } from './routes/slack';
import { reconcileScheduledEmailsOnStartup } from './services/reconcile-scheduled-emails';

export const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './lib/email-queue';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/admin/queues', serverAdapter.getRouter());
app.use(attachTenant);
app.use('/api/auth', authRouter);
app.use('/api/emails', emailRouter);
app.use('/api/slack', slackRouter);

// A failed connection must be visible at boot; it must not silently leave jobs
// stranded. The process may be restarted by its supervisor after this failure.
void reconcileScheduledEmailsOnStartup().catch((error: unknown) => {
  console.error('Scheduled-email reconciliation failed during API startup', error);
  process.exitCode = 1;
});
