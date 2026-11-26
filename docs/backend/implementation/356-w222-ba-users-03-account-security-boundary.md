# W2.22 — `BA-users-03`: deaktivacija i identitetske tranzicije prekidaju sesije i MFA lifecycle

**Paket:** W2.22 — granica pristupa se prekida u istoj transakciji<br>
**Nalaz:** `BA-users-03` (P1) — **zatvoren**<br>
**Kodni commit:** `df69eda`<br>
**Finalni testani SHA:** `eacc528` (docs commit; kodni `df69eda`)<br>
**CI:** [`45829219995`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45829219995) — **zelen** (svi poslovi, E2E 27/27, bez reruna)<br>
**DB migracije:** nema (nema promjene šeme)

## Nalaz i acceptance

Samo su reset-password i MFA reset zvali `SessionRegistryService.revokeAll`. Tri puta koja mijenjaju **ko smije
da se autentifikuje** nisu dirala ni sesije ni lokalne faktore:

| Ulaz | Šta je mijenjao | Šta je ostajalo |
| --- | --- | --- |
| `updateUser(isActive=false)` | status računa | neistekli refresh/session tokeni; reaktivacija ih je oživljavala |
| `linkUserDirectoryIdentity` | identitet (local → IdP) | lokalna sesija i lokalni MFA/passkey faktori uz novi IdP identitet |
| `unlinkUserDirectoryIdentity` | identitet (IdP → local) | provider sesija paralelno sa novim temporary passwordom; bez principal invalidation hooka |

**Acceptance:** deactivate, link i unlink odmah odbijaju sve prethodne access/refresh sesije; reaktivacija ne
oživljava stare tokene; fault test ne vraća 2xx bez durable revoke intent-a.

## Implementacija

**Novi ugovor — `backend/src/modules/authentication/security/account-security-boundary.service.ts`:**

- `cutAccountCredentials(transaction, {userId, actorUserId, transition})` — **durable polovina**, radi na
  transakcionom klijentu pozivaoca:
  1. `User.tokensInvalidBefore = now` **i** `tokensInvalidBeforeExceptJti = null` (W2.15 cutoff; stari `exceptJti`
     ne smije preživjeti granicu),
  2. `UserSession.updateMany({ userId, revokedAt: null }) → { revokedAt, revokedReason, revokedByUserId }`,
  3. briše `UserMfa`, `UserMfaRecoveryCode` i `UserPasskeyCredential` korisnika (lokalni factor lifecycle),
  4. vraća `AccountSecurityCut` (`cutoffAt`, `sessions`, `passkeys`, `mfaFactors`, `recoveryCodes`) za dokaz i audit.
- `AccountSecurityBoundaryService.afterCommit` — **volatile polovina**: `sessionRegistry.revokeAll` (Redis
  akcelerator + ponovni cutoff), pa audit `auth.security_transition_applied` sa prebrojanim rezultatom, pa
  notifikacija vlasniku (`account.mfaChanged`) **samo ako je faktor zaista uklonjen**. Redis kvar se loguje i ne
  obara tranziciju — durable cutoff već odbija tokene.
- Razlozi revokacije (`SessionRevokeReason`): `deactivated`, `identity_link`, `identity_unlink` (prvi je postojao
  ali se nigdje nije koristio).

**Ulazi:**

- `updateUser` — prima opcioni `securityBoundary`; kod `isActive: true → false` poziva `cutWithinTransaction`
  **unutar iste transakcije** koja piše status, pa `afterCommit` poslije commita. Reaktivacija **ne** radi cut i
  **ne** podiže cutoff.
- `linkUserDirectoryIdentity` — cut unutar link-transakcije (`transition: 'directory_linked'`), prije audit reda.
- `unlinkUserDirectoryIdentity` — cut u `beforePasswordUpdate` hooku, tj. unutar transakcije koja upisuje novi
  temporary password (`transition: 'directory_unlinked'`).
- `UsersService` injektuje `AccountSecurityBoundaryService` (value import; `@Optional()` samo da stare pozicione
  konstrukcije u testovima ostanu validne — modul ga uvijek daje).

**Audit:** nova akcija `auth.security_transition_applied` (kompatibilnost `user`, schema `restricted`, allowlist
`cutoffAt`, `mfaFactors`, `passkeys`, `recoveryCodes`, `sessions`, `transition`). Frontend mirror:
`knownAuditActions` + šest metadata polja + `bs`/`en` labele.

**Politika (dokumentovana odluka):** tranzicija koja mijenja identitet ili suspenduje račun **gasi lokalni factor
lifecycle** — korisnik ponovo upisuje MFA poslije reaktivacije/re-linka. Zadržati faktor koji je upisao prethodni
nosilac identiteta je upravo rupa koju nalaz opisuje. Recovery kodovi se ne čuvaju „za svaki slučaj"; novi set se
izdaje pri sljedećem upisu MFA.

**Nije dirano:** reset-password i MFA reset (već revokuju), `deleteUser`, directory-sync deaktivacija (već zove
`revokeAllForUser`, ali ne čisti faktore — otvorena susjedna tema, nije dio ovog nalaza), API ugovor ruta.

## Direktni testni dokaz

- `account-security-boundary.service.spec.ts` (**5/5**): cutoff + `exceptJti: null` u jednom `user.update`;
  `userSession.updateMany` sa razlogom i akterom; brisanje sva tri skupa faktora; `afterCommit` mapira razlog po
  tranziciji, piše audit sa prebrojanim rezultatom, notifikuje vlasnika **samo** kad je faktor uklonjen i **ne
  pada** kad Redis padne.
- `update-user.security-boundary.spec.ts` (**4/4**): cut dobija **transakcioni** klijent (ne outer client) i red
  je `cut → afterCommit`; **fault test** — kad cut baci, `updateUser` odbija i `afterCommit` se ne zove; reaktivacija
  i profile-only izmjena ne diraju boundary.
- `identity-transition.security-boundary.spec.ts` (**2/2**): link cut unutar link-transakcije sa
  `transition: 'directory_linked'`; unlink cut unutar password-transakcije sa `'directory_unlinked'`.
- `account-security-boundary.integration.spec.ts` (**novo, pravi PostgreSQL**):
  - deaktivacija: `tokensInvalidBefore` postavljen, `exceptJti` očišćen, obje sesije `revokedReason='deactivated'`,
    MFA/recovery/passkey redovi obrisani, audit red sa `{transition:'deactivated', sessions:2, passkeys:1,
    mfaFactors:1, recoveryCodes:2}`, notifikacija izdata;
  - **fault/rollback**: cut koji prvo upiše pa baci → cijela deaktivacija se vraća (račun ostaje aktivan, cutoff
    `null`, sesije nerevokovane, faktori na broju, nema audit reda);
  - link: `isLocalOnly=false`, `localPasswordHash=null`, sesije `identity_link`, faktori obrisani, audit red
    postoji **iako je Redis akcelerator pao** (durable polovina je dovoljna);
  - unlink: `isLocalOnly=true`, `mustChangePassword=true`, sesije `identity_unlink`, faktori obrisani;
  - reaktivacija: cutoff **ostaje** isti (stari tokeni ostaju mrtvi), faktori se ne vraćaju.

## CI i testni dokaz

PR run [`45829219995`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45829219995) na
`eacc528` — **svi poslovi zeleni iz prvog pokušaja, bez reruna**:

| Posao | Rezultat |
| --- | --- |
| `Backend build + test` | **success** — jedinični suiteovi uključuju tri nova boundary spec-a (11 testova) |
| `Backend PostgreSQL + Redis integration` | **success** — izvršava novi `account-security-boundary.integration.spec.ts` (deaktivacija, rollback fault, link sa padom Redisa, unlink, reaktivacija) |
| `Frontend build + test` | **success** — `knownAuditActions` + metadata polja + `bs`/`en` labele |
| `Backend container + supply chain` | success |
| `Docs guard` | **success** — registar/plan/JSON usklađeni (`698 nalaza, zatvoreno 351/otvoreno 347`) |
| `E2E critical flows` | **success** — `27 passed, 0 failed, 0 flaky, 0 skipped`, `errors: []` (uključuje `38-users-groups-rbac` deaktivaciju) |
| `E2E install wizard` | skipped (workflow ga pokreće samo za instalacijske promjene) |
| `Read-only service-form pattern inventory` | skipped (nema izmjene service-form obrasca) |
| `CI gate` | **success** |
| k6 smoke [`45829219934`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45829219934) | success |

**Neuspjeli pokušaji:** nema — paket je zelen iz prvog prolaza, bez ijednog reruna.

## Ispravka dokaza (W2.23, 2026-10-29)

`account-security-boundary.integration.spec.ts` **nije bio registrovan** u `backend/scripts/run-isolated-integration.mjs`,
pa ga izolovani PostgreSQL runner u ovom CI prolazu nije izvršio (u `Backend build + test` se preskočio bez
`PRIVACY_IT_DATABASE_URL`). Registrovan je u W2.23, zajedno sa guard testom koji takav propust sprječava — i
**prvi stvarni prolaz kroz PostgreSQL našao je dva defekta** koje lokalni skip nije mogao pokazati:

1. **Dokaz je tvrdio više nego što je mjerio.** Spec je čitao `prisma.auditLog` red, a injektirao je *snimajući*
   lažni notifier — pa tri od pet slučajeva nisu mogla proći (red nikad nije nastajao). Ispravka: boundary se
   gradi sa **pravim** `AccountSecurityNotifier(prisma)`, pa su audit red i obavještenje vlasnika stvarni redovi;
   deaktivacija sada tvrdi i `Notification` red sa dedupe ključem
   `security-transition:<userId>:deactivated:<cutoffAt>`.
2. **Count je nestajao u redakciji.** Audit policy redaktuje svaki ključ koji odgovara `recovery.?code`, pa je
   `recoveryCodes: 2` u metadata postajalo `"[REDACTED]"` — audit trag je gubio broj. Ključ je preimenovan u
   **`recoveryFactors`** (broj, ne kod); allowlista šeme, frontend katalog/polja i labele `bs`/`en` su ažurirani.

Ostali dokazi iz tabele iznad (unit/controller/frontend/E2E) su izvršeni kako je navedeno. Prvi stvarni
PostgreSQL prolaz (PR run `45876845930`, SHA `7a925419`) je sada **zelen: 5/5**.

## Registar nalaza

- `BA-users-03` → **zatvoreno (W2.22)** u `docs/backend/audits/04-users.md` (+ implementacijski status u §9).
- Ledger red `W2.22` u `docs/backend/EXECUTION-PLAN-REMAINING.md`.
- Regenerisano guardom `audit:traceability --write` (registar, master plan, plan JSON, audit README).

## DB/migracija/rollout

- **Nema migracije.** Koriste se postojeće kolone (`User.tokensInvalidBefore`, `tokensInvalidBeforeExceptJti`) i
  postojeće tabele (`UserSession`, `UserMfa`, `UserMfaRecoveryCode`, `UserPasskeyCredential`).
- Rollout bez koraka. Rollback je vraćanje fajlova; efekat je „od sada tranzicije brišu faktore" — nema podataka
  koje treba migrirati.
- Kompatibilnost API-ja: statusni kodovi i tijela ruta nepromijenjeni. Mijenja se **posljedica** tranzicije
  (sesije i faktori), što je i bio cilj nalaza.

## Lokalna provjera i ograničenja

- `npx jest src/modules/users src/modules/authentication/security` → **44 suites passed / 1 skipped, 267 testa**
  (skip = DB integracija bez `PRIVACY_IT_DATABASE_URL`).
- `npx tsc --noEmit -p tsconfig.json` → bez greške u fajlovima paketa (jedina greška je preegzistentna
  `announcement-delivery.spec.ts:310` TS2835, van paketa).
- `npx eslint` na svim diranim fajlovima → 0 grešaka/0 upozorenja.
- `npm run wiring:check` → `✓ backend route policy: 99 controllera, 633 ruta`; `npm run i18n:check` →
  `9386 keys, bs/en parity ok`.
- Integracijski spec je lokalno `skipped` (nema PostgreSQL-a); izvršava ga posao
  `Backend PostgreSQL + Redis integration`.
- Frontend: ovaj sandbox nema `frontend/node_modules`, pa su frontend testovi i `tsc` pokriveni CI poslom
  `Frontend build + test`.

## Rizik

- **Deaktivacija je sada destruktivnija po faktore.** Reaktivirani korisnik mora ponovo upisati MFA. To je svjesna,
  dokumentovana politika: faktor upisan prije suspenzije nije dokaz o istom nosiocu identiteta.
- **Uklanjanje faktora je u transakciji sa statusom**, pa neuspjeh brisanja obara deaktivaciju. Alternativa
  (deaktivirati pa čistiti kasnije) vraća tačno onu rupu koju nalaz opisuje.
- **`afterCommit` je best effort** po dizajnu; ako Redis padne, revokacija je i dalje durable kroz
  `tokensInvalidBefore`, a propust je vidljiv u `warn` logu.
- **Directory-sync deaktivacija** (LDAPS full sync) revokuje sesije ali ne čisti faktore — susjedni nalaz, ostaje
  otvoren i nije prećutan ovdje.

## Granica paketa

- Nije dirana šema, migracije, seed, ni directory-sync put.
- Nije diran W2.21 clone put, W2.18 CAS ni reset-password/MFA-reset revokacija.
- E2E nije mijenjan: `38-users-groups-rbac` deaktivira svjež lokalni korisnik bez faktora, pa je tok nepromijenjen.

## Sljedeći paket

**W2.23 — `BA-security-02` (P1):** bulk reset ostavlja aktivne sesije nakon parcijalnog kvara. Nije započet prije
zelenog CI-ja za ovaj paket.
