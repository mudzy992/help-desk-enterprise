# BA-announcements-07: kompletan immutable snapshot u reviziji objavljene najave

Status: **otvoreno**. Revizija objavljene najave čuvala je samo prethodni naslov i tekst, i to samo kada se tekst mijenjao; promjene težine, načina prikaza, rasporeda, servisa i kanala nisu ostavljale nikakav historijski zapis.

## Izmjena

**Migracija (vlasnik izričito odobrio):** `20271031220000_announcement_revision_full_snapshot` dodaje samo nullable kolone u `AnnouncementRevision` (`severity`, `displayMode`, `startsAt`, `endsAt`, `serviceId`, `notifyAudience`, `sendEmail`, `postToTeams`); postojeći podaci se ne mijenjaju, stare revizije ostaju čitljive s null snapshot poljima. Schema sentinel (`database-runtime-contract`) pomjeren je na novu migraciju. U `update()` se revizija sada piše pri **svakoj** promjeni objavljenog stanja (tekst, težina, prikaz, početak/kraj, servis, kanali), sa snapshotom stanja koje se zamjenjuje; `detail()` vraća snapshot polja (datumi kao ISO ili null), a frontend tip `ManagedAnnouncementDetail.revisions` je proširen istim poljima.

## Testovi i granice

`announcements.concurrency.spec.ts` dobio je test da izmjena samo težine objavljene najave ostavlja snapshot prethodnog stanja. Lokalno: backend announcements suite 10 suiteova / 62 testa, database-runtime-contract 4/4, ciljani ESLint, migration policy provjera (112 migracija), frontend `tsc --noEmit`, Prettier, ESLint. Bez generated-Prisma/PostgreSQL CI dokaza (CI primjenjuje migraciju na disposable bazi) i operativne potvrde nalaz se ne zatvara.
