import express from 'express';

import { attachTenant } from './middleware/tenant';
import { emailRouter } from './routes/emails';
import { reconcileScheduledEmailsOnStartup } from './services/reconcile-scheduled-emails';

export const app = express();

app.use(express.json());
app.use(attachTenant);
app.use('/api/emails', emailRouter);

// A failed connection must be visible at boot; it must not silently leave jobs
// stranded. The process may be restarted by its supervisor after this failure.
void reconcileScheduledEmailsOnStartup().catch((error: unknown) => {
  console.error('Scheduled-email reconciliation failed during API startup', error);
  process.exitCode = 1;
});
