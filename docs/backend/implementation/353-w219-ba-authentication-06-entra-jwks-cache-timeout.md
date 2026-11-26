# W2.19 — `BA-authentication-06`: Entra JWKS kroz cache, timeout i ograničen dokument

**Paket:** W2.19<br>
**Nalaz:** `BA-authentication-06` (P2) — zatvoren<br>
**Kodni commit:** `e66d9dd`<br>
**Finalni testani SHA:** `acc2285`<br>
**CI:** [`45778720368`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45778720368) (kod), [`45780736160`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45780736160) (docs)<br>
**DB migracije:** **ne** — nema promjene šeme

## Nalaz

`resolve-entra-jwks-public-key.ts` je bio jedini put do Microsoftovog JWKS dokumenta i radio je, za **svaku**
Entra prijavu:

```ts
// prije W2.19
const response = await fetch(jwksUrl, { method: 'GET', headers: { Accept: 'application/json' } });
if (!response.ok) throw new AuthenticationError('AUTHENTICATION_UNAVAILABLE');
const document = parseJwksDocument(await response.json());
const key = document.keys.find((candidate) => candidate.kid === keyId);
if (key === undefined) throw new AuthenticationError('INVALID_CREDENTIALS');
```

Četiri odvojena problema u četiri linije:

1. **nema timeouta ni `AbortSignal`** — spor Microsoftov odgovor (ili mreža koja visi) drži HTTP zahtjev i
   njegove resurse otvorene koliko i sam socket; nema gornje granice;
2. **nema cachea** — dokument se dohvata po prijavi; nalet prijava (ili ispad Microsofta) umnožava iste vanjske
   pozive linearno s brojem korisnika;
3. **nema ograničenja odgovora** — `response.json()` čita tijelo bez granice, pa neispravan/hostilan endpoint
   može prisiliti memoriju na proizvoljno veliki dokument;
4. **nema validacije oblika i nema osvježavanja** — `parseJwksDocument` je prihvatao bilo koji objekat sa
   `keys` nizom, `isEntraJsonWebKey` je provjeravao samo `typeof === 'object'`, a nepoznat `kid` je odmah
   vraćao `INVALID_CREDENTIALS`. Rotacija ključa na Microsoftovoj strani značila je **restart procesa** ili
   odbijene prijave do isteka keša na strani klijenta.

## Promjena

Novi `entra-jwks-key-resolver.ts` je jedino mjesto koje razgovara s JWKS endpointom. `MicrosoftEntraIdTokenVerifier`
je singleton provajder, pa drži **jedan** resolver — jedan dokument po procesu, ne po prijavi. Stari fajl je
obrisan (`git rm`), nema drugih korisnika.

| Zahtjev iz audita | Kako je riješeno |
| --- | --- |
| timeout | `AbortController` + `setTimeout(fetchTimeoutMilliseconds = 5 s)`; abort se mapira na `AUTHENTICATION_UNAVAILABLE` |
| cache po issueru | `Map<jwksUrl, { keys: Map<kid, JWK>, fetchedAt }>`, TTL 24 h; ključ keša je **URL**, pa se tenant nikad ne miješa |
| cache po kid-u | dokument se indeksira po `kid`-u; pretraga je `Map.get`, bez linearnog skeniranja |
| jedan refresh na nepoznat `kid` | rotacija se pokupi na prvom tokenu s novim `kid`-om; **cooldown 30 s** od posljednjeg fetchanja sprečava da `kid` iz napada postane generator vanjskih poziva |
| maksimalna veličina | `content-length` **i** dekodirano tijelo ograničeni na 256 KB prije parsiranja |
| metrički signal | brojači `cacheHits / fetches / timeouts / staleServed / unknownKeyRefreshes` kroz `stats()`; `warn` log na stale fallback |

Uz to dvije odluke koje audit nije tražio, a bez kojih bi popravka bila polovična:

* **single-flight** (`pending` mapa): paralelne prijave na hladnom cacheu dijele jedan `fetch`, pa hladan start
  pod naletom nije jedan poziv po korisniku nego jedan ukupno;
* **stale-on-transport** (do `maxStaleMilliseconds = 7 dana`): ako osvježavanje padne zbog mreže ili non-2xx
  statusa, keširani dokument i dalje služi (uz `warn`). Bez toga je svaki Microsoftov blip totalni prekid Entra
  prijave. **Malformiran ili prevelik dokument nikad** ne vraća stare ključeve — to je `AuthenticationError`,
  jer je takav odgovor razlog da se vjeruje **manje**, ne više. Ista granica važi i za `AUTHENTICATION_UNAVAILABLE`.

Nije mijenjano: `MicrosoftEntraIdTokenVerifier.verify()` redoslijed (`readSigningKeyId` → ključ → `jsonwebtoken.verify`
sa algoritmom/issuerom/audienceom), `normalizeEntraIdTokenClaims`, DI token `ENTRA_ID_TOKEN_FETCH`, konfiguracija
(`jwksUrl`, `issuer`, `clientId`, `tenantId`), rute, DTO-ovi, frontend. Nema migracije.

## Dokaz

**Unit — `entra-jwks-key-resolver.spec.ts` (novi, 11 testova, acceptance jedan-na-jedan):**

| Acceptance | Test |
| --- | --- |
| timeout | mock `fetch` visi dok `AbortController` ne opali: `AUTHENTICATION_UNAVAILABLE`, `stats().timeouts === 1`, cijeli poziv < 2 s, a `fetch` je dobio `signal` |
| cache-hit | tri prijave → **jedan** `fetch`, `cacheHits === 2`; poslije TTL-a (pomjeren sat) drugi `fetch` |
| cache po URL-u | dva tenanta = dva dokumenta; `kid` jednog tenanta ne prolazi na drugom (`INVALID_CREDENTIALS`) |
| key-rotation | novi `kid` poslije cooldowna → jedno osvježavanje, token prihvaćen, sljedeći poziv besplatan |
| unknown-kid | odbijen nakon najviše jednog osvježavanja; hladan cache = **1** poziv, burst od pet izmišljenih `kid`-ova = **0** dodatnih poziva |
| malformed / oversized / non-2xx | `AUTHENTICATION_UNAVAILABLE` za `{"keys": "not-an-array"}`, neispravan JSON, 2 KB prekoračenje i 503 |
| nema keširanja greške | neuspješan pa uspješan fetch = dva poziva (greška ne truje keš) |
| stale | mrežni ispad unutar granice služi keš (`staleServed === 1`, `warn`), izvan granice fail-closed |
| stale se ne koristi za malformiran odgovor | `staleServed === 0` |

**Unit — `microsoft-entra-id-token.verifier.spec.ts`:** novi test `loads the JWKS once for a burst of sign-ins,
with an abortable request` — tri `verify()` poziva kroz isti verifikator = **jedan** `fetch`, a zahtjev nosi
`signal`; helper `createFetch` sada servira `text()` + `content-length` (resolver čita tekst da bi ograničio
veličinu prije parsiranja). Postojeći testovi (potpis, issuer/audience/tenant, nedostajući claimovi, nedostupan
JWKS) prolaze nepromijenjeni.

**Lokalni prolaz:** `entra-jwks-key-resolver` + `microsoft-entra-id-token.verifier` + `authentication.service` —
**61/61**. `eslint` čist na sva četiri dodirnuta fajla. `wiring:check` ✓ (99 kontrolera / 633 rute — nepromijenjeno).

**Napomena o lokalnom izvršavanju:** ostatak authentication modula lokalno ne može startati bez generisanog Prisma
klijenta (`Cannot find module '../../generated/prisma/client'`) — to je `BA-authentication-07`, poznata granica
okruženja, ne regresija ovog paketa. Nijedna od tih spec datoteka ne dodiruje JWKS put. Ovaj paket ne dodaje
integracijski spec: nema baze ni Redisа u putu, a acceptance lista je u cjelosti unit-nivo (lažni `fetch` je
jedini vanjski sistem).

## CI

Dva prolaza, **oba zelena iz prvog pokušaja** (nijedan rerun):

| Prolaz | SHA | Rezultat | Detalj |
| --- | --- | --- | --- |
| kod | `e66d9dd` | **success** — [`45778720368`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45778720368) | `Backend build + test`, `Backend PostgreSQL + Redis integration`, `Backend container + supply chain`, `Frontend build + test`, `E2E critical flows`, `CI gate` ✓; `Docs guard` preskočen (nema docs izmjena u tom commitu) |
| docs | `acc2285` | **success** — [`45780736160`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45780736160) | svi poslovi ✓, uključujući `Docs guard` i `CI gate` |

Perf smoke: [`45778720352`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45778720352) ✓ i
[`45780735999`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45780735999) ✓.

**Za razliku od `W2.16`–`W2.18`, socket flake iz `15-workflow-unrouted-realtime.spec.ts` se nije pojavio** — što
potvrđuje da je on vezan za stack/realtime okruženje, ne za promjenu u ovom putu. Triage preporuka iz `W2.18`
ostaje otvorena.

Nema migracije → nema sentinel izmjena; nema novih env varijabli.

## Dokumentacija

- `docs/backend/audits/01-authentication.md` — red `BA-authentication-06` → `zatvoreno (W2.19)` + implementacijski
  status uz nalaz.
- `docs/backend/EXECUTION-PLAN-REMAINING.md` — ledger red `W2.19` (stvarna isporuka; tabela plana u §4.2 i dalje
  nosi originalnu dodjelu paketa, kao i za `W2.14`–`W2.18`).
- Regenerisano guardom `audit:traceability` (registar/plan/JSON).

## Rizik

- **Keš je per-proces:** N replika = N dokumenata po TTL-u (24 h). To je i dalje zanemarivo prema „jedan po
  prijavi“, ali nije globalni keš; podjela kroz Redis bi dodala vanjsku zavisnost u put prijave — svjesno ne.
- **Cooldown 30 s:** potpuno novi `kid` se u najgorem slučaju prihvati do 30 s nakon prethodnog fetchanja.
  Microsoft drži prethodni ključ valjanim satima, pa nema prekida prijave; cijena je da PRVA prijava s novim
  ključem u tom prozoru dobije `401` i mora se ponoviti.
- **Stale fallback (7 dana):** produžava život ključa tijekom ispada Microsofta. Ograničen je na transportne
  greške, loguje se `warn`-om i ne mijenja nikakvu drugu provjeru (potpis, issuer, audience, tenant se i dalje
  provjeravaju). Alternativa je totalni prekid Entra prijave pri svakom blipu.
- **`stats()` nije izložen kroz `/security/metrics`:** dodavanje novog događaja u `LoginSecurityMetricEvent`
  mijenja tip `LoginSecurityMetricsSnapshot`, admin karticu i i18n — to je cross-module izmjena koja ne pripada
  ovom nalazu. Brojači su zato u resolveru i u logu; kandidat za zaseban paket (`BA-observability-*`).
- `BA-authentication-07` (Prisma generator) i `-08` (clone brisanje svih passkeya) ostaju otvoreni.

## Vizuelna provjera (ručni koraci)

Nije primjenjivo — nema promjene UI-ja ni ruta. Ponašanje je serversko i pokriveno unit testovima iznad.

## Granica paketa

- Nije diran `jsonwebtoken.verify` put, normalizacija claimova, DI token ni konfiguracija.
- Nije diran Teams bot connector JWKS put (`teams/bot-connector-jwt-validator.ts`) — to je zaseban nalaz u
  `docs/backend/audits/36-teams.md` (pinned origini, redirect policy, timeout, size cap, stale-known-good).
- Nema promjene šeme, nema sentinel izmjena, nema frontend izmjena.

## Sljedeći paket

**W2.20 — `BA-authentication-07` (P2):** Prisma generator blokira audit testove.
