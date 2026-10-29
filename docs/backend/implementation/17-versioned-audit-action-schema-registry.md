# Backend Val 3 / W3.8 — versionirani audit action-schema registry i metadata granice

## Status

**Završeno.** Osnovna implementacija je na SHA `ffbb4c7`, inventory i kompatibilnost producer polja stabilizovani su commitima `ecd2413`, `a7d605a`, `5d6e1e4`, `a8d2a59`, `362f47d`, `6009d96` i `b8df27b`, a privacy redaction kompatibilnost na `216acab`. Potpuno zeleni CI dokaz je `40187527565`.

Zatvoren je `BA-audit-log-07`: metadata više nije otvoreni `JsonValue` ulaz. Svaka registrovana audit akcija ima eksplicitan versionirani schema zapis, top-level allowlist i sensitivity klasu, a centralna politika fail-closed odbija neregistrovana polja i payload izvan tvrdih granica.

## Versionirani action-schema registry

`audit-action-schema-registry.ts` sadrži tačno jedan schema zapis za svaku od 145 kanonskih audit akcija. Svaki zapis definiše:

- schema verziju `1`;
- eksplicitan skup dozvoljenih top-level metadata polja;
- sensitivity klasu `operational`, `pseudonymous` ili `restricted`.

Zaključavajući test poredi registry ključeve sa kompletnim `auditLogActions` katalogom. Nova akcija bez schema zapisa ili schema zapis bez akcije ruši test, umjesto da tiho otvori novu metadata površinu.

## Centralni fail-closed ugovor

`prepareAuditEntry` prije bilo kakvog hasha ili DB upisa sada:

1. potvrđuje registrovanu akciju i entity tip;
2. zahtijeva objektni metadata payload;
3. provjerava svako top-level polje prema action allowlisti;
4. rekurzivno uklanja secret/credential vrijednosti;
5. pseudonimizuje direktne identifikatore poput e-maila, imena, telefona, IP-a i adrese;
6. odbija payload dublji od 8 nivoa;
7. odbija više od 128 metadata ključeva;
8. odbija canonical JSON veći od 16 KiB.

Greške imaju stabilne fail-closed kodove, uključujući `AUDIT_METADATA_FIELD_NOT_ALLOWED`, `AUDIT_METADATA_DEPTH_EXCEEDED`, `AUDIT_METADATA_KEY_COUNT_EXCEEDED` i `AUDIT_METADATA_SIZE_EXCEEDED`.

## Hash-bound schema verzija

Migracija `20271025120000_audit_action_schema_registry` dodaje `AuditLog.actionSchemaVersion` sa legacy-safe defaultom `1`. Nova hash verzija v6 uključuje schema verziju u canonical envelope zajedno sa v5 particijskim identitetom.

Verifier, incremental verifier i privacy rechain podržavaju v6, dok v1–v5 redovi ostaju kompatibilni. Poseban test mijenja samo `actionSchemaVersion` i potvrđuje hash mismatch, pa napadač ne može reinterpretirati stari payload pod drugom schema verzijom.

## Privacy i deterministički ordering

Direktno povezani subject audit red ostaje označen `redactedAt` tokom erasure toka čak i kada je PII već pseudonimizovan na ulazu. V2–v6 digest redovi ostaju potpuno provjerljivi nakon redakcije; samo legacy v1 red se vodi kao sealed.

Tokom stabilizacije je ispravljena i ordering granica: writer pod particijskim lockom bira `createdAt` strogo veći od prethodnog particijskog heada. Time dva appenda u istom milisekundu ne mogu promijeniti `(createdAt,id)` head redoslijed zbog slučajnog UUID poretka.

## Dokaz

CI `40187527565` potpuno je zelen i uključuje:

- Prisma schema validate/generate i migration replay/policy guard;
- backend build, ESLint i puni Jest;
- stvarne PostgreSQL/Redis integration suiteove, uključujući retention, anonymization, status-page i particijski concurrency;
- container i supply-chain provjere;
- frontend, dokumentaciju i završni CI gate.

Testovi eksplicitno dokazuju registry kompletnost, unknown-field odbijanje, centralnu secret redakciju, PII pseudonimizaciju, depth/size granice i v6 schema-version tamper detection.

## Sljedeće

Sljedeći paket je **W3.9 — audit OU scope provenance: izvesti i provjeriti organizacionu jedinicu iz kanonskog business resursa umjesto povjerenja producer inputu te zatvoriti `BA-audit-log-09`**.
