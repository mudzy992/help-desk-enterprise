-- W2.15 (`BA-authentication-02`): revocation of a token that carries a registry `sid` was already durable
-- (`UserSession.revokedAt`), but a legacy token without `sid` lived or died by two best-effort Redis writes.
-- When Redis rejected the write, logout, password change, MFA reset, deactivation or an admin revoke left the
-- stolen token valid until its 1 h expiry, while the API and the audit trail reported a successful revocation.
--
-- The cutoff below is the durable half of the hybrid strategy: PostgreSQL is the authority, Redis stays the
-- accelerator. The guard already reads the user row on every legacy request, so the check costs no extra
-- query. `tokensInvalidBeforeExceptJti` keeps the "revoke others" caller alive, exactly like the Redis payload.
ALTER TABLE "User" ADD COLUMN "tokensInvalidBefore" TIMESTAMP(3),
                   ADD COLUMN "tokensInvalidBeforeExceptJti" TEXT;
