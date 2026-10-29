# Backend Val 3 / W3.7 — partitioned audit append concurrency

## Status

**Završeno.** Implementacija je isporučena commitima `5dcd157`, `87aa5eb` i `12d5876`. Potpuno zeleni CI dokaz je `40180285554`.

Zatvoren je `BA-audit-log-06`: audit append više ne uzima jedan ekskluzivni deployment-wide chain lock. Nezavisne organizacione jedinice imaju nezavisne lockove i hash headove, dok ista particija ostaje strogo serijalizovana.

## Particijski chain ugovor

Nova hash verzija v5 hash-bound veže `chainPartition`. OU događaj koristi `ou:<organizationalUnitId>`, a događaj bez OU koristi `global`. Svaka particija ima vlastiti prethodni hash i advisory lock izveden deterministički iz SHA-256 particijskog identiteta.

Legacy v1–v4 redovi ostaju u historijskom `global` chainu. Verifier istovremeno održava head mapu po particijama, pa interleaving različitih OU redova nije fork, dok pogrešan `previousHash` unutar iste particije odmah daje mismatch.

## Maintenance, retention i anchor

Append uzima shared maintenance lock i ekskluzivni particijski lock jednim SQL pozivom. Redakcija i retention uzimaju ekskluzivni maintenance lock, čime ostaju atomski u odnosu na sve append particije bez vraćanja globalne serijalizacije normalnog write prometa.

Retention checkpoint pohranjuje mapu posljednjih obrisanih hashova po particijama. Incremental verifier prenosi tu mapu i vlastite particijske headove kroz stranice. V5 redakcijski rechain računa svaki chain zasebno i hashira particijski identitet.

WORM publisher više ne anchora samo posljednji vremenski red. Čita najnoviji red svake particije, canonical sortira `(partition,id,hash)` manifest i objavljuje potpisani SHA-256 aggregate root. Time jedan anchor commit obuhvata sve trenutne particijske headove.

## Izvršni concurrency dokaz

`partitioned-audit-chain.integration.spec.ts` drži transakciju OU-A otvorenom nakon appenda, zatim zahtijeva da OU-B transakcija commitira prije oslobađanja OU-A. Taj dokaz bi timeoutovao sa starim globalnim ekskluzivnim lockom. Test dodatno potvrđuje različite persisted particije, genesis prethodni hash za oba nezavisna chaina i potpuno validan verifier rezultat bez forkova.

Stvarna PostgreSQL kolekcija prošla je u CI runu `40180285554`, zajedno sa migration replay/policy provjerom, punim backend build/lint/Jest paketom, Redis integracijom, container/supply-chain provjerama, frontendom, dokumentacijom i završnim CI gateom.

## Migracija i kompatibilnost

Migracija `20271025100000_partition_audit_chain` dodaje `AuditLog.chainPartition` sa sigurnim legacy defaultom `global`, particijski indeks i JSONB `AuditChainCheckpoint.partitionHeads` sa praznim defaultom. Deployment migration sentinel pomjeren je na ovu migraciju. Postojeći redovi i checkpointi ostaju čitljivi bez backfill prekida.

## Sljedeće

Sljedeći paket je **W3.8 — versionirani audit action-schema registry, centralni metadata allowlist/sensitivity ugovor i tvrdi byte/depth limiti; zatvoriti `BA-audit-log-07`**.
