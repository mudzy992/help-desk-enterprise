# Backend Val 3 / W3.3 — audit v4 envelope i potpisani izvanbazni anchor

## Status

**Završeno u odobrenom scopeu, bez umjetnog zatvaranja external-WORM nalaza.** V4 envelope i anchor primitive su na SHA `d50e98d`, redaction rechain kompatibilnost na `9aa8794`, zaključavajući v4 test na `cde72c7`, a potpuno zeleni CI dokaz je `40134084046`.

Zatvoren je `BA-audit-log-08`: row ID, vrijeme, algoritam i redaction state sada pripadaju versioniranom hash envelopeu.

`BA-audit-log-03` ostaje otvoren. W3.3 uvodi kriptografski potpisan anchor u storageu izvan baze i fail-closed loss/tamper/head/lag odluke, ali lokalni filesystem sink sam po sebi nije dokaz WORM/remote immutability niti je publish raspored operativno spojen na deployment. To se ne predstavlja kao završena zaštita protiv host administratora.

## V4 envelope

Novi audit redovi dobijaju aplikacijski generisan UUID i vrijeme prije računanja hasha. Canonical v4 payload veže:

- row ID;
- `createdAt`;
- `redactedAt`, uključujući eksplicitno početno `null` stanje;
- per-row hash algoritam;
- metadata digest;
- sve ranije action/entity/actor/request/OU i previous-hash elemente.

Verifier bira v4 semantiku po redu. Unit dokaz zasebno mijenja ID, vrijeme i redaction state te potvrđuje mismatch za svaku izmjenu.

## Redaction kompatibilnost

Legitimna privacy redakcija mijenja hashirano `redactedAt` stanje. Nakon redakcije se zato pod globalnim audit advisory lockom deterministički ponovo računa v4 suffix chain prije dodavanja zbirnog `audit.redacted` događaja. Real-PostgreSQL anonymization suite potvrđuje da redigovani chain ostaje validan.

Ovo ne zatvara `BA-audit-log-04`: sama postojeća višebatch redaction petlja još nije objedinjena u jednu transakciju sa svim metadata updateima i završnim događajem.

## Potpisani izvanbazni anchor

`audit-chain-anchor.ts` daje eksplicitne publish i verify primitive:

- HMAC-SHA-256 ključ minimalno 32 bajta i key ID;
- canonical anchor sa chain head ID/hash/vremenom i vremenom objave;
- atomski filesystem publish preko privremenog fajla i renamea;
- permission mode `0600`;
- constant-time provjera potpisa;
- fail-closed rezultati `MISSING`, `INVALID_SIGNATURE`, `HEAD_MISMATCH` i `STALE`;
- izračunati `lagMs` za alarm/health integraciju.

Test dokazuje validan anchor, DB-only head recompute mismatch, izmjenu anchor sadržaja i prekoračen lag. Ključ nije dio baze ni anchor dokumenta.

## Verifikacija

CI `40134084046` potpuno je zelen, uključujući:

- backend build, lint i puni Jest;
- v4 mutation testove;
- external-anchor signature/head/lag testove;
- real-PostgreSQL retention, anonymization i sve ostale integration suiteove;
- frontend, docs guard, container/supply-chain i završni CI gate.

## Sljedeće

Sljedeći paket je **W3.4 — operativni remote/WORM anchor publisher i verifier: deployment key provider, periodični publish, startup/readiness fail-closed provjera, metrički alarm za publish lag i realni sink fault/recovery dokaz; tek tada zatvoriti `BA-audit-log-03`**.
