# Paket 223 — BA-inbound-email-13: inventar dokaza i preostale praznine

**Status:** otvoreno. Ovaj inventar ne predstavlja mailbox→ticket E2E dokaz.

| Oblast | Postojeći dokaz | Ograničenje |
| --- | --- | --- |
| Crash recovery | `inbound-email-recovery.spec.ts`: replay nakon potvrđenog ticket upisa bez duplikata; `inbound-email-recovery.integration.spec.ts`: istekli claim i idempotentni ključevi nad bazom | Nije cjelokupan realni provider→ticket E2E tok. |
| Konkurencija | `inbound-email-attempt.spec.ts`: konkurentni claimant je fenčan; integration spec provjerava jedinstvenost PROCESSED Message-ID | Unit mock i DB test nisu realni istovremeni mailbox E2E. |
| Provjera pošiljaoca | `inbound-email.spec.ts` testira trusted authserv-id i odbijanja; `inbound-email-admin.service.spec.ts` redakciju | Ne dokazuje da produkcijski receiver uklanja podmetnute headere. |
| Scheduler | `inbound-email.scheduler.service.spec.ts` provjerava ponovno uspostavljanje rasporeda | Unit test, ne simulacija stvarnog Redis gubitka. |
| Raw retention | `inbound-raw-store.spec.ts` i `inbound-email-retention.spec.ts`, paket 221 | Ne predstavlja puni crash test fajlsistema i baze. |
| Mailbox→ticket E2E | Nije dostupan kao automatizovani realni provider E2E dokaz | Potrebno projektovati izolovan, korelisan test sa sigurnim mailboxom i cleanupom; ne koristiti produkcijske podatke. |

CI [`43220061716`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43220061716) na `e592cdf` uspješan je za backend generated-Prisma build/test, PostgreSQL+Redis integration i frontend; E2E critical flows su preskočeni. Taj CI ne zatvara ovaj nalaz. Bez promjene produkcijskog koda ili migracije.
