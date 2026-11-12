# BA-announcements-15: puna retention/anonymization matrica najava

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (V1/V2 = DA) uz CI `43174005190` success; vidi audit 28 §38. Retention je brisao samo potvrde/odbacivanja N dana nakon završetka najave; historija verzija teksta, e-mail run zapisi, snapshot publike i in-app notifikacije najave živjeli su trajno. Vlasnik je kroz `ask_user` odabrao **punu matricu u postojećem retentionu**.

## Izmjena

Bez migracije. `applyRetention` (sweep, ista postavka `private.announcements.receiptRetentionDays`, default 365 dana od `endsAt`) sada nakon receipt brisanja radi i satelitski prolaz (`applySatelliteRetention`, najviše 100 najava po sweepu, najstariji kraj prvi):

- Briše se: `AnnouncementRevision` redovi, `AnnouncementEmailRun` redovi, `AnnouncementAudienceMember` snapshot redovi (BA-13) i in-app `Notification` zapisi najave (`payload.announcementId`); na samoj najavi čiste se Teams evidence polja (`teamsPostedAt`/`teamsResult`). Sve u jednoj transakciji po najavi uz log `announcement_satellite_retention_applied` s brojanjem po tipu.
- **Legal hold (fail-closed):** ako bilo koji snapshot član ili nosilac potvrde/odbacivanja ima `legalHoldAt`, cijela najava zadržava sve satelite; greška pri provjeri također blokira (warn `announcement_satellite_retention_failed`, sweep ponavlja kasnije) — obrazac globalne blokade iz BA-integration-queue-12, sužen na uključene korisnike najave.
- Najava bez satelita se preskače bez transakcije (idempotentno ponavljanje sweepa je jeftino).
- **Granice:** sam red najave i audit trag se ne diraju; `NotificationEmailDelivery` ledger se ne dira ovdje — pripada notifications privacy retention lifecycleu (BA-notifications-09). Snapshot se ne prepisuje anonymization tokom (brojevi reporta ostaju tačni dok retention ne obriše cijeli snapshot); anonymization i dalje briše korisnikove potvrde/odbacivanja kako je radio.
- Ritam/otpornost retentiona (zaseban job, alarm na ponavljane greške) ostaje BA-announcements-17 i nije dio ovog paketa.

## Testovi i granice

Backend: novi `announcements.retention.spec.ts` (4 testa: puno brisanje svih tipova + čišćenje Teams polja u transakciji; legal hold blokira sve; bez satelita nema transakcije; sweep dolazi do satelitskog prolaza). Lokalno: backend announcements suite (osim preegzistirajućeg stub-limited delivery test) + ESLint. CI na pushu je autoritet.

## Operativna potvrda (V1–V2)

Preduslov: redeploy svježeg builda (API + worker). Test V1 je najlakše izvesti na instalaciji gdje se retention period može privremeno smanjiti (Administracija → Postavke najava, retention potvrda) — ako to nije praktično, V1 može biti N/A uz oslonac na jedinične testove i worker log pri prirodnom isteku.

| ID | Koraci | Očekivano |
| --- | --- | --- |
| V1 | Na staroj, davno završenoj najavi (ili uz privremeno smanjen retention period pa vraćen): nakon sljedećeg sweepa (do ~5 min) provjeri worker/API log. | Vidi se `announcement_satellite_retention_applied` s brojanjem; izvještaj stare najave i dalje se otvara, a njene verzije/runovi/snapshot su uklonjeni. |
| V2 | Otvori izvještaj i listu najava za nedavno završene i aktivne najave. | Ništa se nije promijenilo: potvrde, izvještaji i realtime prikaz rade kao dotad (retention dira samo najave kojima je prošao retention prozor). |

Odgovor: `V1: DA/NE/N/A, V2: DA/NE` + opis odstupanja ako ih ima. CI `43174005190` (success) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio V1/V2 = DA — nalaz je zatvoren, vidi audit 28 §38.
