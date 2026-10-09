-- Paket 5.4.0-a (M1): phishing-resistant second factor (WebAuthn / passkey).
-- One row per registered credential; public key is the COSE key (base64url).
CREATE TABLE "UserPasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" VARCHAR(512) NOT NULL,
    "publicKey" VARCHAR(1024) NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT,
    "aaguid" VARCHAR(36),
    "deviceName" VARCHAR(120),
    "isBackupEligible" BOOLEAN NOT NULL DEFAULT false,
    "isBackedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" VARCHAR(64),

    CONSTRAINT "UserPasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPasskeyCredential_credentialId_key" ON "UserPasskeyCredential"("credentialId");
CREATE INDEX "UserPasskeyCredential_userId_idx" ON "UserPasskeyCredential"("userId");

ALTER TABLE "UserPasskeyCredential" ADD CONSTRAINT "UserPasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
