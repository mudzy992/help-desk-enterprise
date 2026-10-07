-- 5.2.1 M2 #4: legacy recovery codes were stored with an unkeyed SHA-256 hash.
-- They cannot be converted to the new domain-separated HMAC without plaintext.
-- Invalidate old hashes while preserving UserMfa/TOTP enrollment; users can
-- sign in with TOTP and issue fresh recovery codes from Account security.
ALTER TABLE "UserMfaRecoveryCode" ADD COLUMN "keyId" VARCHAR(64);
DELETE FROM "UserMfaRecoveryCode";
ALTER TABLE "UserMfaRecoveryCode" ALTER COLUMN "keyId" SET NOT NULL;

CREATE INDEX "UserMfaRecoveryCode_userId_keyId_usedAt_idx"
  ON "UserMfaRecoveryCode"("userId", "keyId", "usedAt");
