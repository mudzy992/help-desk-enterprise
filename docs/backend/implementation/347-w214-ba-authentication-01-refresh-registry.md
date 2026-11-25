# W2.14 — `BA-authentication-01`: refresh oživljava sesiju čiji registry red ne postoji

**Paket:** W2.14<br>
**Nalaz:** `BA-authentication-01` (P1) — zatvoren<br>
**Kodni commit:** `dc29e55` (kod + testovi + docs)<br>
**Finalni testani SHA:** `dc29e55`<br>
**CI:** [`45656281822`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45656281822) — zelen<br>
**DB migracije:** nema

## Nalaz

`AuthenticationService.refresh()` je za token sa `sid` radio `findActive(sessionId)`, ali je `null`
tretirao kao kompatibilni fallback: nastavljao je na `touch(sessionId, …)`, izdavao novi JWT i TTL računao
iz `claims.rememberMe`. Posljedice:

- opozvan (`revokedAt`), istekao (`expiresAt` u prošlosti) ili obrisan registry red **nije prekidao
  refresh** — klijent je dobijao 200 i, uz `rememberMe` claim, token sa rokom od **30 dana**;
- `touch` je pisao u red koji ne postoji (no-op) odnosno u mrtav red, pa je sesijski trag bio obmanjujuć;
- `rememberMe` je dolazio iz tokena, a ne iz registry reda, iako je registry jedini autoritet za politiku
  sesije (SuperAdmin break-glass isključuje 30 dana).

Uticaj je bio ograničen time što `SessionAuthenticationGuard` preko `SessionRevocationStore.check()`
fail-closed provjerava isti red na svakom zahtjevu: token izdan iz mrtve sesije nosi isti `sid` i biva
odbijen na prvom sljedećem pozivu. Zato ovo **nije** bio auth bypass nego nekonzistentan ugovor: endpoint
za produženje sesije je tvrdio da sesija živi, a svaki drugi endpoint ju je već smatrao mrtvom — uz
nepotrebno izdavanje tokena i pisanje u registry. Legacy tokeni bez `sid` imaju **poseban** migracijski tok
i nisu bili dio problema.

Test `does not revoke when there is no live registry row` je kvar **propisivao** kao očekivano ponašanje
(`expiresInSeconds: rememberMeSessionTtlSeconds`, `touch` pozvan), pa ga nijedan gate nije mogao uhvatiti.

## Promjena

`backend/src/modules/authentication/authentication.service.ts`:

```ts
const session = await this.sessionRegistry.findActive(sessionId);
if (session === null || session.userId !== principal.subjectId) {
  throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
}
rememberMe = session.rememberMe;   // registry je autoritet, ne claim
```

- Token sa `sid` se produžava **samo** dok postoji aktivan red **i** dok taj red pripada subjectu tokena.
- `null` (opozvano / istekao / obrisano) i tuđi red ⇒ **401 `INVALID_CREDENTIALS`**, bez `issue`, bez
  `touch`, bez `revoke` (guard već drži durable odbijenicu; ovdje se ne dodaje nova nuspojava).
- Legacy `sessionId === null` tok je netaknut: i dalje pravi kratkotrajni `provider: 'legacy'` red sa
  `rememberMe: false` i nikad ne dobija 30 dana.
- Idle-timeout provjera je sada bez `session !== null` uslova, jer je `session` u tom bloku dokazano živ.

Nije mijenjano: `SessionRegistryService` (`findActive` SQL), guard, `SessionRevocationStore.check()`
(W2.11b fusion), cookie transport, MFA/passkey tokovi, rute i DTO-ovi.

## Dokaz

Unit (`backend/src/modules/authentication/authentication.service.spec.ts`, 35 testa ✓):

- `rejects a refresh when the registry row is gone (revoked, expired or deleted)` — **invertovani** stari
  test: 401 `INVALID_CREDENTIALS`, `issue`/`touch`/`revoke` nijednom pozvani;
- `rejects a refresh when the registry row belongs to another user` — red `user-2` za subject `user-1` ⇒ 401;
- `keeps the legacy no-sid migration path off the registry lookup` — `sessionId: null` ⇒ `findActive` se ne
  poziva, `create` dobija `provider: 'legacy'`, TTL je standardni `sessionTtlSeconds`;
- postojeći testovi (`idle` 401, unutar prozora, `idle = 0`, remembered 30 dana) prolaze nepromijenjeni —
  remembered test i dalje dokazuje da TTL dolazi iz reda.

Dokaz da testovi hvataju kvar: sa `git checkout` na stari `authentication.service.ts` padaju **2** nova
testa (`rejects … gone`, `rejects … another user`), sa popravkom **35/35** prolazi.

Integracija (`backend/src/modules/authentication/session-revocation.integration.spec.ts`, realni PostgreSQL):

- `treats a revoked, expired or deleted registry row as no live session` — `findActive` vraća red za živu
  sesiju, a `null` za opozvanu, isteklu i obrisanu; time je SQL ugovor na koji se popravka oslanja dokazan
  van mockova.

E2E (`e2e/tests/37-authentication-security.spec.ts`, `revoke-others` test):

- poslije `POST /auth/sessions/revoke-others`, tuđi klijent dobija `POST /auth/refresh` → **401** i u
  odgovoru **nema živog `helpdesk_session` cookieja** (cookie sa `Max-Age=0` se ne računa).

Lokalno: `npx jest src/modules/authentication` → **41 suite / 321 testa ✓** (1 suite je integracioni, bez
`PRIVACY_IT_DATABASE_URL` se preskače), ESLint na tri dotaknuta fajla ✓, `e2e npx tsc --noEmit` ✓.

## CI

CI [`45656281822`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45656281822) na `dc29e55` —
**success**:

- **Backend build + test:** success — uključuje `audit:traceability` (697/697, zatvoreno 342 / otvoreno 355),
  `nest build`, lint, `test:safety-net:compile`, `test:wiring` i puni unit suite, dakle i tri nova
  `authentication.service.spec.ts` testa.
- **Backend PostgreSQL + Redis integration:** success — realni PostgreSQL izvršava i novi
  `treats a revoked, expired or deleted registry row as no live session`.
- **Frontend build + test**, **Backend container + supply chain**, **Docs guard**, **CI gate:** success.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory` — push
  profil ne pokreće E2E.

E2E dokaz je zato pokrenut ciljano: [`45656337091`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45656337091)
(`specs=37`, `retries=0`, `max_failures=8`) — **7 passed / 0 failed / 0 flaky / 0 skipped** iz prvog pokušaja
u 80 s. Taj run izvršava i `revoke-others` test sa novim `POST /auth/refresh → 401` tvrđenjem i provjerom da
živ `helpdesk_session` cookie nije izdat.

**Napomena o stacku:** stack u tom trenutku još nije imao ovaj commit (deploy je odvojen korak), a novi E2E
assert prolazi i na starom kodu jer guard već odbija opozvanu sesiju. Zeleni assert je zato **ugovor**, ne
dokaz same popravke — dokaz popravke su unit i integracioni testovi iznad, koji na starom kodu padaju.

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-01` → `zatvoreno`, novi
  „Implementacijski status Vala 2 / W2.14" pod detaljem nalaza.
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.14`.
- `docs/backend/BACKEND-FINDINGS-REGISTER.md`, `docs/backend/backend-findings-plan.json`,
  `backend/docs/audits/README.md` — regenerisani guardom `audit:traceability -- --write`
  (**697 nalaza, P1 175** nepromijenjeno; `zatvoreno` 341 → **342**, `otvoreno` 356 → **355**).

## Rizik

- Klijent koji je držao token mrtve sesije sada dobija 401 na refresh umjesto 200 — to je namjera, ali
  znači da SPA mora na 401 sa refresh rute očistiti stanje i poslati korisnika na prijavu. Postojeći
  E2E 55 (`/auth/refresh` bez remounta) i E2E 39 (cookie lifecycle) pokrivaju taj put.
- Nema migracije i nema promjene šeme; rollback je vraćanje jednog `if` bloka.
- Legacy tokeni bez `sid` nisu obuhvaćeni i ponašaju se identično kao prije.

**Zapaženo, nije dio ovog paketa:** guard-level 401 ne briše `helpdesk_session` cookie (briše ga samo
`POST /auth/logout`). Mrtav cookie tako ostaje u browseru do isteka, a SPA ga sama odbacuje na 401. To je
higijena, ne propust kontrole pristupa; kandidat za mali P3 paket ako se pokaže korisnički vidljiv.

## Vizuelna provjera (ručni koraci)

1. Prijava kao korisnik → Administracija → Sigurnost → „Odjavi ostale sesije".
2. U drugoj sesiji (drugi browser/profil) sačekaj jedan auto-refresh ciklus ili pozovi `POST /auth/refresh`
   iz DevToolsa: odgovor je **401**, `Set-Cookie` je ili odsutan ili `helpdesk_session=; Max-Age=0`.
3. Prvi tab i dalje radi (`/auth/security` → 200), novi login u drugom tabu prolazi normalno.
4. Remember-me sesija: refresh prije opoziva i dalje vraća 30 dana, poslije opoziva 401.

## Granica paketa

- Popravka je u `refresh()` i u dokazima; model autorizacije, guard i revocation store nisu dirani.
- `BA-authentication-02` (Redis fail-open za legacy tok), `-03` (atomski MFA single-use), `-04`… `-08`
  ostaju otvoreni i netaknuti.
- E2E 37 dobija jedan HTTP poziv više (refresh poslije opoziva) — bez novog fixturea i bez novog podatka.

## Sljedeći paket

**W2.15 — `BA-authentication-02` (P1):** durable cutoff za legacy JWT bez `sid`, da logout/password-reset
preživi Redis write outage.
