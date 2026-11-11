# BA-announcements-06: version CAS (If-Match) za sve mutacije najave

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (C1/C2/C3 = DA) uz CI `43004333959` success; vidi audit 28 §22. Mutacije nisu imale optimistic concurrency: paralelni draft update je bio last-write-wins, withdraw je pisao bez status predikata nakon ranijeg čitanja, a objavljeni edit je verziju povećavao samo pri promjeni teksta, pa su se update/withdraw i lifecycle odluke mogle međusobno pregaziti nad zastarjelim snapshotom.

## Izmjena

Bez migracije (kolona `version` postoji). Sve četiri mutacije sada zahtijevaju `If-Match: "v<version>"` zaglavlje (zajednički `parseIfMatch`: 428 bez zaglavlja, 400 neispravno, obrazac iz optimistic-concurrency modula). `update`, `publish`, `withdraw` i `remove` pišu isključivo kroz `updateMany`/`deleteMany` s predikatom `{ id, version: expected }` (publish/withdraw uz to zadržavaju status predikat `DRAFT`/`PUBLISHED`), svaka uspješna mutacija povećava verziju, a gubitnik trke dobija novi `ANNOUNCEMENT_VERSION_CONFLICT` (409). Frontend API klijent šalje If-Match iz učitane verzije (editor i akcije Objavi/Povuci/Obriši), greška se mapira na novu i18n poruku `announcements.errors.versionConflict` (bs/en), a E2E cleanup helperi također šalju zaglavlje. Revision snapshot sadržaja (severity/display/end/service) ostaje zaseban nalaz BA-announcements-07.

## Testovi i granice

Novi `announcements.concurrency.spec.ts` (5 testova): draft update piše kroz version predikat i inkrementira, zastarjeli update/publish/withdraw/delete odbijeni kao version conflict. Lokalno: backend announcements suite 10 suiteova / 61 test, ciljani ESLint; frontend Vitest announcements 8 fajlova / 22 testa, `tsc --noEmit`, i18n parity, Prettier, ESLint. CI `43004333959` (success) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio C1/C2/C3 = DA — nalaz je zatvoren, vidi audit 28 §22. Naknadna UX dopuna: greška spremanja u editoru prikazuje se i kao toast jer se inline alert u dugoj formi mogao previdjeti (test u `announcement-editor-dialog.spec.tsx`).
