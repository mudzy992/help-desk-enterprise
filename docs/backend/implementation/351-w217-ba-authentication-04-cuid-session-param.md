# W2.17 — `BA-authentication-04`: validacija `:sessionId` usklađena sa CUID ugovorom

**Paket:** W2.17<br>
**Nalaz:** `BA-authentication-04` (P2) — zatvoren<br>
**Kodni commit:** `a82006a`<br>
**Finalni testani SHA:** `a82006a` (+ test/docs commit na vrhu)<br>
**CI:** [`45761503348`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45761503348) i [`45763497338`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45763497338) — zeleni<br>
**DB migracije:** **ne** — nema promjene šeme

## Nalaz

`DELETE /auth/sessions/:sessionId` je tražio UUID:

```ts
// prije W2.17
@Param('sessionId', new ParseUUIDPipe()) sessionId: string,
```

a `UserSession.id` je `@default(cuid())` — 25 znakova, `c` + base36. `ParseUUIDPipe` je zato odbijao **svaki**
ID koji `GET /auth/sessions` vrati, sa `400` i prije nego što se uopšte dođe do provjere vlasništva
(`sessionRegistry.revoke({ userId, sessionId })`). Posljedica u praksi:

- dugme „Opozovi" na svakoj sesiji u „Moj profil → Sigurnost" **nikad** nije radilo (`revokeOwnSession(id)` iz
  frontenda šalje tačno onaj ID koji lista vrati);
- „Odjavi ostale sesije" (`POST /auth/sessions/revoke-others`) radi jer nema parametar — pa kvar nije bio
  uočljiv, a jedini precizan način da se ugasi **jedna** sesija (npr. izgubljen telefon) nije postojao;
- `ParseUUIDPipe` je ujedno bio i pogrešan **ugovor**: ruta je tvrdila UUID format koji schema ne izdaje.

Isti obrazac postoji na `PATCH/DELETE /users/:userId` i `/users/:userId/reset-password` (zabilježeno kao
`BA-users-07`, otvoreno) i na `/notifications/preferences/:userId` (nije zabilježeno ni u jednom auditu — vidi
„Granica paketa").

## Promjena

1. **Novi bounded validator** `backend/src/common/validation/cuid-param.pipe.ts`:

   ```ts
   export const cuidParamPattern = /^c[0-9a-z]{19,29}$/;

   export class CuidParamPipe implements PipeTransform<string, string> {
     constructor(private readonly parameter = 'id') {}
     transform(value: string): string {
       if (isCuidParamValue(value)) return value;
       throw new BadRequestException({ code: 'INVALID_ID', message: `${this.parameter} is not a valid identifier` });
     }
   }
   ```

   - `^c[0-9a-z]{19,29}$` je **bounded** raspon oko stvarne `cuid()` dužine (25): prihvata 20–30 znakova da
     promjena generatora ne obori žive rute, a odbija UUID, velika slova, razmake, predugačke ID-eve i sve što
     nije string — dakle ništa ne ide u upit ako nije tog oblika.
   - Greška je stabilna i imenovana: `400 INVALID_ID` sa imenom parametra (`sessionId`, kasnije `userId`), pa
     jedna poruka služi svim rutama i klijent ne dobija generički `VALIDATION`.
   - `cuidLength = 25` stoji uz šablon kao referenca na `@default(cuid())` iz šeme.

2. **Ruta** (`account-security.controller.ts`): `@Param('sessionId', new CuidParamPipe('sessionId'))`.
   `ParseUUIDPipe` je uklonjen iz importa; **provjera vlasništva je netaknuta** — `revoke()` i dalje filtrira po
   `userId` i vraća `404 SESSION_NOT_FOUND` za tuđu sesiju, pa se odgovor za tuđi ID nije promijenio.

Nije mijenjano: `SessionRegistryService` (upiti, revoke/revokeAll semantika), ruta `revoke-others`, cookie/guard
lanac, frontend (`revokeOwnSession` je i prije slao ispravan ID), `BA-users-07` rute.

**Svjesno prihvaćena cijena:** ruta sada odbija UUID oblik koji je prije „prolazio" do servisa — ali takav ID
nikad nije ni postojao u bazi, pa nema scenarija u kojem je stari 400 bio korisniji; razlika je samo u kodu greške
(`INVALID_ID` umjesto `VALIDATION`).

## Dokaz

**Unit — `common/validation/cuid-param.pipe.spec.ts` (6 testova):**

- prihvata **stvarni cuid** iz živog odgovora (`cmwwnqcx800itw31quqh0ny4r`) i granice 20/25/30;
- odbija 19 i 31 znak, prazan string i samo `c`;
- odbija **UUID** — tačno oblik koji je stara ruta zahtijevala (i `isCuidParamValue` vraća `false`);
- odbija velika slova, strani simbol, `\n`, `undefined` i broj;
- ime parametra ulazi u poruku (`userId is not a valid identifier`).

**Unit — `modules/authentication/account-security.controller.spec.ts` (4 testa, contract test iz nalaza):**

- `revokes the id the sessions list just returned` — ID iz `controller.sessions()` (fixture je stvarni cuid
  oblika koji `GET /auth/sessions` vraća) prolazi kroz `CuidParamPipe` i stiže do `sessionRegistry.revoke` sa
  `{ userId, sessionId, reason: 'user', actorUserId }`;
- `shows why the previous validator could never pass` — **regresiona ankera**: `new ParseUUIDPipe().transform(<taj
  isti ID>)` odbija, tj. stari kod je morao vratiti 400 prije provjere vlasništva;
- `answers 404 SESSION_NOT_FOUND for an id that belongs to somebody else` — dobro oblikovan tuđi ID i dalje
  završava na provjeri vlasništva, ne na formatu;
- `refuses a malformed session id before the registry is touched`.

Uz to: `authentication.service.spec.ts` + `session-registry.service.spec.ts` + `common/validation` **58/58**
(nema regresije), `wiring:check` ✓ 99 controllera / 633 rute, `eslint` zelen na svim dodirnutim fajlovima,
`npx tsc --noEmit` u `e2e/` zelen.

**E2E — `e2e/tests/37-authentication-security.spec.ts` (novi test):** dva klijenta se prijave, `GET /auth/sessions`
vrati listu, tvrdi se da trenutna sesija ima **cuid** oblik (`/^c[0-9a-z]{19,29}$/`), malformed ID → `400
INVALID_ID`, predugačak ID → `400`, **tuđi** ID (superadmin gasi korisnikovu sesiju) → `404 SESSION_NOT_FOUND`
i korisnik ostaje prijavljen, a sopstveni listani ID → `204` i njegov cookie je mrtav (`/auth/security` → `401`)
dok drugi klijent istog korisnika ostaje prijavljen.

**Iskreno o E2E izvršavanju:** test **nije** izvršen u ovom paketu. `E2E_BASE_URL` pokazuje na deployovani stack
(build `AA81E13`, tj. vrh W2.15a), a taj build **ne sadrži** W2.17 — puštanje `specs=37` sada bi raportiralo
ponašanje starog koda (i crven test), ne ovog paketa. Test ulazi u prvi E2E prolaz poslije deploya (noćni full
run ili ciljani `specs=37`). Dokaz za paket su zato unit + controller contract testovi, koji pokrivaju istu
tvrdnju bez mreže; PR smoke podskup (`01,02,03,15,22,54`) ne dira ovu rutu.

## CI

CI [`45761503348`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45761503348) na `a82006a` —
**success**, bez crvenih pokušaja:

- **Backend build + test** — `prisma validate`, `db:generate`, `nest build`, lint, `test:safety-net:compile`,
  `test:wiring`, `audit:traceability`, `db:migration-policy:check` (129 migracija, bez nove), puni unit suite
  (uključuje 6 pipe + 4 controller testa);
- **Backend PostgreSQL + Redis integration** — bez promjene šeme, svi isolated specovi zeleni;
- **Frontend build + test**, **Backend container + supply chain**, **CI gate:** success;
- **E2E critical flows** — PR smoke podskup (`01,02,03,15,22,54`) **success** protiv deployovanog stacka; novi test
  u specu 37 nije u tom podskupu i, kako je gore objašnjeno, ne bi bio mjerodavan prije deploya ovog paketa;
- **Docs guard** — `skipped`, jer je taj commit dirao samo kod i testove (guard se pokreće na `docs/**`); docs
  commit na vrhu grane ga pokreće i prolazi (`check-docs-content` lokalno: 32 stranice, 8 prevoda, 10 provjera);
- **Perf smoke** — success (vruće rute netaknute; `:sessionId` nije u smoke profilu).

Prvi push je prošao bez crvenog runa; nije bilo migracije, pa ni sentinel izmjena.

**Docs/test commit na vrhu grane — tri prolaza, dva crvena bez veze sa paketom:**

| Prolaz | Rezultat | Uzrok |
| --- | --- | --- |
| [`45763497338`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45763497338) (1) | failure | `E2E critical flows`: `15-workflow-unrouted-realtime.spec.ts:214` („forms.enabled controls the UI…") — 90 s timeout, spec koji ne dira autentikaciju; svi code poslovi zeleni |
| isti run (rerun 1) | failure | **stack outage**: `GET https://api.desk.ba101.top/health` pao 06:05:19–06:06:04Z; E2E watchdog (`scripts/run-e2e.mjs`) zaustavio suite, `results.json` nije ni nastao |
| isti run (rerun 2) | **success** | svi poslovi zeleni, uključujući `Docs guard` i `E2E critical flows` |

Razlika između `a82006a` (zelen iz prvog puta) i docs commita je isključivo dokumentacija + jedan unit test, pa
crveni E2E nije mogao biti posljedica paketa — pouka je ista kao u `W2.16`: socket/form E2E padovi i „stack outage"
dijagnostika rješavaju se **rerunom**, a ne izmjenom koda.

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-04` → `zatvoreno (W2.17)` + implementacijski
  status uz nalaz.
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.17`.
- Regenerisano guardom `audit:traceability`: **698 nalaza**, `zatvoreno 346 / otvoreno 352` (P1 otvoreno
  nepromijenjen — nalaz je P2).

## Rizik

- Validator je **stroži od baze**: ID koji nije `c…` oblika odbija se sa 400 iako bi ga Prisma možda našla u
  ručno seedovanom okruženju. To je namjerno (ruta izdaje samo `cuid()`), a pošto se greška vidi kao
  `INVALID_ID`, takav slučaj je odmah prepoznatljiv u logu.
- Dužina je ograničena na 30; ako se u budućnosti pređe na `cuid2` ili `uuid` strategiju, mijenja se **jedan**
  šablon i jedan test — to je i bila svrha izdvajanja u `common/validation`.
- `BA-users-07` (P2) ostaje otvoren: iste rute `/users/:userId` i dalje traže UUID. Pipe je spreman za tu
  zamjenu, ali to je zaseban paket sa svojim dokazom (i users audit redom).

## Vizuelna provjera (ručni koraci)

1. „Moj profil → Sigurnost", lista sesija: pored druge sesije klikni **Opozovi** → `204`, red nestaje iz liste,
   toast „Sesija je opozvana"; u drugoj sesiji sljedeći zahtjev vraća `401` i cookie se briše.
2. U DevToolsu: `DELETE /auth/sessions/not-a-session-id` → `400` sa `code: "INVALID_ID"`; isti zahtjev sa ID-em
   druge osobe → `404` `SESSION_NOT_FOUND` (bez `set-cookie`, tuđa sesija ostaje živa).
3. Ponovi isti DELETE dva puta sa sopstvenim ID-em: prvi `204`, drugi `404` `SESSION_NOT_FOUND` (idempotentno
   ponašanje se nije promijenilo).

## Granica paketa

- Ostale `ParseUUIDPipe` rute nisu dirane: `/users/:userId…` je `BA-users-07` (P2, otvoren), a
  `PATCH/DELETE /notifications/preferences/:userId` koristi isti obrazac i **nije zabilježen** ni u jednom
  auditu — predlažem da se pri otvaranju `BA-users-07` doda i taj par ruta (ili novi nalaz u auditu
  notifikacija), jer je defekt identičan: `User.id` je cuid.
- Nema promjene šeme, migracije ni dozvola; nema frontend izmjene.

## Sljedeći paket

**W2.18 — `BA-authentication-05` (P2):** passkey counter update nema compare-and-set zaštitu (cloned-authenticator
detekcija se može pregaziti paralelnim asercijama).
