# W2.16 — `BA-authentication-03`: atomski single-use MFA token i potvrda enrollmenta

**Paket:** W2.16<br>
**Nalaz:** `BA-authentication-03` (P1) — zatvoren<br>
**Kodni commit:** `43bcf2a`<br>
**Finalni testani SHA:** `43bcf2a`<br>
**CI:** [`45707676523`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45707676523) — zelen<br>
**DB migracije:** **da** — `20271202150000_w216_mfa_token_claim` (aditivna, bez odobrenja za destruktivni SQL)

## Nalaz

MFA token (`jti`) je bio „single-use" samo kroz **best-effort Redis marker** koji se pisao **poslije** svega
ostalog:

```ts
// prije W2.16
const { claims, user } = await this.readMfaToken(input.mfaToken, 'verify'); // 1. provjera
const method = await this.limiter.guardMfaCode(..., () => this.mfaService.verify(user, code)); // 2. kod
const recoveryCodes = await this.mfaService.confirmEnrollment(user, code);   // 3. promjena stanja
await this.sessionTokenService.consumeMfaToken(claims);                      // 4. marker (može pasti)
return this.issueSession(...);                                               // 5. sesija
```

Tri posljedice:

1. **Dvije paralelne potvrde istog tokena** obje prođu korak 1 (nema atomskog claima), obje prođu korak 3
   (`confirmEnrollment` je radio `findUnique` → provjera `enabledAt` → `update`), pa obje izdaju sesiju i obje
   vrate **vlastiti** set recovery kodova — od kojih je samo zadnji u bazi. Korisnik dobije 10 kodova od kojih
   većina ne radi, a dvije sesije su izdate za jedan token.
2. **Pad Redisa** (ili `safe()` koji grešku samo loguje) znači da korak 4 ne zapiše ništa, pa se isti MFA token
   može ponovo iskoristiti do isteka — bez ijednog signala korisniku ili operateru.
3. **Enrollment update** nije nosio identitet onoga što je pročitano (`enabledAt: null` + pending secret), pa je
   između čitanja i upisa bilo moguće pregaziti tuđu promjenu.

## Promjena

**PostgreSQL je autoritet, Redis ostaje akcelerator** — ista podjela kao u `W2.15` za legacy cut-off.

1. **Nova tabela `MfaTokenClaim`** (`jti` je primarni ključ, `subjectId`, `stage`, `claimedAt`, `consumedAt`
   nullable, indeks nad `claimedAt`) i aditivna migracija `20271202150000_w216_mfa_token_claim`.

2. **`MfaService` — tri operacije, svaka jedno SQL naredba:**

   ```ts
   claimSignInToken(jti, subjectId, stage, now)   // INSERT; P2002 ⇒ pokušaj takeover-a
   consumeSignInToken(jti, now)                   // consumedAt = now + trim po retentionu
   releaseSignInToken(jti)                        // DELETE gdje consumedAt IS NULL
   ```

   - **INSERT je claim.** `jti` je primarni ključ, pa baza, a ne aplikacijska provjera, odlučuje ko je prvi.
     Gubitnik dobija `P2002` i `false`; svaka druga greška se **propagira** (baza koja ne radi nije replay).
   - **Lease 30 s.** Claim bez `consumedAt` stariji od 30 s (proces je pao između claima i potvrde) može se
     preuzeti: `UPDATE … WHERE jti = ? AND consumedAt IS NULL AND claimedAt < now - 30 s`, i to samo ako je
     zahvatio tačno jedan red. Claim u letu se ne krade.
   - **Retention 24 h.** `consumeSignInToken` uz `consumedAt` briše redove starije od 24 h — jedan `DELETE` po
     indeksu, bez skena; tabela je time ograničena brojem MFA prijava u danu.
   - **`releaseSignInToken`** briše **samo** nekontumiran claim; konzumiran claim se nikad ne vraća u promet.

3. **`MfaService.confirmEnrollment` — compare-and-set u transakciji.** Umjesto „pročitaj pa upiši":

   ```ts
   await this.prisma.$transaction(async (tx) => {
     const claimed = await tx.userMfa.updateMany({
       where: {
         userId,
         enabledAt: null,
         pendingSecretEncrypted: row.pendingSecretEncrypted,   // identitet pročitanog
         pendingCreatedAt: { gt: new Date(now - TTL) },        // još nije istekao
       },
       data: { secretEncrypted, enabledAt: now, lastUsedStep, lastUsedAt, pendingSecretEncrypted: null, pendingCreatedAt: null },
     });
     if (claimed.count === 0) throw new AccountSecurityError('MFA_ALREADY_ENABLED');
     await tx.userMfaRecoveryCode.deleteMany({ where: { userId } });
     await tx.userMfaRecoveryCode.createMany({ data: codes.map(...) });
   });
   ```

   Predikat je tačno ono što je pročitano, pa drugi pisac ne može pregaziti prvi; recovery set se piše u
   **istoj** transakciji, pa gubitnik ne ostavlja ni djelimičan set. `count === 0` je `MFA_ALREADY_ENABLED`
   (409), ne 500 — dva paralelna potvrđivanja su očekivan race, ne kvar.

4. **`AuthenticationService` — claim prije, consume prije sesije, release na grešku.**

   | korak | prije | sada |
   | --- | --- | --- |
   | provjera tokena | `readMfaToken` | **`claimMfaToken`** (`readMfaToken` + `claimSignInToken`; `false` ⇒ 401 `INVALID_CREDENTIALS`) |
   | provjera koda | limiter → `verify`/`verifyAssertion`/`confirmEnrollment` | isto, uz `.catch` koji **release-uje** claim |
   | potrošnja | `consumeMfaToken` (Redis) | **`consumeMfaToken`** = `consumeSignInToken` (baza) **pa** `consumeMfaToken` (Redis) |
   | sesija | `issueSession` | `issueSession` — samo ako je claim konzumiran |

   Replay sada dobija **`401 INVALID_CREDENTIALS`**, identično kao nevažeći token: korak provjere koda se **ne
   izvršava**, pa čak ni tačan kod ne potvrđuje da je token bio valjan (nema oraklja). Release se zove samo za
   claim koji je **ovaj** zahtjev uzeo.

**Nije mijenjano:** `startMfaEnrollment` (svjesno ostaje na `readMfaToken` — QR/secret se smije ponovo prikazati,
token se troši tek na potvrdi), `startMfaPasskey` (challenge se veže na `jti`, ne troši token), `verify()`
TOTP step CAS (`W2.6`), passkey counter, rute, DTO-ovi, frontend.

**Svjesno prihvaćena cijena:** jedan `INSERT` + jedan `UPDATE`/`DELETE` po MFA prijavi (dvije naredbe na putu koji
je već radio nekoliko upita), plus jedna tabela koja se trimuje na svakoj potrošnji. Alternativa — `SELECT … FOR
UPDATE` nad `UserMfa` — ne pokriva replay poslije commita i drži bravu duže; odbačena je.

## Dokaz

**Unit — `security/mfa-enrollment.spec.ts`** (novi describe „confirmation is a single-use compare-and-set"):

- `lets exactly one of two parallel confirmations win: one recovery set, one failure` — `Promise.allSettled`
  dvije potvrde istog koda; tačno jedan `fulfilled`, gubitnik `MFA_ALREADY_ENABLED`, **10** kodova ukupno;
- `refuses a second confirmation through the same account, without a new set`;
- `writes no recovery codes when the compare-and-set loses to a concurrent enable` — druga replika je uključila
  MFA između čitanja i upisa; gubitnik ne piše ni jedan kod.

**Unit — isti fajl, describe „durable MFA token claim"** (fake koji modelira SQL semantiku predikata):

- `lets exactly one of two requests claim the same jti`;
- `refuses a replay of a consumed claim`;
- `gives a rejected claim back, so the same token can be retried`;
- `never releases a consumed claim`;
- `takes over a claim abandoned inside the lease only, not an in-flight one` (30 s granica, obje strane);
- `trims claims past the retention window when a token is consumed`;
- `propagates a real database fault instead of treating it as a replay` (`P1017` ⇒ izuzetak, ne `false`).

**Unit — `authentication.service.spec.ts`** (novi describe „MFA token claim"):

- `claims the token before the code is even looked at` (redoslijed preko `invocationCallOrder`);
- `consumes the claim before the session is written, never after`;
- `answers a replayed token with 401 INVALID_CREDENTIALS and touches nothing` (`verify` se ne zove, claim se ne
  release-uje);
- `gives the claim back after a rejected code so the same token can be retried`;
- `releases the claim only while it is unconsumed` (uspješna prijava ne release-uje);
- `keeps the replay closed even when the redemption store (Redis) is down` — **Redis failure iz nalaza**:
  `consumeMfaToken` (Redis) baca, ali je durable claim već konzumiran, sesija nije izdata i claim se ne vraća;
- `claims the enroll token before the pending secret can be confirmed`;
- `releases the enroll claim when the confirmation is refused`.

Passkey grana: postojeći test odbijene asertacije sada tvrdi i `releaseSignInToken('mfa-jti-1')` uz
`consumeSignInToken` koji **nije** pozvan.

**Integracija — `mfa-token-claim.integration.spec.ts`** (realni PostgreSQL, isolated runner):

- `hands the same jti to exactly one of two parallel requests, and never again after use` — dva paralelna
  `INSERT`-a; tačno jedan `true`, jedan red u tabeli; poslije `consumeSignInToken` replay je `false`, a
  `releaseSignInToken` ga **ne** oživljava;
- `lets exactly one of two parallel enrollment confirmations win, with one recovery set` — pravi `startEnrollment`
  + dvije paralelne `confirmEnrollment` nad istim kodom; jedan uspjeh, jedan `MFA_ALREADY_ENABLED`, `enabledAt`
  postavljen, `pendingSecretEncrypted` očišćen i **tačno 10** recovery kodova (provjereno i `status()`-om, tj.
  brojem koje korisnik stvarno može iskoristiti).

Sa starim kodom padaju svi testovi koji tvrde claim/consume/release semantiku (**11** novih unit testova + 2
integracijska); sa popravkom zeleni. Lokalno: `authentication.service.spec.ts` **45/45**, `security/mfa-*.spec.ts`
**19/19**, `database-runtime-contract.spec.ts` **4/4**, `node --test scripts/run-isolated-integration.test.mjs`
(guard 23/23), `npm run db:migration-policy:check` ✓ **129** migracija, `eslint` zelen na svim dodirnutim fajlovima.
Lokalni `jest` nad cijelim `authentication` modulom ima 9 suite-ova koji ne mogu ni da se učitaju
(`Cannot find module '../../generated/prisma/client'`) — posljedica toga što `prisma generate` ne radi u
sandboxu; te suite pokriva CI.

## Sigurnost i performanse

- **Sigurnost:** single-use više ne zavisi od dostupnosti Redisa ni od redoslijeda koraka. Claim je prvi korak, pa
  dva paralelna zahtjeva ne mogu oba proći; sesija se izdaje samo poslije konzumiranog claima. Replay je
  nerazlučiv od nevažećeg tokena (`401 INVALID_CREDENTIALS`). Konzumiran claim se ne može osloboditi, pa ni
  greška u kasnijem koraku ne otvara replay — fail-closed.
- **Performanse:** MFA prijava = `INSERT` (claim) + `UPDATE` (consume) + `DELETE` (trim) + jedan `DELETE`
  (release) samo na odbijeni kod; sve po primarnom ključu ili indeksu `claimedAt`, bez skena.
- **Rast podataka:** najviše jedan red po MFA prijavi u 24 h, trimovan na sljedećoj potrošnji; tabela je
  samo-čisteća, bez scheduled joba.
- **Kompatibilnost:** migracija je aditivna (`CREATE TABLE` + `CREATE INDEX`), bez backfilla. Stari tokeni izdati
  prije deploya **nemaju** claim red — prvi zahtjev ga INSERT-uje, pa je ponašanje za njih identično novima.

## CI

CI [`45707676523`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45707676523) na `43bcf2a` —
**success**, bez ijednog crvenog pokušaja:

- **Backend build + test** — `prisma validate`, `db:generate`, `nest build`, lint, `test:safety-net:compile`,
  `test:wiring`, `audit:traceability` (698/698), **`db:migration-policy:check`** (**129** migracija, aditivna
  migracija bez odobrenja), puni unit suite (uključuje 11 novih W2.16 testova).
- **Backend PostgreSQL + Redis integration** — `db:roles:provision`, `db:migrate:release` (nova tabela se
  primjenjuje na praznu bazu), `db:privileges:verify`, `prisma migrate status`, `db:budget:check`,
  `db:restore:test` i isolated suite, uključujući novi `mfa-token-claim.integration.spec.ts` (u listi runnera i
  u guard testu; `PRIVACY_IT_DATABASE_URL` je postavljen u tom poslu, pa se ne preskače).
- **Frontend build + test**, **Backend container + supply chain**, **Docs guard**, **CI gate:** success.
- **Skipped:** E2E poslovi (push profil) i read-only inventory (E2E se izvršava na PR-u, vidi niže).
- **Perf smoke** [`45707676445`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45707676445):
  success, `perf_query_budget` avg **2,075** (gate 2,1), p95 **3**, 50.799 zahtjeva — MFA put nije u smoke
  profilu, pa ova kapija mjeri da paket nije dirao vruće rute.

**PR [#31](https://github.com/mudzy992/help-desk-enterprise/pull/31)** — CI
[`45710816624`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45710816624): prvi prolaz je pao u
**`E2E critical flows`**, i to **ne na MFA putu**: `15-workflow-unrouted-realtime.spec.ts:275` („a routing change
reaches the admin room over the socket") nije dobio socket event u 10 s, a Playwright dijagnostika iz istog runa je
zabilježila **stack outage** (`GET /health` nedostupan u 22:18:02Z) — infrastrukturni prozor, ne regresija koda.
`gh run rerun --failed` je zelen: E2E `success`, `CI gate success`. Pouka: socket-realtime testovi padaju sa
padom stacka, pa crveni E2E sa outage dijagnostikom treba prvo rerun, a ne „popravku" koda.

Migracija je prošla kroz **tri** svjesne izmjene iz `W2.15` (migracija, `expectedSchemaMigration`, literalni pin u
`database-runtime-contract.spec.ts`) — sve tri su urađene prije prvog pusha, zato push-run nije bio crven zbog
sentinela.

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-03` → `zatvoreno (W2.16)` i detaljni nalaz
  dobija „Implementacijski status".
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.16`.
- Regenerisano guardom `audit:traceability`: **698 nalaza**, `zatvoreno 345 / otvoreno 353` (P1 174 — nalaz je
  zatvoren, ne dodat).

## Vizuelna provjera (ručni koraci)

1. Prijavi se sa MFA nalogom; na ekranu za kod otvori isti ekran u drugoj kartici (isti `mfaToken`) i pošalji
   tačan kod u obje: **jedna** dobija sesiju i recovery kodove, druga `409 MFA_ALREADY_ENABLED` (enrollment) ili
   `401 INVALID_CREDENTIALS` (verifikacija).
2. Pošalji pogrešan kod, pa tačan u istom tokenu: drugi pokušaj prolazi (claim je vraćen) — nema novog logina.
3. U DevToolsu ponovi zahtjev sa **istim** `mfaToken` poslije uspješne prijave: `401 INVALID_CREDENTIALS`, bez
   `set-cookie`.
4. Zaustavi `redis` container i pokušaj MFA prijavu: server vraća grešku (nema sesije), ali **isti** token poslije
   ne prolazi ni kad Redis vrati — durable claim je konzumiran.

## Granica paketa

- `BA-authentication-04`…`-08` ostaju otvoreni i netaknuti.
- Tabela claimova nema FK na `User`: claim je kratkotrajan (24 h) i mora preživjeti brisanje naloga do isteka
  tokena; `subjectId` je samo revizorski podatak.
- Housekeeping je „trim na potrošnji", ne scheduled job — ako MFA prijava stane, stari redovi čekaju prvi sljedeći
  uspjeh. Alternativa (cron) je odbačena: dodatni pokretni dio za tabelu koja je po definiciji mala.
- `stage` je `VarChar(16)` i nije enum: vrijednosti su `verify`/`enroll` i kontroliše ih server, pa bi enum
  zahtijevao migraciju za svaku buduću fazu bez sigurnosne koristi.

## Sljedeći paket

**W2.17 — `BA-authentication-04` (P2):** `DELETE /auth/sessions/:sessionId` traži UUID, a `UserSession.id` je
CUID — opoziv pojedinačne sesije pada na `400` prije provjere vlasništva.
