# W7.113 — `BA-search-12`: confidential, arhiva, spojeni tiket i revoke kroz `/search`

**Paket:** Val 7, `search`, **P3** — **test-only** (bez promjene produkcijskog koda)<br>
**Nalaz:** „Confidential/archive/revoke semantika nema direktan search test”<br>
**Kod:** bez izmjena (`search.service.ts`, `search-users.ts` i DTO ostaju netaknuti)<br>
**Specovi:** `search.service.spec.ts` (+4; `harness` sada izlaže `archiveConfig`/`confidentialConfig`)<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** _popunjava se nakon push-a_

## Nalaz

Ticket grana `/search`-a namjerno **ponovo koristi** listu (`TicketsService.searchTickets` →
`listTicketsWithin` → `buildTicketListWhere`): puni ticket gate, aktuelni archive config i centralni visibility
builder. To je jak obrazac, ali audit je primijetio da **nijedan test ne dokazuje** da paleta zaista poštuje
naslijeđene semantike:

- **confidential naslov** — ako paleta procuri naslov povjerljivog tiketa, curenje je u globalnoj površini koja se
  otvara jednim `Ctrl+K`, a ne u listi koju korisnik svjesno filtrira;
- **arhiva** — kada tiket pređe u `ARCHIVED` i šta znači archive switch za paletu;
- **spojeni tiket** — child koji je merge-om apsorbovan u parenta;
- **revoke između sesije i pretrage** — sesija je prošla guard, ali je kontekst u međuvremenu uklonjen ili sužen.

Postojeći spec je pokrivao scope paritet (`search` = `list`) i `failedGroups`, ali nijedan od ovih scenarija.

## Šta je dodato

Četiri direktna testa u `search.service.spec.ts`, u novom bloku
`ticket semantics the palette inherits (W7.113)`. Svaki poredi `/search` sa `GET /tickets` **za istog aktera i isti
svijet** — jer je „paleta pokazuje isto što i lista” cijeli razlog zbog kojeg ticket grupa i koristi listin upit.

### 1. Confidential naslov

Tiket `t6` (`isConfidential: true`, u scope-u aktera) i tri aktera:

| Akter | Lista | `/search` |
|---|---|---|
| `agentIt` u scope-u, bez granta | prazno | prazno |
| requester tiketa | `t6` | `t6` (i tačno `{id, ticketNumber, title}` — bez opisa) |
| `agentIt` kao assignee (handler grant) | `t6` | `t6` |

Test time dokazuje i **projekciju**: paleta vraća samo broj i naslov, pa confidential opis/body ne može iscuriti ni
kad naslov smije biti vidljiv.

### 2. Arhiva i archive switch

Test pinuje stvarni ugovor, koji nije bio očigledan:

- paleta **nikad** ne vraća arhivirani tiket — ni običnom agentu, ni SUPER_ADMIN-u — jer ne šalje `status` ni
  `includeArchived`, pa zajednički status filter uvijek isključi `ARCHIVED`;
- lista **može** do njega (`status=ARCHIVED`), i tu se vidi switch: sa `searchable=false`, agentov arhivski pogled je
  prazan, a sa `searchable=true` vraća tikete;
- u oba položaja switcha `/search` ostaje prazan — dakle paleta **ne zavisi** od archive switcha. To je sada
  eksplicitan ugovor, a ne slučajnost.

### 3. Spojeni tiket

Parent `t8` + child `t9` (`mergedIntoTicketId: 't8'`, isti terminalni status):

- `/search` vraća child (`t9`) — i to je ispravno: spojeni tiket je **čitljiv**, njegova stranica vodi na parenta;
- lista bez filtera vraća isto (`t9`), pa je paritet potpun;
- lista sa **opcionim** filterom `hideMerged=true` vraća prazno — razlika je u tome što je `hideMerged` UI filter
  (checkbox „Sakrij spojene”), a ne visibility pravilo, i paleta ga ne šalje;
- parent ostaje pronalaziv po svom naslovu (`t8`).

### 4. Revoke između sesije i pretrage

- baseline: `agentIt` vidi `t1`, `t2`;
- **suženje**: isti `subjectId`, ali assignment prebačen na drugu OU → `/search` vraća prazno, i lista vraća prazno;
- **uklanjanje**: kontekst obrisan → `/search` baca **403** (fail-closed), nikad prazan odgovor koji bi se mogao
  pročitati kao „nema pogodaka”.

## Dokaz

`search.service.spec.ts` (+4, ukupno **26** u tom suiteu). Lokalno: `search` **11 suiteova / 100 testa** (1
integracioni suite sa 3 testa uslovno preskočen bez `PRIVACY_IT_DATABASE_URL`), `nest build` zelen,
`eslint src/modules/search --max-warnings=0` čist, `wiring:check` 632 rute.

Produkcijski kod nije mijenjan — paket je dokaz postojećeg ponašanja, ne nova semantika. Zato nema migracije, nema
promjene ruta i nema promjene odgovora.

## Otvoreno i dokumentovano

- **`hideMerged` nije visibility pravilo.** Paleta prikazuje spojene tikete dok ih lista može sakriti checkboxom. Ako
  se jednog dana traži da ih i paleta sakrije, to je promjena ugovora (novi nalaz), ne bug u ovom paketu.
- **`includeArchived` zaobilazi switch.** Probom je potvrđeno da lista sa `includeArchived=true` vraća arhivirane
  tikete i kada je `archive.searchable=false`; paleta taj parametar ne koristi, pa ovaj paket na njega nije vezan, ali
  je razlika zabilježena kao kandidat za zaseban nalaz u modulu `tickets`.
- **Break-glass i allowed-viewer grupe** confidential matrice nisu direktno testirani kroz `/search`; pokriva ih
  `build-ticket-visibility-where.spec.ts` na nivou predikata. Ako se traži i paleta-na-paleti dokaz, to je proširenje
  ovog bloka.
- **Ostaje `BA-search-13`** (glavni service suite „compile-blocked” i direktni `/search` E2E).
