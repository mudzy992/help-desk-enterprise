-- Supports the admin queue's stable (createdAt DESC, id DESC) cursor pages.
CREATE INDEX "IntegrationJob_status_createdAt_id_idx"
  ON "IntegrationJob"("status", "createdAt", "id");
