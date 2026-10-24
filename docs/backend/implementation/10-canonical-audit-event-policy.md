# Backend Val 3 / W3.1 — canonical audit event policy

## Status

**Završeno.** Centralni kod je na SHA `cec75f9`, integration fixture korekcije na `00ca156` i `9c0a1db`, a real-PostgreSQL atomic rollback dokaz na `760216c`. Potpuno zeleni CI dokaz je `40131718141`.

Paket uvodi canonical primitive i izvršni inventar, ali ne zatvara samostalno postojeći audit nalaz: `BA-audit-log-11` uz runtime katalog traži i persisted schema/event version, dok `BA-audit-log-07` traži action-specific metadata sheme. Te granice ostaju otvorene umjesto parcijalnog zatvaranja nalaza.

## Canonical registri

`audit-event-policy.ts` gradi runtime registre isključivo iz centralnih `auditLogActions` i `auditLogEntityTypes` kataloga. Svaki append sada prije DB operacije fail-closed odbija nepoznat action ili entity type. Inventar izlaže deterministički sortirane akcije, entity tipove i dvije actor klase:

- `human` kada postoji `actorUserId`;
- `system` kada je actor ID `null`.

Actor klasifikacija je eksplicitna canonical semantika. Njeno persistiranje i cryptographic envelope versioning pripadaju narednim audit-chain paketima.

## Correlation kontekst

Ako producer pošalje eksplicitan `requestId`, on ostaje autoritativan. Ako ga izostavi, centralna policy granica ga preuzima iz `AsyncLocalStorage` request konteksta. Background/system tok bez request konteksta ostaje eksplicitno `null`; ne generiše se lažni HTTP correlation ID.

## Centralna metadata zaštita

Svi append pozivi prolaze kroz isti recursive metadata policy prije hashiranja i upisa:

- ključevi koji predstavljaju password, secret, token, authorization, cookie, private key, credential ili recovery code dobijaju vrijednost `[REDACTED]`;
- maksimalna JSON veličina je 16 KiB;
- maksimalna dubina je 8;
- prekoračenje limita je fail-closed i sprečava audit i pripadajuću transakciju umjesto tihog trunciranja.

Redigovana vrijednost je ona koja ulazi u metadata digest i chain hash, tako da se tajna ne upisuje prije naknadne redakcije.

## Atomarnost

`appendAuditLog` ostaje transaction-only primitive, a `recordAuditEntry` otvara transakciju za standalone događaj. Real-PostgreSQL integration dokaz izvršava append i zatim simulira business grešku u istoj transakciji; nakon rollbacka ne postoji audit red. Time je dokazano da audit zapis ne može ostati kao lažni trag necommitovane business mutacije.

## Verifikacija

CI `40131718141` potpuno je zelen i uključuje:

- backend build, lint i puni Jest;
- unit test runtime registra, correlation nasljeđivanja, centralne redakcije i metadata limita;
- stvarni PostgreSQL rollback dokaz kroz izolovani retention integration suite;
- sve prethodne PostgreSQL/Redis integration suiteove;
- frontend, docs guard, container/supply-chain i završni CI gate.

## Granice paketa

W3.1 ne uvodi persisted event schema version, action-specific metadata sheme, immutable actor/OU snapshot identifikatore, per-row hash algorithm/key ID, external anchor, atomsku privacy redakciju niti bounded streaming export/verify. Zato nalazi koji zahtijevaju te osobine ostaju otvoreni.

## Sljedeće

Sljedeći paket je **W3.2 — immutable audit identity i versionirani hash envelope: ukloniti `SetNull` mutaciju hashiranih actor/OU identifikatora, pohraniti algoritam po redu i dokazati kontrolisanu SHA rotaciju na stvarnom PostgreSQL-u**.
