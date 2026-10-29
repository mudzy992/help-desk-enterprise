# W5.7 — Permission-correct cursor CSV export i truncation manifest

## Status

Završeno. Završni implementacijski SHA je `21808ca`; puni zeleni CI dokaz je run `40237791891`.

## Zatvoreni nalaz

- `BA-tickets-07` — CSV limit se više ne primjenjuje prije confidential i assignment-scope filtera i izvoz više nije tiho nepotpun.

## Implementirani ugovor

- Shared ticket visibility i svi request filteri ostaju dio DB `where` ugovora.
- Export-specifični `isConfidential=false` uslov i OU/service scope assignmenta koji stvarno nosi `audit.export` sada se dodaju istom SQL predikatu prije limita.
- OU grant uključuje vlastiti OU i potomke preko canonical `ouPath`; service-scoped grant dodatno sužava isti SQL branch.
- Export čita eligible redove stabilnim ID cursorom u bounded batchovima od 500, najviše `maxRows + 1`.
- Prvih 5.000 eligible redova se izvozi; dodatni red eksplicitno označava truncation umjesto tihog skraćivanja.
- Rezultat i canonical audit metadata nose `exportedCount`, `eligibleCountLowerBound`, `eligibleCountIsLowerBound`, `truncated` i `maxRows`.
- HTTP odgovor izlaže isti manifest kroz `X-Export-*` headere, bez promjene CSV kolona.
- Backend build korak sada objavljuje bounded GitHub annotation sa compiler dijagnostikom, što uklanja raniji nečitljiv CI failure mode.

## PostgreSQL dokaz

`backend/src/modules/tickets/export/ticket-export-scope.integration.spec.ts` na stvarnom PostgreSQL-u kreira confidential, out-of-scope i dva eligible ticketa te dokazuje da limit dva vraća oba eligible reda. Isključeni redovi više ne mogu zauzeti mjesto prije limita.

## Validacija

CI `40237791891` je potpuno zelen: backend build/lint/unit, stvarni PostgreSQL/Redis integration suite, migration replay, frontend build/test/format, docs guard i container/supply-chain provjere.

## Migracije

Paket ne uvodi novu DB migraciju.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.8 — guardrail effect claim/recovery i durable CSAT/automation izvršenje (`BA-tickets-08`)**.
