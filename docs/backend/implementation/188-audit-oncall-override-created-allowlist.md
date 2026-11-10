# BA-on-call-15: audit allowlist odbija oncall.override.created metadata

Status: **otvoreno** (naknadno registrovan nalaz, otkriven tokom BA-on-call-05). `insertOverride` u audit zapis za `oncall.override.created` šalje `overrideId` i `swapRequestId`, ali allowlist u `audit-action-schema-registry` ta polja nije sadržavala, pa je pravi audit writer (`prepareAuditEntry`) bacao `AUDIT_METADATA_FIELD_NOT_ALLOWED:oncall.override.created:overrideId`. Posljedica je funkcionalna, ne samo audit: greška nastaje unutar iste transakcije, pa se **svako** kreiranje overridea — manualno i kroz swap accept — poništavalo i vraćalo grešku korisniku. Svi ostali on-call audit payloadi (schedule saved/deleted, override deleted, swap requested/accepted/declined/cancelled) prolaze validaciju; problem je bio izolovan na ovu akciju. Postojeći service specovi mockuju audit writer, pa regresija nije hvatana.

## Dokaz i ispravka

Reprodukcija je izvršena direktnim pozivom `prepareAuditEntry` s tačnim payloadom koji writer šalje (prije ispravke: throw; poslije: prolaz). Allowlist za `oncall.override.created` proširena je poljima `overrideId` i `swapRequestId` (verzija scheme ostaje 1 — radi se o aditivnom proširenju pisaće allowliste; historijski zapisi s tim poljima, nastali prije uvođenja registra, ostaju čitljivi jer se allowlist primjenjuje samo pri upisu). Regresioni test u `audit-action-schema-registry.spec.ts` prolazi kroz pravi `prepareAuditEntry`, a swap-accept spec sada audit mock vozi kroz stvarnu policy validaciju umjesto slijepog no-opa.

## Registracija i granice

Nalaz je registrovan kao `BA-on-call-15` (P2) u auditu 21, globalnom registru i generisanom planu (693 nalaza: 174 P1 / 369 P2 / 150 P3; Val 6 presjek 53/110, 57 otvorenih). Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde (uspješno manualno kreiranje overridea i swap accept u ciljnom okruženju) nalaz se ne zatvara. Migracija nije rađena.
