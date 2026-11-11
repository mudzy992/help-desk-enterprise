# BA-announcements-13: immutable membership snapshot pri publishu

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (T1/T2 = DA) uz CI `43112710466` success; vidi audit 28 §33. `audienceSizeAtPublish` bio je samo broj: report nije mogao dokazati ko je bio u publici u trenutku objave, pa je i nakon BA-12 (razdvojene populacije) ostao oslonjen na trenutnu publiku. Vlasnik je kroz `ask_user` izričito odobrio migraciju za ovaj paket.

## Izmjena

**Migracija** `20271130220000_announcement_audience_member_snapshot` (add-only): nova tablica `AnnouncementAudienceMember` (`announcementId`, `userId`, `organizationalUnitId`, unique `(announcementId, userId)`, FK na `Announcement` s cascade brisanjem). Postojeći podaci se ne diraju; najave objavljene ranije nemaju snapshot redove. Schema sentinel (`database-runtime-contract`) pomjeren na novu migraciju.

- **Publish presjek.** U istoj transakciji u kojoj se status prebacuje DRAFT → PUBLISHED upisuje se cijela publika u snapshot (user-id keyset stranice od `notifyBatchSize`=1000, `createMany skipDuplicates`), a `audienceSizeAtPublish` postavlja se na tačan broj snapshot redova — status, veličina i članstvo su jedan atomarni presjek. Publika objavljene najave se i inače ne može mijenjati (`publishedAudience` greška), pa je snapshot stabilan.
- **Report.** Kad snapshot postoji (`snapshotAvailable`), headline populacija je snapshot: `acknowledgedInSnapshotAudience` / `audienceSizeAtPublish`, pending = snapshot članovi bez potvrde (keyset stranice nad snapshotom), `byUnit` iz jedinica zabilježenih pri publishu; potvrde korisnika van snapshota vide se kao `acknowledgedOutsideSnapshotAudience`. Bez snapshot-a (stare najave) report radi kao nakon BA-12 (trenutna publika), uz jeftinu count provjeru postojanja da se ne plaćaju scanovi (BA-04 budžet). Snapshot bez postojanja ne radi member/ack scanove.
- **Frontend.** Dialog bira snapshot bazu kad je dostupna (nova napomena `snapshotNote`), inače BA-12 prikaz.

## Testovi i granice

Backend: novi `announcements.snapshot.spec.ts` (publish upisuje sve članove i tačnu veličinu u transakciji; report prema snapshotu s kasnijim članom van headlinea, unit redovi, pending lista) uz dopune mockova u authorization/concurrency specovima. Lokalno: backend announcements suite (osim preegzistirajućeg stub-limited delivery test) + ESLint; frontend announcements testovi + `tsc` + Prettier. Generated-Prisma/PostgreSQL dokaz daje CI na pushu (uključuje i BA-12 kod `8c11ad3`, čiji je prethodni CI run infra-zaglavio bez pokrenutih poslova).

## Operativna potvrda (T1–T2)

Preduslov: redeploy svježeg builda (API + worker + frontend) — redeploy primjenjuje migraciju.

| ID | Koraci | Očekivano |
| --- | --- | --- |
| T1 | Objavi (Publish) **novu** najavu koja traži potvrdu čitanja, s publikom od nekoliko korisnika; neka jedan potvrdi. Otvori **Najave → Izvještaj** za tu najavu. | Na vrhu omjer „Potvrdilo X od Y" s Y = publika pri objavi, a ispod napomena da se brojevi računaju prema trenutku objave uz broj sadašnje publike. |
| T2 | Otvori izvještaj za neku **staru** najavu (objavljenu prije ovog redeploya). | Izvještaj radi kao i dosad (baza je sadašnja publika), bez greške. |

Odgovor vlasnika: T1/T2 = DA; CI `43112710466` (success) dao je generated-Prisma/PostgreSQL dokaz, a korisnik je migraciju primijenio kroz redeploy — nalaz je zatvoren, vidi audit 28 §33.
