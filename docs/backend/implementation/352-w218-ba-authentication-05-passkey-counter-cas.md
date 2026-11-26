# W2.18 — `BA-authentication-05`: passkey counter kroz compare-and-set

**Paket:** W2.18<br>
**Nalaz:** `BA-authentication-05` (P2) — zatvoren<br>
**Kodni commit:** `97f4360`<br>
**Finalni testani SHA:** `97f4360`<br>
**CI:** [`45771967588`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45771967588)<br>
**DB migracije:** **ne** — nema promjene šeme

## Nalaz

`PasskeyCredentialService.verifyAssertion()` je radio „pročitaj → provjeri → upiši", a upis nije nosio
očekivanje:

```ts
// prije W2.18
if (Number(credential.counter) > 0 && newCounter <= Number(credential.counter)) {
  await this.prisma.userPasskeyCredential.deleteMany({ where: { userId } });
  throw new AccountSecurityError('PASSKEY_CLONED');
}
await this.prisma.userPasskeyCredential.update({
  where: { id: credential.id },
  data: { counter: BigInt(Math.max(newCounter, 0)), lastUsedAt: now, lastUsedIp: ip },
});
```

`update({ where: { id } })` je **bezuslovan**: ne pita da li je red još ono što je pročitan. Dvije paralelne
ceremonije (dva MFA tokena, dvije kartice/prozora) čitaju isti `counter`, obje prođu clone provjeru jer je
`newCounter > pročitano`, i obje upišu — **sporiji upis vraća niži counter**. Time se clone/replay signal pomjera
unazad: sljedeća legitimna aseracija sa manjim `newCounter`-om od stvarnog stanja više ne izgleda sumnjivo, pa
naknadna detekcija kloniranog autentikatora (jedina odbrana koju WebAuthn counter pruža) slabi.

Za razliku od TOTP-a (`W2.6`: CAS nad `lastUsedStep` sa `OR lastUsedStep null/lt`), passkey strana nije imala
nikakav predikat.

## Promjena

1. **Upis je compare-and-set:**

   ```ts
   const expectedCounter = credential.counter;           // vrijednost protiv koje je aseracija provjerena
   const written = await this.prisma.userPasskeyCredential.updateMany({
     where: { id: credential.id, counter: expectedCounter },
     data: { counter: BigInt(Math.max(newCounter, 0)), lastUsedAt: now, lastUsedIp: ip },
   });
   if (written.count !== 1) await this.refuseStaleCounter(userId, credential.id, expectedCounter);
   ```

   Baza, a ne aplikacijska provjera, odlučuje ko smije pomjeriti counter. `count !== 1` znači da je red između
   čitanja i upisa promijenjen — ovaj zahtjev tada **ne upisuje ništa**.

2. **`refuseStaleCounter()` — šta izgubljeni CAS znači, a šta ne:**

   | Stanje poslije neuspjelog CAS-a | Odgovor | Faktor |
   | --- | --- | --- |
   | red ne postoji (opozvan/resetovan u međuvremenu) | `401 MFA_INVALID_CODE` | nedirnut |
   | `stored counter > pročitani` (paralelna ceremonija je pomjerila naprijed) | `401 MFA_INVALID_CODE` | **zadržan** — counter nije regresirao, ovo je duplikat, ne klon |
   | red promijenjen a counter nije napredovao (re-registracija istog `id`-a) | `401 MFA_INVALID_CODE` | nedirnut |

   Svaki slučaj se loguje kao `warn` sa razlogom (bez credential materijala), pa je race vidljiv u operativi.

3. **Clone put je netaknut i dalje odlučuje prvi:** `stored > 0 && newCounter <= stored` ⇒ `PASSKEY_CLONED` +
   brisanje faktora, i to **prije** ijednog upisa. Redoslijed je bitan: clone se odlučuje na vrijednostima koje je
   ovaj zahtjev pročitao, CAS samo štiti upis.

4. **Counterless autentikatori (stored `0`)** ostaju po WebAuthn pravilu: nema šta porediti i nema šta regresirati,
   pa je predikat `counter: 0` i paralelne prijave prolaze. Alternativa (odbijanje druge ceremonije) bi zaključala
   korisnike autentikatora koji counter ne implementiraju, bez ikakve sigurnosne dobiti.

Nije mijenjano: registracija (`confirmRegistration` upisuje početni counter pri `create`-u — novi red, nema šta
zaštititi), `PASSKEY_CLONED` semantika i brisanje svih passkeya (to je `BA-authentication-08`, P3, zaseban nalaz),
challenge store, rute, DTO-ovi, frontend.

**Svjesno prihvaćena cijena:** kod istinskog race-a gubitnik dobija `401 MFA_INVALID_CODE` i mora ponoviti
ceremoniju (novi challenge, `counter+1`). To je fail-closed i bezopasno: njegov MFA claim je u `W2.16` već
oslobođen na odbijeni kod, pa ista prijava nastavlja bez nove lozinke.

## Dokaz

**Unit — `security/passkey-credential.service.spec.ts` (24 testa, 4 nova/proširena):**

- `records a verified assertion with a compare-and-set on the counter it verified` — `updateMany` sa
  `where: { id: 'row-1', counter: 6n }`, `count: 1`; **`update` se ne zove**;
- `refuses the assertion whose compare-and-set lost, and keeps the factor` — `count: 0`, ponovni read vraća `6n`
  (pobjednik je već upisao) ⇒ `MFA_INVALID_CODE`, **`deleteMany` se ne zove**;
- `refuses when the credential disappears between verification and the write` — `count: 0`, red `null` ⇒
  `MFA_INVALID_CODE`;
- `keeps refusing a stale clone path: a non-advancing counter still wipes the factor` — `newCounter == stored` ⇒
  `PASSKEY_CLONED` + `deleteMany({ where: { userId } })`, a `updateMany` se **ne zove** (clone se odlučuje prije
  upisa);
- `accepts an authenticator that never advances its counter…` — sada tvrdi i CAS predikat `counter: 0n`.

Uz to: `authentication.service.spec.ts` + `account-security.controller.spec.ts` + `common/validation` — **81/81**
u lokalnom prolazu, bez regresije. `eslint` zelen na svim dodirnutim fajlovima
(uključujući `scripts/run-isolated-integration*.mjs`).

**Integracija — `passkey-counter-cas.integration.spec.ts` (novi, realni PostgreSQL, isolated runner):**

- `lets one of two parallel ceremonies advance the counter and refuses the stale one` — dvije ceremonije sa
  **različitim** MFA tokenima ulaze u `verifyAuthenticationResponse` kroz **barijeru**: mock ne vraća odgovor dok
  obje ne stignu, pa su obje pročitale isti red (`counter = 5`) i provjerile se protiv istog stanja. Rezultat:
  tačno jedan `fulfilled`, jedan odbijen sa `MFA_INVALID_CODE` (ne `PASSKEY_CLONED`), u bazi `counter = 6`
  (napredovao tačno jednom, nikad nazad), `lastUsedAt` postavljen, i **nijedan red nije obrisan** (broj
  credentiala je `prije + 1`) — dakle gubitnik nije aktivirao clone brisanje;
- `keeps parallel sign-ins working for an authenticator without a counter` — `counter = 0` u oba slučaja: oba
  prolaze, u bazi ostaje `0`.

Spec je dodat u `integrationSpecs` listu isolated runnera **i** u guard test te liste
(`run-isolated-integration.test.mjs`, 23/23 lokalno).

**Napomena o lokalnom izvršavanju:** integracioni spec se u sandboxu preskače (`describeIfDatabase`), jer
`prisma generate` tamo nije moguć — izvršava ga CI posao „Backend PostgreSQL + Redis integration". Unit spec je
prije ovog paketa bio **nepokretljiv lokalno** (`Cannot find module '../../generated/prisma/client'`); sada ima
`jest.mock` za `PrismaService` (kao susjedni authentication specovi), pa se i on vrti bez generisanog klijenta.

## CI

CI [`45771967588`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45771967588) na `97f4360` — **dva
prolaza**, drugi zelen:

| Prolaz | Rezultat | Detalj |
| --- | --- | --- |
| 1 | failure | `E2E critical flows`: `15-workflow-unrouted-realtime.spec.ts:275` („a routing change reaches the admin room over the socket") — 10 s timeout na predikatu; 8 prošlo, 1 pao, 18 preskočeno. **Svi code poslovi zeleni**, uključujući `Backend PostgreSQL + Redis integration` sa novim `passkey-counter-cas` specom |
| 2 (`gh run rerun --failed`) | **success** | svi poslovi zeleni, `CI gate` success |

**Ponavljajući flake, ne ovaj paket:** ista socket aseracija u specu 15 pala je i na PR-u za `W2.16`
([`45710816624`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45710816624)) i za `W2.17`
([`45763497338`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45763497338), gdje je uz to bio i
stack outage). Tri paketa zaredom, tri različite izmjene (MFA token, `:sessionId` validacija, passkey counter) — ni
jedna ne dira routing/socket put. Preporuka za odvojen triage: `specs=15` sa `max_failures=8, retries=0`, i ako se
ponovi, zaseban paket za tu aseraciju (`BA-websocket-*`/`BA-cross-cutting`), jer sada svaki paket plaća jedan
rerun.

Perf smoke: success (`:sessionId`/passkey put nije u smoke profilu). Nema migracije → nema sentinel izmjena.

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-05` → `zatvoreno (W2.18)` + implementacijski
  status uz nalaz.
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.18`.
- Regenerisano guardom `audit:traceability`: **698 nalaza**, `zatvoreno 347 / otvoreno 351` (P1 otvoreno
  nepromijenjen — nalaz je P2).

## Rizik

- Gubitnik race-a mora ponoviti ceremoniju; ako korisnik ima samo passkey kao drugi faktor i autentikator je spor,
  to je jedan dodatni Touch ID/Windows Hello korak. Prihvaćeno: alternative su ili dupli upis (ovaj nalaz) ili
  zaključavanje faktora na benigni dupli submit.
- CAS pretpostavlja da `id` + `counter` jedinstveno opisuju ono što je provjeren; ako se u budućnosti doda
  re-registracija istog reda (isti `id`, novi ključ), posljednji branch (`counter` nije napredovao) to hvata i
  odbija upis — fail-closed, ali bez posebnog koda za klijenta.
- Counterless autentikatori ostaju bez clone detekcije — to je WebAuthn ograničenje, ne ovaj paket; dokumentovano
  i u testu.
- `BA-authentication-08` (P3) ostaje otvoren: clone brisanje je i dalje „svi passkeyi korisnika", ne samo pogođeni.

## Vizuelna provjera (ručni koraci)

1. „Moj profil → Sigurnost" → registruj passkey (Windows Hello/Touch ID) i odjavi se.
2. Otvori dvije kartice, pokreni prijavu u obje, potvrdi passkey u obje brzo jedna za drugom: **jedna** dobija
   sesiju, druga `401` „Kod nije važeći" — i passkey **ostaje** registrovan (nema `PASSKEY_CLONED`).
3. Ponovi prijavu u drugoj kartici: prolazi (novi challenge, counter+1).
4. U bazi (`SELECT counter FROM "UserPasskeyCredential"`): broj monotono raste, nikad ne pada.

## Granica paketa

- `BA-authentication-06` (JWKS bez timeouta/cachea), `-07`, `-08` ostaju otvoreni i netaknuti.
- Registracija i `renameCredential` nisu dirani — oba pišu polja koja nisu sigurnosni signal (odnosno novi red).

## Sljedeći paket

**W2.19 — `BA-authentication-06` (P2):** Entra JWKS dohvat nema timeout ni cache.
