# W7.105 — `BA-reports-15`: verzionisan, veličinom ograničen i strogo validiran cache

**Paket:** Val 7, `reports`, **P3**<br>
**Nalaz:** „Redis cache parseri validiraju samo plitki shape bez schema/version/size granice”<br>
**Kod:** `cache/report-cache-envelope.ts` (**novo**), `cache/report-cache-shape.ts` (**novo**),
`cache/parse-report-dashboard-cache.ts` (**novo**), `cache/parse-report-trends-cache.ts` (**novo**),
`summary/parse-report-summary-cache.ts`, `summary/report-summary-cache.ts`, `dashboard/report-dashboard.cache.ts`,
`trends/report-trends.cache.ts`<br>
**Specovi:** `cache/report-cache-envelope.spec.ts` (**novo, 14**), `cache/report-cache-validators.spec.ts`
(**novo, 27**), `summary/parse-report-summary-cache.spec.ts` (12 → **24**), `summary/report-summary-cache.spec.ts`
(5 → **6**), `dashboard/report-dashboard.cache.spec.ts` (+1)<br>
**DB migracija:** **ne**<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena (oblik odgovora se ne mijenja)<br>
**CI:** [run `45232992929`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45232992929) ✓ na `189366d`

## Nalaz

Sva tri report cachea (dashboard/SLA summary, OU dashboard, trendovi) radila su isto: `JSON.parse`, pa nekoliko
`typeof` provjera, pa — ako prođe — vrijednost se servira klijentu. Tri posljedice su bile stvarne:

1. **Nije bilo verzije šeme.** Deploy koji promijeni payload ostavlja vrijednost starog builda čitljivom (i obrnuto
   nakon rollbacka). Jedina granica bio je TTL od 60 s (summary/dashboard) ili 10 min (trendovi).
2. **Nije bilo granice veličine.** `JSON.parse` i validator radili su nad čim god je u ključu: 40 MB vrijednost
   (otrovani ključ, bug koji je upisao listu tiketa, dijeljeni Redis namespace) plaćala se na **svakom** zahtjevu do
   isteka TTL-a.
3. **Validatori su bili plitki.** `typeof value === 'object'` propušta **niz**; `typeof count === 'number'` propušta
   `-1`, `1.5` i `Infinity`; elementi `statusCounts`, `profiles`, `points`, `aging` i `kpis` **nisu** provjeravani.
   Dashboard je npr. prolazio sa `aging: {}` i `volumeSeries: [null]`, a trendovi sa `points: [{}]` — ekran bi
   prikazao `NaN`/prazno, a sistem bi to smatrao ispravnim odgovorom.

## Rješenje

### 1. Envelope (`report-cache-envelope.ts`)

Svaki zapis je `{ "v": 1, "data": <payload> }`, i to je jedini put do Redisa za report cache:

| Situacija | Ishod | Brisanje zapisa |
| --- | --- | --- |
| nema Redisa | miss (`no_client`) | — |
| ključ ne postoji | miss (`absent`) | — |
| vrijednost > 256 KiB | miss (`oversized`) **prije** parsiranja | **da** — nikad ne može biti validna |
| nije JSON | miss (`invalid_json`) | **da** (smeće) |
| JSON bez envelope | miss (`not_enveloped`) — vrijednost starog builda | ne (istekne s TTL-om) |
| `v` se ne poklapa | miss (`version_mismatch`) | **ne** (rolling deploy, vidi dolje) |
| `v` se poklapa, payload ne prolazi validator | miss (`invalid_payload`) | ne (može biti validan za drugog pozivaoca) |
| Redis baci grešku | miss (`error`) | — |

Envelope se prihvata samo kao **tačno** `{ v, data }` (dva ključa, `v` cijeli broj ≥ 1): payload koji slučajno nosi
svoja polja `v` i `data` ne može se zamijeniti za envelope.

**Zašto se `version_mismatch` ne briše.** Tokom rolling deploya stari i novi pod rade istovremeno; stari bi vidio
`v: 2`, obrisao tuđu vrijednost i izazvao stampede tačno u najgorem trenutku. Zato se samo preskače — istekne za 60 s
ili 10 min. Brišu se samo vrijednosti koje **nijedan** build ne može koristiti (prevelika, nije JSON).

**Pisanje** je simetrično: payload preko capa se **ne upisuje** (nema smisla praviti zapis koji će svaki čitač
odbaciti), a ni payload koji se ne može serijalizovati (cirkularna struktura). TTL i ključevi ostaju isti, pa nema
promjene u konfiguraciji.

**Mjeri se `Buffer.byteLength`, ne `length`.** Cap je o memoriji i I/O-u; bosansko slovo je dva bajta, pa bi brojanje
znakova propustilo payload od skoro dvostruke predviđene veličine.

### 2. Primitivi (`report-cache-shape.ts`)

`isPlainRecord` (odbija nizove i `null`), `isFiniteNumber` (odbija `NaN`/`±Infinity`), `isCount` (nenegativan
cijeli broj — svaki brojač broji redove), `isInteger` (za `net`, koji legitimno može biti negativan),
`isIsoInstant`, `hasCounts`, `hasNullableNumbers`, `hasIsoWindow`, `isBoundedArray`/`everyItem` (kap prije gledanja
unutar kolekcije), `isRatio`, `isDuration`, `isCsat`, `isNamedBar`.

### 3. Strogi validatori

- **Dashboard** (`parse-report-dashboard-cache.ts`): prozor i prethodni prozor moraju biti parsabilni ISO trenuci;
  `ticketCount` je brojač; `kpis` mora imati svih 14 polja (`createdCount`… `kbResolutionRate`) s brojačima i
  nullable brojevima, a `csatScaleMax > 0` (nula je djelilac na klijentu); četiri lista barova moraju imati
  `{key, label, value}` sa nenegativnim brojačem; `volumeSeries` tačke `{d, created, resolved}`; `aging` svih pet
  segmenata. Nepoznati dodatni ključevi su dozvoljeni (novi build ne smije učiniti stari zapis nečitljivim dok je
  verzija ista — kad se oblik promijeni, `v` se diže).
- **Trendovi** (`parse-report-trends-cache.ts`): `granularity` mora biti jedna od `day|week|month` — nepoznata
  vrijednost znači da payload nije naš; filteri, tačke (`partial`, `created`, `resolved`, `net`, `backlog`, dvije
  trajanja, dva odnosa, CSAT), `totals` (uključujući `resolvedWithoutSla` i `backlogStart/End`), `topServices`
  (stavke + `other` + totali) i `settings` (uključujući `csatScaleMax > 0`).
- **Summary/SLA** (`summary/parse-report-summary-cache.ts`): trinaest brojača kao brojači, `generatedAt` parsabilan,
  `statusCounts`/`priorityCounts` sa imenom i brojačem, tačno 14 dana sa parsabilnim datumima; SLA: `totals` i svaki
  `profiles[].exposure`/`priorities[].exposure` kompletni, `slaProfileId` neprazan.

## Posljedice po ponašanje

- Vrijednost iz drugog builda, iz vremena prije envelope-a, prevelika ili plitka više se **ne servira** — računa se
  iznova iz baze. Za korisnika to znači najviše jedan sporiji zahtjev, nikad pogrešan broj.
- Otrovani ključevi se uklanjaju na prvom čitanju (`oversized`, `invalid_json`), umjesto da troše event loop do TTL-a.
- Payload preko 256 KiB se ne kešira; ako neki budući pack naraste preko capa, to se vidi kao „uvijek miss”, ne kao
  tiho brisanje.
- Nema promjene API-ja, ruta, ključeva ni TTL-ova; `v<authzVersion>` u ključu (W7.100) i `v` u envelope-u su dvije
  različite stvari — prvi je **autoritet** pod kojim je payload izračunat, drugi je **oblik** payloada.

## Testni dokaz

`report-cache-envelope.spec.ts` (**novo, 14**): round-trip; hit za istu verziju; `version_mismatch` bez brisanja
(oba smjera); `not_enveloped` za staru vrijednost i za look-alike sa trećim ključem ili `v: "1"`; `invalid_json` se
briše; `oversized` se odbija **prije** parsiranja i briše; bajtovi vs. znakovi (`č` × 40 = 80 B); pisanje odbija
preveliki i neserijalizabilan payload; default cap; degradacija bez Redisa i kad Redis baca (i na `del`); odbijanje
validatora je miss bez brisanja; `Infinity` ne prolazi.

`report-cache-validators.spec.ts` (**novo, 27**): dashboard — prihvata kompletan payload, odbija 13 varijanti
(niz, prozor, negativan/frakcionalan brojač, `kpis: {}`, string u brojaču, `csatScaleMax: 0`, bar bez labele,
negativan bar, tačka bez datuma, `aging` sa jednim segmentom, kolekcija preko capa); trendovi — prihvata payload sa
negativnim `net`, odbija 12 varijanti (nepoznata granularnost, filteri, `generatedAt`, tačka sa pokvarenim
trajanjem, negativan brojač, frakcionalan backlog, `totals.csat: {}`, pokvarena stavka `topServices`, `csatScaleMax:
0`, tačke preko capa).

`parse-report-summary-cache.spec.ts` (12 → **24**): dodati slučajevi za niz umjesto record-a, frakcionalan i
negativan brojač, neparsabilan `generatedAt`, status bez imena, negativan status, prioritet koji nije objekt, dan
bez objekta/datuma, kolekcija preko capa, `Infinity`; SLA: frakcionalan `exposure`, prioritet bez `exposure`.

`report-summary-cache.spec.ts` (5 → **6**) i `report-dashboard.cache.spec.ts` (+1): zapis je envelope, `v` drugog
builda i stara vrijednost su miss bez brisanja, a dashboard fixture je sada **kompletan** (upravo je `{} as kpis`
bio ono što je stari parser propuštao). Lokalno: `reports` **44 suite / 318 testova** (16 skipped bez
`PRIVACY_IT_DATABASE_URL`/Redis-a), `eslint` 0.

## Otvoreno i dokumentovano

- Cap je **po zapisu**, ne po ključu; Redis `maxmemory` politika ostaje odgovornost infrastrukture.
- Envelope ne skraćuje TTL niti mijenja ključeve, pa W7.100 garancija (revoke mijenja ključ odmah) ostaje netaknuta.
- Vrijednost koja prođe envelope i validator, a ipak je netačna (npr. brojevi iz perioda prije promjene poslovnog
  pravila), i dalje živi do TTL-a — to je dokumentovana granica iz W7.100 (60 s odobreno u stagingu), ne ovaj nalaz.
- `oversized`/`invalid_json` brisanje je best-effort: ako `del` padne, zapis istekne sam.

Sljedeće u `reports`: `BA-reports-16` (`runNow` idempotency), `-17` (PDF intent), `-18` (preview read-audit), `-19`
(12 compile-blocked suiteova / fault matrica).

## Dokaz

CI [`45232992929`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45232992929) **success** na `189366d`: `Backend build + test`, `Backend PostgreSQL + Redis integration`,
`Frontend build + test`, `Backend container + supply chain` i `Docs guard` (`E2E` i inventura `skipped`, kako je
konfigurisano). Detalji u [26-reports.md, §31](../audits/26-reports.md#31-implementacijski-closeout--w7105-ba-reports-15).
