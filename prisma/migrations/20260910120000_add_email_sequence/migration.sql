-- Preserves the original recipient ordering when a rate-limited job is deferred.
ALTER TABLE "emails"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "emails_campaign_id_sequence_key"
  ON "emails"("campaign_id", "sequence");
