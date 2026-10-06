-- 5.1.3 / D3: service forms may be disabled, or explicitly optional, so a new
-- ticket can legitimately have no bound form version. Existing bindings stay
-- intact and the foreign key continues to protect historical versions.
ALTER TABLE "Ticket" ALTER COLUMN "formVersionId" DROP NOT NULL;
