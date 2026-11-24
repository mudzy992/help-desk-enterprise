-- W2.11 (`BA-organizational-units-02`): `ouPath` decides descendant scope, but the (id, ouPath) catalogue was
-- cached in-process with a 60 s TTL and invalidated only where the write happened. A reparent committed on
-- instance A left instance B serving the old path - and therefore the old scope - until its TTL expired.
--
-- This singleton row is the shared revision. Every topology write bumps it inside the same transaction, and a
-- cached catalogue is reused only while the revision still matches, so the database itself is the invalidation
-- channel: no event bus to miss, no extra table scan per request, and a stale snapshot can never outlive the
-- commit that made it stale.
CREATE TABLE "OrganizationalUnitCatalogRevision" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationalUnitCatalogRevision_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrganizationalUnitCatalogRevision" ("id", "revision", "updatedAt")
VALUES (1, 0, CURRENT_TIMESTAMP);
