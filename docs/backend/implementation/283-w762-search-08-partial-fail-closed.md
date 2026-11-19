# Package closeout — W7.62

**Paket:** jedan kvar zavisnosti ruši sve tri grupe; nema definisanog partial/fail-closed ugovora<br>
**Nalaz:** `BA-search-08` (P2) — **zatvoren**<br>
**Kodni commit:** `aa57540`<br>
**Finalni testani SHA:** `aa57540`<br>
**CI:** [`44600958560`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44600958560) — zelen (16m22s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §7: `Promise.all` znači da kvar jedne tražene grupe ruši cijeli odgovor. Za komandnu paletu
bi kontrolisani partial mogao biti bolji, **ali odluka mora biti eksplicitna**: fail-closed za autorizacijsku
grešku, kontrolisani partial za dostupnosni kvar — bez prikrivanja security failurea.

Prihvaćeno u ovom paketu (odluka korisnika): **autorizacijska greška uvijek fail-closed**, a dostupnosni kvar
tražene grupe smije biti kontrolisani partial sa eksplicitnim `failedGroups`/`incomplete` ugovorom u API-ju i
paleti.

## Implementacija

- **Klasifikacija na jednom mjestu** (`search-group-failure.ts`), da je servis i njegovi testovi ne mogu
  nacrtati drugačije:
  - **`authorization`** — `401`/`403` (`HttpException`) ili domenski `FORBIDDEN`/`UNAUTHORIZED`
    (`KnowledgeBaseError`, `TicketsError`, bilo koji objekat sa tim `code`-om). Uvijek ruši **cijeli** zahtjev.
  - **`client`** — svaki drugi `4xx`, kao i svaka druga **domenska** greška grupe (`KnowledgeBaseError`/
    `TicketsError` sa drugim kodom). Search sam sastavlja svoje upite, pa takav odgovor znači da zahtjev ne može
    biti ispunjen kako je izdat; partial bi to sakrio iza prazne liste. Zato i to ruši cijeli zahtjev.
  - **`availability`** — `5xx`, mrežne/vremenske/Prisma greške, nepoznato. **Jedina** klasa koja smije degradirati.
- **Servis** (`search.service.ts`): grupe se izvršavaju paralelno, ali kroz `readSearchGroup`, pa svaka vraća
  `skipped` / `ok` / `failed`. Zatim:
  1. fatalni ishod (authorization ili client) ⇒ `throw` tog istog errora — nema partial odgovora;
  2. `failedGroups` = tražene grupe koje su pale iz dostupnosti (kanonski red `ticket, article, user`);
  3. ako su **sve** tražene grupe pale ⇒ `503 SEARCH_UNAVAILABLE` sa `details.failedGroups` — nema „tri prazne
     liste” koje izgledaju kao „nema rezultata”;
  4. inače `200` sa zdravim grupama, praznim palim grupama i `failedGroups`.
- **Ugovor** (`search.types.ts`): `failedGroups: readonly SearchGroupName[]` je **uvijek prisutan** (prazan niz
  kad je sve odgovorilo). `articlesIncomplete` ostaje šta je bio — zastavica **skeniranja** grupe koja je
  odgovorila; pala grupa se nikad ne prijavljuje kao „nepotpuna” nego kao pala. Nezatražena grupa se nikad ne
  pojavljuje u `failedGroups` (test to pinuje).
- **Frontend**: `search-api.ts`/`header-search-match.tsx` prenose `failedGroups` (nepoznata imena se odbacuju,
  red je kanonski, stariji server bez polja ⇒ `[]`); hook razlikuje `429` (budžet) od `503` (prekid rada); paleta
  prikazuje `palette.partialFailure` sa imenima palih grupa i `palette.unavailable` za `503`, i **ne** prikazuje
  „nema rezultata” kad je neka grupa pala ili kad je pretraga nedostupna.
- **Bez migracije** i bez nove konfiguracije.

### Namjerne odluke (trade-off)

1. **Domenske greške nisu „dostupnost”.** Najlakša greška bila bi sve osim `401/403` proglasiti dostupnošću — time
   bi `NOT_FOUND`/`INVALID_*` iz grupe postali tiha prazna lista. Search sam gradi upite, pa takav ishod znači
   neispravno stanje, ne pad zavisnosti: fail-closed.
2. **`503` kad nijedna grupa nije odgovorila.** Alternativa je `200` sa tri prazne liste i
   `failedGroups: [ticket, article, user]` — tehnicki dosljedno, ali klijent koji ne čita polje vidi „nema
   rezultata”, a monitoring vidi uspjeh. `503` je istinit i za ljude i za nadzorne sisteme.
3. **Zastavice ostaju razdvojene.** `articlesIncomplete` (skeniranje stalo) i `failedGroups` (grupa nije
   odgovorila) opisuju dvije različite stvari; spajanje u jedan `partial: true` izgubilo bi informaciju koju
   paleta koristi.
4. **Paleta ne objašnjava sve greške.** `429`, `503` i `failedGroups` su dio ugovora i imaju tekst; ostale greške
   ostaju tiho prazne (do `BA-search-11`, telemetrija), jer poruka „nešto je puklo” bez radnje samo šumi.
5. **Paralelno izvršavanje je zadržano.** Sekvencijalno `await`-ovanje po grupama bi olakšalo ranije odustajanje,
   ali bi utrostručilo latenciju najčešćeg slučaja; `Promise.all` + klasifikacija daje isto jamstvo bez tog
   troška.

## Dokaz

- **`search-group-failure.spec.ts` (4 testa, novi fajl):** authorization (`ForbiddenException`,
  `UnauthorizedException`, `KnowledgeBaseError('FORBIDDEN')`, `TicketsError('FORBIDDEN')`, objekat sa
  `code: 'FORBIDDEN'`) ⇒ fatalno; client (`BadRequestException`, `KnowledgeBaseError('INVALID_CURSOR')`, `409`) ⇒
  fatalno; availability (`InternalServerErrorException`, `ServiceUnavailableException`, `ECONNREFUSED`, `Error`,
  string) ⇒ degradira; `P2025` bez HTTP statusa je dostupnost, ali isti kod uz `401` je autorizacija.
- **`search.service.spec.ts` (+4 testa):** pad article grupe ⇒ ticket grupa odgovara, `articles: []`,
  `failedGroups: ['article']`, `articlesIncomplete: false`; `ForbiddenException` u grupi ⇒ **cijeli** zahtjev
  pada sa `403` (iako su druge grupe uspjele); sve tri grupe pale ⇒ `503` sa
  `details.failedGroups: ['ticket','article','user']`; grupa koja nije tražena se ne prijavljuje, a uspješan
  odgovor nosi `failedGroups: []`.
- **Frontend:** `header-search-match.spec.ts` (+1: prenos, kanonski red, nepoznata imena odbačena, odsutno polje
  ⇒ `[]`), `use-command-palette-search.spec.tsx` (+1: `503` ⇒ `isUnavailable`, `429` nije, uspjeh čisti; i
  `isUnavailable: false` za običnu grešku), `command-palette.spec.tsx` (+2: imenovana pala grupa uz zdrave
  pogotke i nestajanje napomene; `503` prikazuje „nedostupno” i **ne** „nema rezultata”).
- Lokalno: backend `modules/search` (9 suite/66) + `app.module.spec.ts` + `modules/knowledge-base` =
  **28 suite / 161 test** zeleno; `eslint` i `tsc --noEmit` čisti za modul; frontend `vitest
  src/components/layout` **11 fajlova / 39 testova** i `src/i18n` **8 fajlova / 48 testova** zeleno,
  `prettier --check`, `tsc --noEmit`, `eslint` čisti; `wiring:check` (99 controllera / 631 ruta) i
  `check-env-example` (93 varijable) nepromijenjeni; `check-docs-content` OK.

## CI

[`44600958560`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44600958560) na `aa57540` —
**success** (19:41:40Z–19:58:02Z, 16m22s): backend build/lint/full Jest, PostgreSQL + Redis integracija,
frontend lint/format/testovi/build/bundle, Docs guard, container/supply-chain i CI gate. E2E install wizard, E2E
critical flows i read-only inventory `skipped` (E2E pokreće korisnik).

## Registar nalaza

- Zatvoreni: `BA-search-08` (P2). **`search` više nema otvoren P2.**
- Ostaju otvoreni u `27-search.md`: 5 nalaza, svi P3 — `09` (stable order), `10` (`ArrayUnique`), `11`
  (telemetrija), `12` (confidential/arhiva test), `13` (compile-blocked suite/E2E).

## Rollout, rollback i preostali rizik

Nema migracije ni konfiguracije. Rollout: nema akcije — ponašanje se mijenja samo u kvaru (prije: cijeli
zahtjev pada; sada: imenovani partial, odnosno `503` kad nema ijedne grupe). Rollback: revert `aa57540`.

**Preostali rizik:** (1) **klasifikacija zavisi od tipova grešaka** — ako neka buduća zavisnost baci `4xx` za
vremenski prekid, zahtjev će pasti umjesto da degradira; to je namjerno konzervativan izbor (fail-closed), ali
znači da novi `4xx` izvor treba svjesno klasificirati; (2) **nema per-group timeouta** — „dostupnost” pokriva
greške, ali ne i beskonačno visenje jedne grupe; bounded timeout bi bio zaseban paket (i traži odluku o
budžetu); (3) **nema telemetrije** `failedGroups` (koliko često, koja grupa) — to je `BA-search-11`; (4) partial
odgovor je i dalje `200`, pa ga štiti samo polje `failedGroups`; klijent koji polje ignoriše vidi praznu grupu
(namjerno dokumentovan ugovor, ne greška u implementaciji); (5) `530`/`502` iz gatewaya ispred API-ja nisu
predmet ovog paketa.

## Sljedeći paket

`search` je time završio sve P2 nalaze. Sljedeći P2 paket u Val 7 je `BA-changes-08` (prvi otvoreni P2 u auditu
`24-changes.md`), osim ako se ne odabere red po veličini zaostalih P2 grupa (`reports` 12, `knowledge-base` 10,
`changes` 10).
