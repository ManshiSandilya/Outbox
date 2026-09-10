import { app } from './app';

if (process.env.RUN_WORKER !== 'false') {
  import('./workers/send-email')
    .then(() => console.log('[Server] Embedded BullMQ email worker started.'))
    .catch((err) => console.error('[Server] Embedded worker failed to start:', err));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Outbox API listening on port ${port}`));
