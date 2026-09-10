-- Required for gen_random_uuid() on PostgreSQL versions where it is supplied by pgcrypto.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RateLimitScope" AS ENUM ('TENANT', 'SENDER');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slack_access_token" TEXT,
    "slack_webhook_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(255),
    "smtp_host" VARCHAR(255) NOT NULL,
    "smtp_port" SMALLINT NOT NULL,
    "smtp_username" VARCHAR(255) NOT NULL,
    "smtp_password_encrypted" TEXT NOT NULL,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "senders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "senders_smtp_port_check" CHECK ("smtp_port" BETWEEN 1 AND 65535)
);

-- CreateTable
CREATE TABLE "emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient" VARCHAR(320) NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduled_time" TIMESTAMPTZ(6) NOT NULL,
    "sent_time" TIMESTAMPTZ(6),
    "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sender_id" UUID NOT NULL,
    "campaign_id" VARCHAR(255) NOT NULL,
    "idempotency_key" VARCHAR(512) NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "emails_sent_time_check" CHECK (
      ("status" = 'SENT' AND "sent_time" IS NOT NULL) OR
      ("status" <> 'SENT' AND "sent_time" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "rate_limit_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sender_id" UUID,
    "scope" "RateLimitScope" NOT NULL,
    "max_per_hour" INTEGER NOT NULL,
    "min_delay_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_limit_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rate_limit_configs_max_per_hour_check" CHECK ("max_per_hour" > 0),
    CONSTRAINT "rate_limit_configs_min_delay_ms_check" CHECK ("min_delay_ms" >= 0),
    CONSTRAINT "rate_limit_configs_scope_check" CHECK (
      ("scope" = 'TENANT' AND "sender_id" IS NULL) OR
      ("scope" = 'SENDER' AND "sender_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");
CREATE UNIQUE INDEX "senders_tenant_id_email_key" ON "senders"("tenant_id", "email");
CREATE INDEX "senders_tenant_id_idx" ON "senders"("tenant_id");
CREATE UNIQUE INDEX "emails_idempotency_key_key" ON "emails"("idempotency_key");
CREATE INDEX "emails_status_scheduled_time_idx" ON "emails"("status", "scheduled_time");
CREATE INDEX "emails_sender_id_status_idx" ON "emails"("sender_id", "status");
CREATE INDEX "emails_campaign_id_idx" ON "emails"("campaign_id");
CREATE INDEX "rate_limit_configs_tenant_id_idx" ON "rate_limit_configs"("tenant_id");
CREATE UNIQUE INDEX "rate_limit_configs_one_tenant_scope"
  ON "rate_limit_configs"("tenant_id") WHERE "scope" = 'TENANT';
CREATE UNIQUE INDEX "rate_limit_configs_one_sender_scope"
  ON "rate_limit_configs"("sender_id") WHERE "scope" = 'SENDER';

-- AddForeignKey
ALTER TABLE "senders" ADD CONSTRAINT "senders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emails" ADD CONSTRAINT "emails_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "senders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_limit_configs" ADD CONSTRAINT "rate_limit_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_limit_configs" ADD CONSTRAINT "rate_limit_configs_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
