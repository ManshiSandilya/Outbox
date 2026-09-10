import express from 'express';

import { attachTenant } from './middleware/tenant';
import { emailRouter } from './routes/emails';

export const app = express();

app.use(express.json());
app.use(attachTenant);
app.use('/api/emails', emailRouter);
