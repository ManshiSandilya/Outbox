# Outbox — Production-Grade Email Job Scheduler

A robust, production-grade distributed email job scheduler built with TypeScript, Express, BullMQ, Redis, PostgreSQL (Prisma), Ethereal SMTP, and Slack OAuth 2.0 integration.

---

## 🏗️ Architecture & Stack

- **Backend Framework**: Node.js & Express with TypeScript (`/src`)
- **Queue Management**: [BullMQ](https://docs.bullmq.io/) backed by Redis for persistent delayed jobs and state management.
- **Database & ORM**: PostgreSQL hosted on Neon Cloud, managed via [Prisma ORM](https://www.prisma.io/).
- **Search Engine**: Elasticsearch integration (`/src/services/email-search.ts`) with automatic PostgreSQL fallback search when Elasticsearch is unreachable.
- **Email Delivery**: Nodemailer configured with Ethereal SMTP test accounts.
- **Authentication**: Real Google OAuth 2.0 flow with HTTP-only signed session cookies.
- **Slack Integration**: Real OAuth 2.0 installation flow storing workspace bot tokens and sending rate-limit/batch notifications directly to Slack channels.
- **Queue Dashboard**: [Bull Board](https://github.com/felixmosh/bull-board) mounted at `/admin/queues` for real-time visual inspection of waiting, active, delayed, and completed jobs.
- **Frontend SPA**: React with Vite, TypeScript, and Tailwind CSS (`/frontend`).

---

## ✨ Key Features & Architectural Rules

1. **No Polling Schedulers**: All scheduled emails utilize BullMQ delayed queue items (`queue.add(name, data, { delay: ms, jobId })`). Zero usage of `setInterval`, `cron`, `node-cron`, or in-memory array polling.
2. **Atomic Hourly Rate Limiting**: Distributed rate-limiting powered by Redis atomic `INCR` + `EXPIRE` operations scoped per sender per hour (`rate:sender:{id}:{hourBucket}`).
3. **Slack OAuth 2.0 Integration**: Authenticates tenants using Slack OAuth 2.0 authorization code flow. Sends alerts using stored Slack Bot tokens (`chat.postMessage`).
4. **Strict Idempotency**: Idempotency key generated as `${recipient}:${campaignId}` enforced via deterministic BullMQ `jobId` assignment and a PostgreSQL unique database constraint.
5. **Startup Reconciliation**: Re-enqueues any `SCHEDULED` emails missing from Redis upon application boot without duplicating existing delayed BullMQ jobs.
6. **Dual Search Mechanism**: Synchronous indexing to Elasticsearch upon write operations with graceful degradation to PostgreSQL full-text/ILike database queries if Elasticsearch is offline.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+) & npm
- PostgreSQL database URL (e.g. Neon PostgreSQL connection string)
- Redis instance running on `localhost:6379` (or custom host/port)
- *(Optional)* Elasticsearch running on `localhost:9200`

---

### 1. Environment Setup

Copy `.env.example` to `.env` in both the root directory and the `/frontend` directory:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

#### Backend `.env` Configuration
```env
GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=your-random-jwt-secret
FRONTEND_ORIGIN=http://localhost:5173
PORT=3000

DATABASE_URL="postgresql://neondb_owner:password@ep-host.neon.tech/neondb?sslmode=require"

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

ELASTICSEARCH_URL=http://127.0.0.1:9200

SEED_SMTP_HOST=smtp.ethereal.email
SEED_SMTP_PORT=587
SEED_SMTP_USERNAME=your-ethereal-user
SEED_SMTP_PASSWORD_ENCRYPTED=your-ethereal-password
SEED_SENDER_EMAIL=your-ethereal-sender@ethereal.email

SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:3000/api/slack/callback
SLACK_OAUTH_STATE_SECRET=your-slack-state-secret

MAX_EMAILS_PER_HOUR_PER_SENDER=100
```

#### Frontend `frontend/.env` Configuration
```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_API_URL=http://localhost:3000
```

---

### 2. Database Migration & Seeding

Sync the database schema with Prisma and populate seed data:

```bash
npx prisma db push
npm run prisma:seed
```

---

### 3. Running the Application

Run the backend server, queue worker, and frontend dev server:

#### Terminal 1 — Backend API
```bash
npm run dev
```

#### Terminal 2 — Queue Worker
```bash
npm run worker
```

#### Terminal 3 — Frontend SPA
```bash
cd frontend
npm run dev
```

The application will be accessible at:
- **Frontend SPA**: `http://localhost:5173`
- **Backend API**: `http://localhost:3000`
- **Bull Board Queue Dashboard**: `http://localhost:3000/admin/queues`

---

## 📡 API Reference

### Authentication
- `GET /api/auth/google/url` — Returns Google OAuth authorization URL.
- `GET /api/auth/google/callback` — Handles OAuth callback and sets session cookie.
- `GET /api/auth/me` — Fetches current authenticated user profile.
- `POST /api/auth/logout` — Clears active user session.

### Email Operations
- `POST /api/emails/schedule` — Schedules a single or batch of emails. Accepts `Idempotency-Key` header or body field.
- `GET /api/emails` — Lists all scheduled/sent emails with pagination.
- `GET /api/emails/search?q={query}` — Searches emails via Elasticsearch (or PostgreSQL fallback).
- `GET /api/emails/:id` — Gets detailed metadata for a scheduled email job.

### Slack Integration
- `GET /api/slack/install` — Initiates Slack OAuth 2.0 install flow.
- `GET /api/slack/callback` — Exchanges authorization code for access token and stores tenant credentials.
- `GET /api/slack/status` — Checks active Slack workspace connection status.
- `POST /api/slack/disconnect` — Removes stored Slack OAuth token for the tenant.

### Monitoring & Dashboard
- `GET /admin/queues` — Interactive Bull Board dashboard (requires authenticated session).
