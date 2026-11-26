# W2.21 — `BA-authentication-08`: clone incident briše samo pogođeni passkey

**Paket:** W2.21 — revokacija kloniranog passkeya bez kolateralne štete<br>
**Nalaz:** `BA-authentication-08` (P3) — **zatvoren**<br>
**Kodni commit:** `b4c14d1`<br>
**Finalni testani SHA:** `6c3fc98`<br>
**CI:** [`45809614730`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45809614730) — **zelen** (svi poslovi, E2E 27/27)<br>
**DB migracije:** nema (nema promjene šeme)

## Nalaz i acceptance

`verifyAssertion` je clone granu rješavao jednim potezom:

```ts
if (Number(credential.counter) > 0 && newCounter <= Number(credential.counter)) {
  await this.prisma.userPasskeyCredential.deleteMany({ where: { userId } });
  throw new AccountSecurityError('PASSKEY_CLONED');
}
```

Tri posljedice, sve tri stvarne:

1. **Kolateralna šteta.** Jedan kloniran (ili samo neispravan) authenticator briše **sve** passkeye
   korisnika — nezavisni uređaji prestaju raditi bez svog uzroka. To je lockout/DoS površina: dovoljno je
   jednom pogrešno implementirati brojač na jednom uređaju.
2. **Gubitak forenzike.** Red koji je izazvao incident nestaje zajedno sa dokazom: nema zapisa koji uređaj,
   koji AAGUID, koji brojači.
3. **Nema obavijesti.** Korisnik sazna da su mu passkeyi nestali tek pri sljedećoj prijavi.

**Acceptance (iz audit nalaza):** clone test ostavlja **drugi** credential aktivnim i stvara
**audit/notification** dokaz. Ispunjeno i dokazano ispod; uz to je sačuvan W2.18 invariant da gubitnik
compare-and-set race-a **nije** clone i ne smije ništa brisati.

## Implementacija

`backend/src/modules/authentication/security/passkey-credential.service.ts`

- Clone grana više ne briše po korisniku. Poziva `revokeClonedCredential(userId, snapshot, ip)` koji radi
  `deleteMany({ where: { id: credential.id, userId } })` — **samo** pogođeni red i **samo** unutar
  korisnikovog namespacea. `deleteMany` (a ne `delete`) je namjerno: predikat nosi provjeru vlasništva u istom
  statement-u, a dupla asertacija istog credentiala je no-op umjesto `P2025` greške. Uslov `id` ostaje u
  predikatu da paralelna **re-registracija** istog `credentialId` (novi red, novi `id`) ne bude obrisana.
- Prije brisanja se čita snapshot (`deviceName`, `aaguid`, `counter`); nakon brisanja `countCredentials(userId)`
  daje broj preostalih passkeya. Counter se **nikad** ne pomjera unazad: clone put i dalje izlazi prije
  CAS upisa (`updateMany({ where: { id, counter } })` iz W2.18 nije diran), pa nema upisa ni na pogođenom ni
  na preostalim redovima.
- **Audit:** nova akcija `auth.mfa_passkey_clone_detected` (`audit-log.constants.ts`) sa snapshotom
  `{ aaguid, credentialFingerprint, deviceName, ip, presentedCounter, remainingPasskeys, removed, storedCounter }`.
  `credentialFingerprint` je prvih 16 hex znakova `sha256(credentialId)` — dovoljno za korelaciju sa
  enrollment zapisom, bez nošenja samog credential ID-a u audit. Svi ključevi su u allowlisti
  (`audit-action-schema-registry.ts`, senzitivnost `restricted`), akcija je u kompatibilnostnom registru
  (`user`) i scope registru (`producer`).
- **Obavijest:** novi tip `account.passkeyCloneDetected` u always-on kategoriji `account.security`
  (`inAppOnly`), sa `dedupeKey = passkey-clone:<userId>:<rowId>`; tijelo nosi naziv uređaja (ili AAGUID) koji
  korisnik treba ponovo registrovati.
- **Log:** `warn` red `passkey clone detected for user …: credential <fingerprint> removed (stored counter X,
  presented Y), N other credential(s) kept` — operator u logu vidi isti incident i bez čitanja audit tabele.
- **Ne mijenja se:** recovery kodovi, ostali passkeyi, `removeCredential`/`renameCredential`, W2.18 CAS
  ponašanje i `MFA_INVALID_CODE` odgovor za izgubljeni race. API ugovor je nepromijenjen — klijent i dalje
  dobija `401 PASSKEY_CLONED`.

Frontend mirror (da audit ekran i zvonce ne prikazuju sirove ključeve):

- `frontend/src/lib/audit/audit-log-actions.ts` — `auth.mfa_passkey_clone_detected` u `knownAuditActions`
  (spec `admin-ops-i18n-coverage.spec.ts` traži tačno poklapanje sa backend enumom);
- `frontend/src/lib/audit/audit-log-fields.ts` — osam novih metadata polja;
- `frontend/src/lib/notifications/notification-kind.ts` — mapiranje `account.passkeyCloneDetected`;
- `bs`/`en` `common.json` — `admin.ops.auditLog.labels.actions.auth_mfa_passkey_clone_detected`,
  `admin.ops.auditLog.labels.fields.*` i `notifications.items.accountPasskeyCloneDetected`.

## Direktni testni dokaz

- `backend/src/modules/authentication/security/passkey-credential.service.spec.ts` — **26/26**:
  - `revokes only the cloned credential and keeps the other passkeys active` — dva passkeya na nalogu,
    clone na prvom: tačno jedan `deleteMany`, i to `{ where: { id: 'row-1', userId: 'u-1' } }`, bez CAS
    upisa. Ovo je acceptance kriterij „drugi credential ostaje aktivan“ na nivou poziva.
  - `keeps the incident: audit snapshot and owner notification on a clone` — audit akcija
    `auth.mfa_passkey_clone_detected` sa `presentedCounter 4 / storedCounter 5 / remainingPasskeys 2 /
    removed 1`, fingerprint dužine 16 i **bez** credential ID-a u serijalizovanom metadata; notifikacija
    `account.passkeyCloneDetected`, tijelo = naziv uređaja, `dedupeKey = passkey-clone:u-1:row-1`.
  - `does not revoke anything when the counter simply advanced` — counter naprijed = nema brisanja i nema
    clone audita (granica prema W2.18).
  - postojeći `cuts the factor off when the authenticator counter goes backwards` sada tvrdi novi predikat
    (`{ id, userId }`) umjesto starog `{ userId }` — regresija bi odmah pala.
  - W2.18 testovi (race, counterless, nestali red) prolaze nepromijenjeni: gubitnik CAS-a i dalje ne briše
    ništa.
- `backend/src/modules/authentication/passkey-clone-revocation.integration.spec.ts` — **novo**, pravi
  PostgreSQL: dva credentiala (`counter 5` i `counter 7`), klon na prvom (`newCounter 4`):
  - obrisan je **samo** prvi red; drugi postoji i njegov `counter` je i dalje `7`; `count == 1`;
  - u `AuditLog` postoji red `auth.mfa_passkey_clone_detected` sa očekivanim snapshotom i fingerprintom
    `sha256(credentialId)[0:16]`, i metadata **ne sadrži** credential ID;
  - u `Notification` postoji red `account.passkeyCloneDetected` za korisnika, sa naslovom iz
    `notificationTitleKeys` i `dedupeKey` prefiksom `passkey-clone:<userId>:`.
- `backend/src/modules/notifications/preferences/notification-preference-catalog.spec.ts` i
  `audit-log/*registry*.spec.ts` — exhaustivne liste (svaka akcija mora biti u sva tri registra, svaki tip
  u katalogu preferencija) prolaze sa novim unosima.

## CI i testni dokaz

Pokretni PR run [`45809614730`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45809614730) na
`6c3fc98` — **svi poslovi zeleni, bez reruna**:

| Posao | Rezultat |
| --- | --- |
| `Backend build + test` | **success** — jedinični suiteovi, novi `passkey-credential.service.spec.ts` (26/26), exhaustivni registri audit akcija i katalog preferencija |
| `Backend PostgreSQL + Redis integration` | **success** — uključuje novi `passkey-clone-revocation.integration.spec.ts` na pravom PostgreSQL-u |
| `Frontend build + test` | **success** — `knownAuditActions`/metadata polja/notifikacija + `bs`/`en` labele, i18n parity |
| `Backend container + supply chain` | success |
| `Docs guard` | **success** — registar/plan/JSON usklađeni (`698 nalaza, zatvoreno 350/otvoreno 348`) i docs guard sam sa sobom |
| `E2E critical flows` | **success** — `Playwright (results.json): 27 passed, 0 failed, 0 flaky, 0 skipped`; `errors: []` |
| `E2E install wizard` | skipped (workflow ga pokreće samo za instalacijske promjene) |
| `Read-only service-form pattern inventory` | skipped (nema izmjene service-form obrasca) |
| `CI gate` | **success** |
| Perf smoke [`45809614466`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45809614466) | success |

**Okolnosti pokretanja (zapisano, ne prećutano):** prvo je pokrenut i triage dispatch `45809616641`
(`specs=42`), pa **otkazan** prije ijednog testa — PR run je već pokretao `E2E critical flows` na istom
dijeljenom stacku, a dva paralelna E2E prolaza sa jednim TOTP secretom su uzrok ranijih `MFA_INVALID_CODE`
padova (W2.20). Dokaz ovog paketa je zato PR run iznad, a ne otkazani dispatch.

**Neuspjeli pokušaji:** nema — ovaj paket je zelen iz prvog pokušaja.

## Registar nalaza

- `BA-authentication-08` → **zatvoreno (W2.21)** u `docs/backend/audits/01-authentication.md` (+ implementacijski
  status u §9).
- Ledger red `W2.21` u `docs/backend/EXECUTION-PLAN-REMAINING.md`.
- Regenerisano guardom `audit:traceability --write` (registar, master plan, plan JSON, audit README).

## DB/migracija/rollout

- **Nema migracije.** Nema promjene šeme: koristi se postojeći `UserPasskeyCredential.deleteMany` opseg i
  postojeće `AuditLog`/`Notification` tabele.
- Rollout je bez koraka. Rollback je vraćanje fajla; jedina trajna posljedica su audit redovi i notifikacije
  nastali dok je nova grana bila aktivna (oni ostaju valjani dokaz).
- Kompatibilnost API-ja: nepromijenjen status i kod greške za klijenta (`401 PASSKEY_CLONED`). Mijenja se
  **posljedica** (koliko passkeya ostane), što je i bio cilj nalaza.

## Lokalna provjera i ograničenja

- `npx jest src/modules/authentication src/modules/audit-log src/modules/notifications` →
  **112 suites passed / 11 skipped, 743 testa prošlo / 26 skipped** (skip = DB/Redis integration bez
  `PRIVACY_IT_DATABASE_URL` i Redis-dependent suiteovi).
- `npx tsc --noEmit -p tsconfig.json` (`NODE_OPTIONS=--max-old-space-size=6144`) → jedna **preegzistentna**
  greška van paketa (`src/modules/announcements/announcement-delivery.spec.ts:310` TS2835, nedostaje `.js`
  ekstenzija u importu); nijedna greška u fajlovima ovog paketa.
- `npx eslint` na svih osam diranih backend fajlova → 0 nalaza.
- Frontend: `npm run i18n:check` → `9371 keys, bs/en parity ok` (novi ključevi u oba jezika).
  Ovaj sandbox nema `frontend/node_modules`, pa su frontend testovi i `tsc` pokriveni CI poslom
  `Frontend build + test`; to je navedeno kao ograničenje okruženja, ne kao dokaz prolaza.
- Integracijski spec je u lokalnom runu **skipped** jer nema PostgreSQL-a; izvršava ga posao
  `Backend PostgreSQL + Redis integration`.

## Rizik

- **Preostali passkeyi nakon incidenta dijele isti `credentialId` prostor.** Ako je napadač klonirao uređaj,
  drugi (nepogođeni) passkey je i dalje valjan — to je namjerno: bolje zadržati korisnikov pristup i poslati
  mu obavijest, nego ga zaključati. Globalni reset passkeya ostaje ručna radnja administratora
  (`removeCredential` po uređaju) i time auditovana.
- **`remainingPasskeys` je snimak u trenutku incidenta**, ne živa vrijednost. Ako korisnik u međuvremenu
  registruje novi uređaj, audit red ostaje istinit za taj trenutak.
- **Fingerprint je skraćen na 16 hex znakova** (64 bita) — dovoljno za korelaciju, svjesno nedovoljno za
  rekonstrukciju credential ID-a iz audita.
- Dedupe ključ sadrži ID reda, pa ponovljeni clone na **istom** redu ne pravi drugu notifikaciju (red je već
  obrisan, tako da je sljedeći incident novi red i nova notifikacija).

## Granica paketa

- Nije dirana šema, migracije, seed, ni `removeCredential`/`renameCredential` ponašanje.
- Nije diran W2.18 compare-and-set; clone odluka se i dalje donosi na pročitanim vrijednostima prije upisa.
- Nije diran E2E: nijedan postojeći E2E scenarij ne izaziva clone put (WebAuthn authenticator u E2E nije
  kloniran); dokaz je unit + PostgreSQL integration.
- `docs/backend/implementation/354-…md` §CI je dopunjen ranije (`8a3e12c`, PR #36) — ispravka E2E nalaza iz
  W2.20 nije dio ovog paketa.

## Sljedeći paket

**W2.22 — `BA-users-02` (P2):** kreiranje usera/passworda/role nije atomsko i autorizacija role dolazi
prekasno. Nije započet prije zelenog CI-ja za ovaj paket.
