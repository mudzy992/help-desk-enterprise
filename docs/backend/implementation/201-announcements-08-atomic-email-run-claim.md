# BA-announcements-08: atomarni notify/reminder claim i e-mail run

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (E1–E3 = DA, E4 = N/A) uz CI `43017793879` success; vidi audit 28 §24. `queueEmailRun` je bio best-effort poziv **nakon** što su `audienceNotifiedAt` / `lastReminderAt` već claimovani, uz gutanje grešaka: pad kreiranja e-mail runa nakon markera značio je da se objava više nikad ne zakazuje, a reminder je čekao sljedeći 24-satni interval; nije postojao poslovni ključ koji bi spriječio dupli otvoreni run.

## Izmjena

Bez migracije. Marker claim i kreiranje e-mail runa sada su **jedna transakcija** na oba puta (`notifyStarted` i `remind`): ako run ne može ući u red, transakcija se rollbackuje, marker ostaje nepotrošen i sweep/remind mogu ponoviti bez gubitka e-maila. Unutar transakcije `ensureEmailRun` prvo traži otvoreni (`completedAt IS NULL`) run istog `(announcementId, kind)` i ne kreira duplikat — delivery ledger dedupuje po runu, pa bi drugi otvoreni run publiku mailao dvaput. Dosadašnje gutanje grešaka (`emailQueued=false` bez posljedice) uklonjeno je: neuspjeh se propagira pozivaocu, koji ga već loguje (sweep/publish) ili ga vraća kao grešku uz siguran retry (remind, in-app dedupe štiti primaoce).

## Testovi i granice

`announcement-fanout.spec.ts` dobio je 2 testa: pad kreiranja runa odbija cijelu notify transakciju (sweep retry), a postojeći otvoreni run se ponovo koristi bez kreiranja duplikata. Lokalno: backend announcements suite 10 suiteova / 64 testa, ciljani ESLint. CI `43017793879` (success) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio E1–E3 = DA (E4 = N/A) — nalaz je zatvoren, vidi audit 28 §24.
