# Faza 4 — Activate + rollback + audit

## Activate

1. `requireChangeReason`
2. `validate` (dry-run)
3. Ako greške i block-on-error → ne aktivira, vrati listu
4. Transaction:
   - apply snapshot na live (settings non-secret, routing replace-set, SLA upsert, catalog field upsert; **ne briši** Service/FormVersion sa Ticket FK)
   - current `ACTIVE` → `VALIDATED`
   - candidate → `ACTIVE`, `activatedAt=now()`
   - `recordChangeLog` (`entityType: config_version`)
   - AuditLog append (hash = sha256(previousHash + canonical payload))

## Rollback

Zahtijeva `allowRollback`. Target = zadnja `VALIDATED` koja je bila ACTIVE prije current, ili eksplicitni `targetVersionId`.

Nova `ConfigVersion`: snapshot kopija targeta, meta `rollbackOfVersion`, pa isti activate-apply tok. Current ACTIVE → `ROLLED_BACK`.

## Restore ograničenja

Ako apply ne može (nedostaje group/OU, immutable form conflict) → ista error lista, bez partial commit.
