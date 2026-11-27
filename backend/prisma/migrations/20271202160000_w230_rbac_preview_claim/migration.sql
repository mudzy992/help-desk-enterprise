-- W2.30 (`BA-rbac-02`): the impact preview token was reusable for its whole 15-minute TTL.
-- The baseline compare-and-swap from W2.29 refuses a replay after the set changed, but a repeated
-- PUT with the same, unchanged (no-op) set still passed and wrote another audit row.
--
-- This row makes the preview single-use: `jti` is the token's id, a claim is an atomic
-- `UPDATE ... WHERE consumedAt IS NULL` inside the permission transaction, and because the claim
-- shares that transaction it is released when the write rolls back. Rows are bounded by the token
-- TTL and trimmed on the next preview.
CREATE TABLE "RolePermissionPreviewClaim" (
    "jti" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "actorUserId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "RolePermissionPreviewClaim_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RolePermissionPreviewClaim_expiresAt_idx" ON "RolePermissionPreviewClaim"("expiresAt");
