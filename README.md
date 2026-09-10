# Outbox — Production-Grade Email Job Scheduler

A distributed email job scheduler built with TypeScript, Express, BullMQ, Redis, PostgreSQL (Prisma), Ethereal SMTP, and Slack OAuth 2.0 integration.

---

## 🏗️ Tech Stack

- **Backend**: Express.js with TypeScript (`/src`)
- **Queue**: BullMQ backed by Redis for persistent delayed jobs
- **Database & ORM**: PostgreSQL (Neon Cloud) managed via Prisma ORM
- **Search Engine**: Elasticsearch (`/src/services/email-search.ts`) with automatic PostgreSQL search fallback
- **Email SMTP**: Nodemailer with Ethereal Email test accounts
- **Authentication**: Google OAuth 2.0 ID Token authentication (`@react-oauth/google` + `google-auth-library`) with HTTP-only signed session cookies
- **Slack Integration**: Real Slack OAuth 2.0 flow (`user_scope=incoming-webhook`) storing tenant access tokens and webhook URLs for automated alerts
- **Queue Dashboard**: Bull Board mounted at `/admin/queues`
- **Frontend SPA**: React with Vite, TypeScript, and Tailwind CSS (`/frontend`)

---

## ⚙️ Core Architecture & Features

1. **Delayed Job Scheduling**: Email scheduling relies exclusively on BullMQ delayed queue jobs (`queue.add(name, data, { delay, jobId })`). No `setInterval`, `cron`, or polling schedulers are used.
2. **Atomic Hourly Rate Limiting**: Distributed rate-limiting powered by Redis atomic `INCR` and `EXPIRE` operations scoped per sender per hour (`rate:sender:{senderId}:{hourBucket}`).
3. **Slack Alerting**: Automatically dispatches notifications via tenant Slack webhooks/Bot API when rate limits are exceeded or batches are delayed.
4. **Deterministic Idempotency**: Idempotency key generated as `${recipient}:${campaignId}` enforced via BullMQ `jobId` assignment and a PostgreSQL unique constraint. Supports optional `Idempotency-Key` HTTP header on `/api/emails/schedule`.
5. **Startup Reconciliation**: Re-enqueues any `SCHEDULED` database records missing from Redis upon application boot.
6. **Search & Fallback**: Indexes emails into Elasticsearch on schedule, gracefully falling back to PostgreSQL `contains` (case-insensitive) database search if Elasticsearch is offline.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+) & npm
- PostgreSQL database URL (Neon PostgreSQL)
- Redis instance running on `localhost:6379`
- *(Optional)* Elasticsearch instance running on `localhost:9200` (starts via Docker)

---

### 1. Setup Environment Variables

Copy `.env.example` to `.env` in the root and `/frontend` directories:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

#### Backend `.env`
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

#### Frontend `frontend/.env`
```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_API_URL=http://localhost:3000
```

---

### 2. Database Setup

Push the Prisma schema to PostgreSQL and run the seed script:

```bash
npx prisma db push
npm run prisma:seed
```

---

### 3. Run Development Services

Start the backend API, BullMQ worker, and frontend SPA:

```bash
# Terminal 1 — Backend API
npm run dev

# Terminal 2 — Queue Worker Process
npm run worker

# Terminal 3 — Frontend SPA
cd frontend
npm run dev
```

---

## 📡 Actual API Routes

### Authentication (`/api/auth`)
- `POST /api/auth/google` — Authenticates user via Google ID Token (`{ idToken }`) and sets HTTP-only session cookie.
- `GET /api/auth/me` — Returns current authenticated user profile.
- `POST /api/auth/logout` — Clears current session cookie.

### Emails (`/api/emails`)
- `POST /api/emails/schedule` — Schedules single or batch email jobs. Accepts optional `Idempotency-Key` header.
- `GET /api/emails?status=scheduled` — Fetches scheduled emails.
- `GET /api/emails?status=sent|failed` — Fetches sent or failed emails.
- `GET /api/emails/search?q={query}` — Searches emails via Elasticsearch (or Postgres fallback).

### Slack Integration (`/api/slack`)
- `GET /api/slack/install` — Initiates Slack OAuth 2.0 installation flow (`user_scope=incoming-webhook`).
- `GET /api/slack/callback` — Handles OAuth callback, exchanges code for access token/webhook URL, and saves to tenant.

### Dashboard
- `GET /admin/queues` — Bull Board interface for queue inspection.

---

## 🌐 Production Deployment Guide

### Option 1: Render / Railway Blueprint Deployment (Recommended)

#### 1. Backend API & BullMQ Worker (Render)
1. Push your repository to GitHub (`https://github.com/ManshiSandilya/Outbox`).
2. Log into [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Select your `Outbox` repository. Render automatically reads [render.yaml](file:///d:/outbox/render.yaml) and provisions:
   - `outbox-api` (Express Web Service running `npm run start`)
   - `outbox-worker` (BullMQ Worker running `npm run start:worker`)
   - `outbox-redis` (Managed Redis instance)
5. Fill in required environment variables in Render:
   - `DATABASE_URL`: Your PostgreSQL connection string (Neon DB / Render DB).
   - `FRONTEND_ORIGIN`: Your deployed Vercel URL (e.g. `https://outbox-frontend.vercel.app`).
   - `SLACK_REDIRECT_URI`: `https://<your-render-api-url>/api/slack/callback`.

#### 2. Frontend SPA (Vercel)
1. Log into [Vercel Dashboard](https://vercel.com).
2. Click **Add New Project** and import your GitHub repository.
3. Set **Root Directory** to `frontend`.
4. Configure Environment Variables:
   - `VITE_API_URL`: Your deployed Render API URL (e.g. `https://outbox-api.onrender.com`).
   - `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
5. Click **Deploy**. Vercel uses [frontend/vercel.json](file:///d:/outbox/frontend/vercel.json) for automatic SPA client-side routing.

---

### Option 2: Docker Container Deployment (VPS / DigitalOcean / AWS)

Build and run using the included [Dockerfile](file:///d:/outbox/Dockerfile):

```bash
# Build production Docker image
docker build -t outbox-backend .

# Run Express API
docker run -d --name outbox-api \
  -p 3000:3000 \
  --env-file .env \
  outbox-backend npm run start

# Run BullMQ Worker
docker run -d --name outbox-worker \
  --env-file .env \
  outbox-backend npm run start:worker
```

