# Backend Val 3 / W3.2 — immutable audit identity i versionirani hash envelope

## Status

**Završeno.** Implementacija i migracija su na SHA `e48efbd`, migration policy odobrenje i schema sentinel na `ae9f851`, a potpuno zeleni CI dokaz je `40132759119`.

Zatvoreni nalazi:

- `BA-audit-log-01` — hard delete korisnika ili OU-a više ne mijenja historijski hashirani identifikator;
- `BA-audit-log-02` — algoritam je pohranjen po redu, vezan u v3 envelope i verifier podržava mješovitu kontrolisanu rotaciju.

## Immutable historijski identitet

Migracija `20271024120000_audit_immutable_identity_hash_envelope` uklanja `AuditLog.actorUserId` i `AuditLog.organizationalUnitId` foreign key relacije sa `onDelete:SetNull`. Scalar identifikatori i njihovi indeksi ostaju. Time audit red čuva historijsku vrijednost čak i kada live User ili OrganizationalUnit red više ne postoji.

Ovo je namjerno odvajanje forenzičkog dokaza od live referencijalnog modela. Destruktivni dio migracije ima sadržajno i SHA-256 vezano odobrenje u migration policy manifestu. Real-PostgreSQL test kreira audit redove sa stvarnim actorom i OU-om, briše oba source reda i potvrđuje da oba identifikatora ostaju nepromijenjena.

## V3 hash envelope

`AuditLog` sada ima obavezni `hashAlgorithm` sa baznim defaultom `sha256` i CHECK granicom na `sha256`, `sha384` ili `sha512`.

Novi redovi koriste hash version 3. Canonical payload uz prethodni sadržaj veže:

- `hashVersion: 3`;
- per-row `hashAlgorithm`;
- metadata digest;
- immutable actor i OU identifikatore kada postoje.

Algoritam se bira jednom prije računanja hasha, koristi za digest chain operaciju i upisuje u isti red. Verifier za v3 ne koristi trenutno globalno podešavanje nego algoritam konkretnog reda. Legacy v1/v2 redovi zadržavaju raniju verification semantiku radi kompatibilnosti.

## Kontrolisana rotacija

Real-PostgreSQL integration dokaz u istom chainu appenduje SHA-256 red, zatim SHA-512 red. Nakon brisanja actor/OU source zapisa verifier čita algoritam svakog reda i potvrđuje cijeli chain. Time promjena konfiguracije više ne reinterpretira historijske v3 redove.

## Verifikacija

CI `40132759119` potpuno je zelen i uključuje:

- validaciju kompletne Prisma sheme i generisanje klijenta;
- destructive migration approval policy;
- replay svih migracija kroz zasebnog migrator korisnika;
- runtime DDL denial;
- real-PostgreSQL identity-delete i SHA-256→SHA-512 dokaz;
- backend build, lint, puni Jest i sve ostale PostgreSQL/Redis integration suiteove;
- frontend, docs guard, container/supply-chain i završni CI gate.

## Granice paketa

W3.2 ne dodaje row ID, createdAt, redaction state ili external signature/anchor u envelope. Zato `BA-audit-log-03` i `BA-audit-log-08` ostaju otvoreni. Historijski OU ID ostaje očuvan, ali UX/policy za pregled događaja obrisanog OU-a pripada zasebnoj query/scope korekciji.

## Sljedeće

Sljedeći paket je **W3.3 — cryptographic audit anchor i prošireni v4 envelope: hashirati row ID/vrijeme/redaction state te uvesti izvanbazu potpisani checkpoint sa fail-closed verifikacijom i alarmom za anchor lag**.
