# W2.15 — `BA-authentication-02`: durable cutoff za legacy JWT bez `sid`

**Paket:** W2.15<br>
**Nalaz:** `BA-authentication-02` (P1) — zatvoren<br>
**Kodni commit:** `77a0148` (+ `d2960e0` sentinel, `bd1c226` sentinel spec)<br>
**Finalni testani SHA:** `bd1c226`<br>
**CI:** [`45700024141`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45700024141) — zelen<br>
**DB migracije:** **da** — `20271202140000_w215_durable_legacy_token_cutoff`

## Nalaz

Token sa `sid` je od `W2.2` opozivao durable (`UserSession.revokedAt`). Token **bez** `sid` (legacy, izdan
prije uvođenja registra) nije imao šta durable opozvati, pa je njegov život visio o dva best-effort Redis
upisa:

- `SessionRevocationStore.revokeToken(jti)` — `auth:revoked-jti:{jti}` (logout, rotacija na refreshu);
- `revokeAllForUser(subject)` — `auth:sessions-valid-after:{sub}` (promjena lozinke, MFA reset,
  deaktivacija, admin `revoke-others`, directory sync, CLI `reset-mfa`).

Oba upisa idu kroz `safe()`, koji grešku **samo loguje**. Ako Redis odbije upis (kvara, failover, OOM,
read-only replika), API i audit prijave uspješan opoziv, a ukradeni token nastavi raditi do isteka — do
**1 h**. Guard nije imao durable fallback za taj oblik tokena, pa je garancija „logout prekida sesiju"
zavisila od dostupnosti keša.

## Promjena

**PostgreSQL je autoritet, Redis je akcelerator** — ista podjela koju `W2.2` već koristi za `sid` tokene.

1. **Šema (`identity.prisma`) + migracija**: `User.tokensInvalidBefore` (`DateTime?`) i
   `User.tokensInvalidBeforeExceptJti` (`String?`). Migracija je dva nullable `ADD COLUMN`-a; bez backfilla i
   bez `NOT NULL` prepreke za postojeće redove.
2. **Upis** — `SessionRevocationStore.revokeAllForUser()` poslije Redis pokušaja (koji i dalje može tiho
   pasti) upisuje cutoff u `User`:
   ```ts
   await this.safe(() => this.backend.revokeAllForUser(subjectId, nowSeconds, ttl, exceptions));
   await this.persistLegacyTokenCutoff(subjectId, nowSeconds, exceptions?.jti ?? null);
   ```
   Neuspjeh durable upisa je `Logger.error` (alarm „Redis je sada jedini cutoff"), ne izuzetak: korisnik je
   logout/promjenu lozinke već završio, a socket invalidation i `sid` redovi su već opozvani.
3. **Logout legacy tokena** (`AuthenticationService.logout`): kada `claims.sessionId === null`, poslije
   `revoke(claims)` poziva se `revokeAllForUser(claims.subjectId)` — dakle durable cutoff je taj koji garantuje
   prekid, a ne `jti` marker u Redisu. `sid` tokene ova grana ne dira (njih pokriva registry red).
4. **Čitanje** — legacy grana `check()`-a već radi `prisma.user.findUnique` za `isActive`/`mustChangePassword`;
   sada u istom `select`-u čita i cutoff i poredi `issuedAt` (sekunde):
   ```ts
   if (isBelowDurableLegacyCutoff(input, user.tokensInvalidBefore, user.tokensInvalidBeforeExceptJti))
     return { revoked: true };
   ```
   **Nula novih upita, nula novih round-tripova**: dvije kolone na redu koji se ionako čita. `exceptJti`
   zadržava tačno onaj token koji je `revoke-others` izuzeo, isto kao Redis payload.

Nije mijenjano: `sid` grana (`W2.11b` fusion), redis backend i njegovi ključevi/TTL-ovi, `revokeSession`,
`refresh()` (`W2.14`), guard (`W2.15a`), rute, DTO-ovi, frontend.

**Svjesno prihvaćena cijena:** cutoff je per-user, pa sign-out sa legacy tokena gasi **sve** legacy tokene tog
korisnika (druga stara sesija se mora ponovo prijaviti). Alternativa — per-`jti` durable tabela — traži novu
tabelu, cleanup i još jedno čitanje po zahtjevu; legacy tokeni su ograničena populacija (1 h život, nijedan
novi od registra), a preciznu opozivu ionako daje Redis dok je zdrav.

## Dokaz

Unit (`session-revocation.spec.ts`, novi describe „durable legacy token cutoff"):

- `rejects a legacy token issued at or before the durable cutoff` — granica uključena (`<=`), isto kao Redis
  backend;
- `accepts a legacy token issued after the cutoff`;
- `keeps the one caller token a revoke-others call exempted`;
- **`writes the cutoff to PostgreSQL even when the Redis write is rejected`** — fault injection iz nalaza:
  `redis.set` baca, `safe()` ga proguta, ali `prisma.user.update` je pozvan sa `tokensInvalidBefore`;
- `stores the exempted jti with the cutoff so revoke-others keeps the caller`;
- `still revokes on a failed Redis read even when the cutoff write failed too` — durable greška ne ruši
  završen logout i ne pretvara ga u 500.

Unit (`authentication.service.spec.ts`, novi describe „logout durability"):

- `revokes the registry row for a sid token and leaves the durable cutoff alone`;
- `writes the durable per-user cutoff for a legacy token that has no row`.

Sa starim kodom padaju **6** testova (svi osim dva koja provjeravaju nepromijenjenu `sid` granu); sa
popravkom **61/61** u oba fajla.

Integracija (`session-revocation.integration.spec.ts`, realni PostgreSQL, store **bez Redis-a** — memory
backend):

- `keeps a legacy token revoked when no Redis write ever happened` — jedini izvor `revoked: true` je baza;
- `preserves the caller token of a revoke-others call in the durable cutoff`;
- `does not apply the legacy cutoff to a sid token that still has a live row`.

## Sigurnost i performanse

- **Sigurnost:** opoziv sada preživljava Redis write outage, i to bez „degraded" režima — nema prozora u
  kojem API tvrdi da je token mrtav, a enforcement nije primijenjen. Fail-closed ostaje i na nečitljivu bazu
  (`session authority unavailable, failing closed`).
- **Performanse:** legacy grana je i prije čitala `User` red; dvije dodatne kolone ne mijenjaju broj upita ni
  round-tripova. `sid` grana (koju koristi cijela aplikacija nakon `2.1`) **nije dirana** — `W2.11b` perf
  kapija (2,072 ms / 50.624 upita) ostaje mjerodavna.
- **Rast podataka:** dvije kolone po korisniku; nema nove tabele, nema cleanup posla.

## CI

CI [`45700024141`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45700024141) na `bd1c226` —
**success**:

- **Backend build + test** — `prisma validate`, `db:generate`, `nest build`, lint, `test:safety-net:compile`,
  `test:wiring`, `audit:traceability` (698/698), **`db:migration-policy:check`** (128 migracija), puni unit
  suite.
- **Backend PostgreSQL + Redis integration** — `db:migrate:release` (migracija se primjenjuje na praznu bazu),
  `prisma migrate status`, restore drill i integracioni specovi, uključujući tri nova W2.15 testa.
- **Frontend build + test**, **Backend container + supply chain**, **Docs guard**, **CI gate:** success.
- **Skipped:** E2E jobovi (push profil).

**Dva crvena pokušaja i pouka za svaku buduću migraciju:**

| Run | Uzrok | Popravka |
| --- | --- | --- |
| [`45695700372`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45695700372) | `db:migration-policy:check` → `schema sentinel je stale: expected=20271202130000_group_fallback_cardinality` | `expectedSchemaMigration` u `database-runtime-contract.ts` (`d2960e0`) |
| [`45696677032`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45696677032) | unit spec `database-runtime-contract.spec.ts` drži **literalni** pin na ime migracije | literal u specu (`bd1c226`) |

Zato: nova migracija = **tri** svjesne izmjene (migracija, `expectedSchemaMigration`, literalni pin u specu).

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-02` → `zatvoreno (W2.15)` i status
  „Implementacijski status Vala 2 / W2.15".
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.15`.
- Regenerisano guardom: **698 nalaza**, `zatvoreno 344 / otvoreno 354` (P1 175 nepromijenjen — nalaz je
  zatvoren, ne dodat).

## Vizuelna provjera (ručni koraci)

1. Prijavi se; u DevToolsu pozovi `POST /auth/logout` → `204`, cookie obrisan, dalji pozivi 401.
2. Simuliraj nedostupan Redis (stopiraj `redis` container) i ponovi: logout i dalje mora vratiti `204`, a
   stari token mora biti odbijen na sljedećem zahtjevu (`401 INVALID_CREDENTIALS`) — to je nova garancija.
3. Admin promijeni lozinku korisniku dok je Redis nedostupan: sve sesije tog korisnika padaju na 401.
4. Vrati Redis: ponašanje je isto (baza je autoritet), a `auth:sessions-valid-after:*` se ponovo koristi kao
   brzi put.

## Granica paketa

- `BA-authentication-03` (atomski MFA single-use), `-04`…`-08` ostaju otvoreni i netaknuti.
- Per-`jti` durable opoziva (precizan logout bez „gasi sve legacy tokene") je svjesno **odbačena** u ovom
  paketu: nova tabela + cleanup + dodatno čitanje za populaciju koja nestaje. Ako se legacy tokeni pokažu
  dugoživućim u praksi, to je zaseban, mali paket.
- Health alarm iz preporuke nalaza nije dodavan: greška durable upisa se loguje kao `error`, a operativni
  health za Redis već postoji (`W1.7` observability).

## Sljedeći paket

**W2.16 — `BA-authentication-03` (P1):** MFA enrollment token i potvrda nisu atomski single-use.
