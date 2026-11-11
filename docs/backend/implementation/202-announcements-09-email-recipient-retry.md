# BA-announcements-09: retry neuspjelih primaoca i crash-sigurna isporuka e-maila najave

Status: **otvoreno**. E-mail run najave pomjerao je cursor preko neuspjelih primaoca i završavao se, pa privremena SMTP greška trajno preskače korisnika; nije bilo ponovnog pokušaja unutar životnog vijeka runa.

## Izmjena

Bez migracije. Pozadinski ledger `NotificationEmailDelivery` već ima retry state machine (PENDING/CLAIMED/FAILED/UNKNOWN/DEAD, backoff, deterministički Message-ID, stale CLAIMED → UNKNOWN bez slijepog ponovnog slanja — BA-notifications-07), ali ga announcement run nije koristio nakon prvog prolaza. Sada `processRun` nakon keyset prolaza radi **retry/reconciliation prolaz**: ponovo posjećuje FAILED/PENDING isporuke ovog runa (isti audience/preference/address filteri), run se završava tek kada svaki neuspjeli primalac bude ponovo isporučen, terminalan (UNKNOWN/DEAD — nikad se slijepo ne šalje ponovo) ili isključen pravilima; primaoci čiji retry još nije dospio ili ponovo padne drže run otvorenim za sljedeći sweep. Time je politika eksplicitno at-least-once uz deterministički Message-ID, a SMTP-accepted → DB-mark crash prozor završava u UNKNOWN stanju bez duplog slanja.

## Testovi i granice

`announcement-delivery.spec.ts` dobio je 2 testa: prethodno neuspjeli primalac se ponovo posjećuje prije završetka runa, a retry koji još nije dospio drži run otvorenim (bez `completedAt`). Lokalno: backend announcements suite 10 suiteova / 66 testova, ciljani ESLint. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara.
