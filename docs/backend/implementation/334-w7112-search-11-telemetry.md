# W7.112 — `BA-search-11`: privacy-safe telemetrija, per-group SLO i „incomplete”

**Paket:** Val 7, `search`, **P3**<br>
**Nalaz:** „Nema privacy-safe search telemetry, per-group latency/SLO ni incomplete indikator”<br>
**Kod:** `search-telemetry.ts` (**novo**, ugovor i format), `search-telemetry.service.ts` (**novo**, sink),
`search.service.ts` (mjerenje po grupi + emit), `search.module.ts` (provider), `.env.example`
(`SEARCH_TELEMETRY_SALT`)<br>
**Specovi:** `search-telemetry.spec.ts` (**novo, 11**), `search-telemetry.service.spec.ts` (**novo, 4**),
`search.service.spec.ts` (+5)<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** _popunjava se nakon push-a_

## Nalaz

`GET /search` nije ostavljao **nijedan** operativni trag: nije bilo zapisa o tome koliko pojedina grupa traje, koliko
je kandidata pretraženo, koliko je rezultata vraćeno, da li je neka grupa pala, da li je answer bio odsječen ni da li
je zahtjev odbijen. Posljedice:

- incident („pretraga je spora”, „palette ne vraća ništa”) nije mogao biti raščlanjen po grupi — jedina informacija
  bila je da cijeli endpoint traje;
- nije bilo osnove za SLO: bez brojanja i trajanja po grupi ne može se reći je li 250 ms cilj prekršen ni koliko
  često;
- `articlesIncomplete` je postojao u odgovoru, ali ne i u telemetriji, pa se „skeniranje je stalo” nije moglo
  agregirati; isto važi za `failedGroups`.

Audit je istovremeno postavio tvrd uslov (§14.8): **telemetrija ne smije pohranjivati sirov termin**. Upit je
slobodan tekst — ime osobe, hostname, naslov tiketa — pa bi „loguj query” bio privacy regres, ne poboljšanje.

## Rješenje

### 1. Ugovor: šta smije izaći iz procesa

`search-telemetry.ts` je čist modul (bez DI-ja) i ujedno dokument ugovora:

| Polje | Sadržaj | Zašto je sigurno |
|---|---|---|
| `status` | `ok` · `partial` · `unavailable` · `rejected` | fiksni enum |
| `query_len` | broj **karaktera** (code points) normalizovanog upita | dužina, ne sadržaj |
| `query_hash` | HMAC-SHA256(salt, termin), prvih **16 hex** znakova | bez salta se ne može vratiti; kratki pojmovi se ne mogu pogoditi iz rječnika |
| `types` | tražene grupe | enum lista |
| `limit` | 1–25 | broj |
| `duration_ms`, `latency_bucket` | trajanje zahtjeva + fiksni bucket | broj / enum |
| `search_group_<ime>` | `state:hits:durationMs:truncated` | brojevi i enum |
| `incomplete` | grupe koje nisu iscrpne | enum lista |
| `slo_breaches` | broj prekršaja (grupa + ukupno) | broj |

Ni jedno polje ne prima termin, ID tiketa/članka/korisnika, adresu ni aktera. `describeSearchTerm()` je jedini ulaz
za termin i vraća **samo** `{ length, hash }`; formatter uopšte nema parametar za sirov tekst.

Salt dolazi iz `SEARCH_TELEMETRY_SALT`; kad nije postavljen, proces uzima slučajan salt (hash tada nije uporediv
između restarta, ali nikad nije reverzibilan). Oba slučaja su ne-fatalna — telemetrija ne smije zaustaviti pretragu.

### 2. Format i nivo loga

Jedna linija po odgovorenom zahtjevu, u `key=value` obliku koji repo već koristi (Phase 0/4.1,
`format-job-metrics.ts`):

```
search_telemetry=1 status=ok query_len=11 query_hash=0e0171db3ae343b5 types=ticket,article,user limit=15
duration_ms=42 latency_bucket=lt50 search_group_ticket=ok:12:9:false search_group_article=ok:1:31:false
search_group_user=skipped:0:0:false incomplete= slo_breaches=0
```

Svaki token je `key=value` (prvi token je `search_telemetry=1`), pa u liniju ne može ući slobodan tekst. Prekršaj
SLO-a se piše kao `warn`, sve ostalo kao `log` — operator alarmira na `warn` i na `slo_breaches>0`, a oblik linije je
isti u oba slučaja.

### 3. SLO

```ts
export const searchSlo = {
  groupMs: { ticket: 250, article: 500, user: 250 },
  totalMs: 900,
};
```

Ticket i user grupa su po jedan indeksiran read; article grupa hoda bounded keyset scan (do
`knowledgeBaseConstants.maximumListScanBatches` batch-eva), a tri grupe rade paralelno — zato je ukupan budžet
najsporija grupa + orkestracija, ne zbir. Ciljevi su **alarmi na liniju**, ne timeouts: prekršaj se loguje, odgovor
se i dalje vraća.

### 4. Gdje se mjeri

`readSearchGroup()` sada mjeri trajanje svake grane (`Date.now()` prije/poslije), a `SearchService` iz **istih**
ishoda gradi telemetry draft iz kojeg se gradi odgovor — linija zato ne može opisivati drugi run. Emit se dešava na
sva četiri izlaza:

- sve tražene grupe odgovorile → `status=ok`;
- neka grupa pala iz dostupnosnog razloga → `status=partial` (imena grupa su u `search_group_*=failed`);
- nijedna nije odgovorila (endpoint vraća `503 SEARCH_UNAVAILABLE`) → `status=unavailable`;
- fatalna (autorizacijska/klijentska) greška se rethrow-uje → `status=rejected` — security odluka nikad ne izgleda
  kao prazan uspjeh.

`hits` je broj vraćenih redova, a `truncated` je `true` kad je grupa vratila tačno `limit` redova (moguće još) ili
kad se article scan zaustavio na budžetu. To je serverski „incomplete” signal iz nalaza; **odgovor** zadržava samo
`articlesIncomplete` (promjena API ugovora nije bila dio ovog paketa).

### 5. Kvar telemetrije nikad ne mijenja odgovor

Sink (`SearchTelemetry.record`) je totalan: hvata i grešku loggera i grešku formattera. Servis uz to hvata i kvar
samog `describeTerm`/`record` poziva. Test to dokazuje sa loggerom koji baca i sa salt čitačem koji baca — pretraga
i dalje vraća rezultate.

## Dokaz

- `search-telemetry.spec.ts` (**novo, 11**): termin se nikad ne vraća (samo `length` + 16-hex hash; nema ga ni kao
  hex UTF-8 bajtova), dužina se broji u karakterima (emoji), hash je determinističan za isti salt i različit za drugi,
  salt fallback je slučajan i nikad prazan, bucket granice (10/25/50/100/250/500/1000 ms), SLO brojanje (striktno
  `>`, skipped grupa se ne broji), format linije (svi tokeni `key=value`, `incomplete=` lista, bez traga termina).
- `search-telemetry.service.spec.ts` (**novo, 4**): jedna linija po zahtjevu na `log`, prekršaj na `warn` sa istim
  oblikom, logger koji baca ne ruši `record`, `describeTerm` stabilan i bez termina.
- `search.service.spec.ts` (+5): `ok` zapis sa dužinom/hash-om i brojem hitova; `limit=1` označava `truncated` i
  zaustavljen article scan ulazi u `incomplete`; `partial` imenuje grupu koja je pala; `503` → `unavailable`, `403` →
  `rejected`; pokvaren sink i pokvaren salt ne mijenjaju odgovor.

Lokalno: `search` **11 suiteova / 96 testa** (1 integracioni suite sa 3 testa uslovno preskočen bez
`PRIVACY_IT_DATABASE_URL`), `nest build` zelen, `eslint src/modules/search --max-warnings=0` čist,
`app.module.spec` + `worker.module.spec` (DI graf) zeleni, `wiring:check` 632 rute, `check-env-example` 94 varijable
u sinhronizaciji.

## Otvoreno i dokumentovano

- **Nema novog endpointa ni Redis brojača.** Linija je izvor za log/metrics pipeline; ako zatreba
  `GET /search/metrics/last-hour` po uzoru na `security:metrics`, to je nova odluka (nova ruta) i nov nalaz.
- **`truncated` je serverski signal.** API i dalje nudi `articlesIncomplete` samo za article grupu; proširenje
  odgovora na ticket/user grupe nije dio ovog paketa.
- **Nema per-group timeouta.** SLO mjeri i alarmira, ne prekida; visenje jedne grupe i dalje drži cijeli zahtjev
  (dostupnost pokriva greške, ne visenje) — kandidat za zaseban nalaz.
- **Ostali P3 nalazi `search` modula:** `-12` (confidential/arhiva/revoke testovi) i `-13` (direktni `/search` E2E).
