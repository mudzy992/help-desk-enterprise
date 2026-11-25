-- W2.16 (`BA-authentication-03`): the MFA token (`jti`) was single-use only through a best-effort
-- Redis write performed AFTER the TOTP check and AFTER the enrollment state change. Two parallel
-- confirmations of the same token therefore both passed the check, both wrote the enrollment and both
-- minted a session; a Redis failure allowed replay until the token expired.
--
-- This row is the durable claim: `INSERT` is the atomic "I own this token now" (a unique `jti` makes the
-- second caller lose), `consumedAt` marks the successful use, and a rejected code deletes the row so a
-- typo does not cost the user a new password. Rows are bounded by the MFA token TTL and trimmed on use.
CREATE TABLE "MfaTokenClaim" (
    "jti" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "stage" VARCHAR(16) NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "MfaTokenClaim_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "MfaTokenClaim_claimedAt_idx" ON "MfaTokenClaim"("claimedAt");
