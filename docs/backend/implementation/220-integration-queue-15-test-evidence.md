# Paket 220 — BA-integration-queue-15: compile-block uklonjen, crash/claim dokazna matrica

**Status:** otvoreno; dokazna matrica je djelimična, E2E dokaz za konkretni posao nedostaje.
**Nalaz:** audit 19 §3.15 (P3) — kritični DB/processor/crash testovi bili su compile-blocked (nedostajući generated Prisma enumi/delegati), a E2E 04 je samo pollavao postojanje joba bez ikakvog ishoda.

## Stanje i promjene

| Aspekt | Pokriće |
| --- | --- |
| Compile-blocked suiteovi | Riješeno CI generacijom Prisma clienta prije build/testa; svi integration-queue suiteovi (repository, processor, failure, scheduler, admin) izvršavaju se u svakom CI runu. |
| Duplicate claim / konkurencija | `integration-job-processor-claim.integration.spec.ts`: tačno jedan claimer za isti BullMQ pokušaj; fencing starog pokušaja nakon retry claima. |
| Crash / istekli claim | isti suite: istekli claim se karantiniše jednom i originalni worker je fenčan; unknown-outcome karantene se čuvaju kroz retention. |
| Dispatch recovery | `integration-job-dispatch-recovery.integration.spec.ts`: enqueue gap i due retry sa stabilnim attempt ID-jevima; admin retry + e-mail ledger + hash-chained audit prije recoveryja. |
| Edge ishod | `integration-job-edge-event-delivery.integration.spec.ts`: zero-subscriber ostaje retryable (ne COMPLETED); pozitivan subscriber count = best-effort. |
| E2E 04 | Provjerava postojanje joba, ali ne povezuje ga sa kreiranim ticketom niti dokazuje ishod. Prethodno dodana provjera drugih statusa uklonjena je jer je mogla proći zbog starog, nepovezanog posla. Potreban je korelisan E2E dokaz. |

## Dokaz

- Lokalno se E2E ne pokreće (nema stacka); dnevni schedule CI izvršava puni E2E. CI unit/integration jobovi su autoritativni za backend suiteove.
- Bez promjene produkcijskog koda; bez migracije.

## Korelisani E2E — pripremljen, nije izvršen

`e2e/tests/57-integration-queue-correlation.spec.ts` stvara testni tiket i odgovor, te iz baze čita samo status poslova čiji se EMAIL `dedupeKey` veže za ID tog odgovora ili EDGE payload veže za isti tiket i ID poruke. Traži `COMPLETED` ili `PUBLISHED_BEST_EFFORT`; ne smatra `PENDING`, `FAILED` ili nepovezane stare poslove uspjehom. `PUBLISHED_BEST_EFFORT` nije dokaz krajnje isporuke klijentu, a `COMPLETED` nije neovisni dokaz da je primalac pročitao e-mail.

Test je namjerno opt-in (`E2E_VAL6_QUEUE=1`), inače se **preskače**. Prije omogućavanja mora postojati izolovan, potrošni E2E stack i odgovarajuća baza; testni requester i admin; aktivni worker i queue za EMAIL ili EDGE; te odgovarajuća notification konfiguracija i primaoci koji generišu posao. Test kreira tiket i ne čisti ga automatski: potrebno je poslije očistiti/resetovati cijelo testno okruženje. Varijabla GitHub Actions `E2E_VAL6_QUEUE` proslijeđena je samo E2E koraku; nikad je ne uključivati dok E2E URL-ovi i baza mogu pokazivati na produkciju. Lokalno su provjereni TypeScript i Playwright listing, **ne** izvršavanje na stacku. Zatvaranje nalaza zahtijeva stvarno izvršen i uspješan test, ne skipped rezultat.
