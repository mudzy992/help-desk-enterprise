# BA-integration-queue-11: forenzički trag admin retryja

Status: **otvoreno**. Admin retry je i ranije bio auditiran (actor, `fromStatus`, `previousAttempts`, `toStatus`), ali je reset reda (`attempts = 0`, `lastError = null`, `nextRetryAt = null`) brisao forenzički trag bez zapisa o tome koja je greška prethodila i koliko je puta posao već ručno vraćan. Ovaj paket taj trag trajno čuva u hash-vezanom audit zapisu, bez migracije i bez izlaganja sirove providerske poruke. Automatski CI `42773406842` i Perf smoke `42773406655` za commit `7966e60` prošli su uspješno, uključujući generated Prisma Client i stvarne PostgreSQL integration suiteove.

## Mehanizam

- `resetForAdminRetry` i dalje radi istu CAS tranziciju (`FAILED`/`DLQ` → `PENDING`, reset pokušaja i email ledger, ista zabrana za karantinske ishode). Unutar iste transakcije, prije upisa audit zapisa, broji prethodne `integration.job.retried` audit unose za taj posao.
- Audit metadata (schema v2 za `integration.job.retried`) sada dodatno sadrži:
  - `previousErrorCode` — isključivo stabilni admin kod izveden istim mapiranjem kao API response (`resolveIntegrationJobAdminErrorCode`); sirova `lastError` poruka, koja može sadržavati adrese ili providerski sadržaj, nikada se ne upisuje u audit metadata.
  - `previousNextRetryAt` — zakazano vrijeme retryja prije reseta (ISO ili `null`).
  - `previousAdminRetries` — koliko je admin retryja za taj posao već zabilježeno, pa kumulativna historija ručnih intervencija ostaje vidljiva iako red restartuje brojač pokušaja.
- Audit akcija `integration.job.retried` je podignuta na schema/compatibility verziju 2 u oba registra (`audit-action-schema-registry`, `audit-action-compatibility-registry`); stari unosi verzije 1 ostaju čitljivi jer se verzija pohranjuje po redu.
- Admin API i korisničko sučelje nisu mijenjani; zapis je dostupan kroz postojeći audit log.

## Ograničenja

Nema zasebne attempt-history tabele niti migracije: forenzički trag živi samo u audit logu i podliježe njegovom retentionu/redakciji. Audit unos bilježi sigurni kod greške, ne dijagnostički sadržaj — namjerno, radi zaštite tajni. `previousAdminRetries` ovisi o audit zapisima; ako se audit historija za entitet ukloni retentionom, brojač se računa od preostalih zapisa. Brojanje i upis su u istoj transakciji kao i reset, ali dva istovremena admin retryja istog posla i dalje razrješava postojeći status/version CAS — gubitnik ne piše audit unos jer CAS ne prođe. Automatski CI `42773406842` (generated Prisma + stvarni PostgreSQL, uključujući admin-retry recovery scenarij s novim metadata poljima) i Perf smoke `42773406655` za `7966e60` prošli su uspješno. Bez operativnog pregleda audit zapisa u stvarnom okruženju i odluke da je audit-log trag dovoljan umjesto namjenske historije pokušaja, nalaz se ne zatvara. Nije pokrenuta migracija ni deployment.
