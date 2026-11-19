# W7.64 — `BA-changes-08`: lifecycle commit i downtime sync/release

**Paket:** Val 7, audit 24 / `changes` — durable lifecycle → downtime veza<br>
**Nalaz:** `BA-changes-08` (P2) — „Lifecycle commit i downtime sync/release nisu durable; status i availability
mogu odstupati”<br>
**Kodni commit:** `06b3bee` · **CI:** [`44623850740`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44623850740) (success)<br>
**DB migracija:** nema — paket koristi postojeću `OutboxMessage` tabelu i `ServiceDowntimeWindow.message`

## Šta je nalaz tvrdio

Audit 24 (§8) opisuje dva koraka koja nisu jedan workflow: lifecycle transakcija (`schedule`, `authorize`,
`start`, `finish`, `cancel`, reschedule) commitira status, a `syncDowntime`/`release` se izvršava poslije nje i
guta sve greške, samo loguje i vraća uspjeh. Posljedice koje audit navodi:

- change može biti `SCHEDULED` bez potrebnog maintenance prozora;
- reschedule može ostaviti stari prozor;
- cancel/finish može ostaviti budući downtime aktivan;
- approval API vraća uspjeh iako availability stanje nije usklađeno;
- nema automatskog reconciliationa očekivani-vs-stvarni prozor.

## Šta je zatečeno

Durable polovina ovog nalaza **je već isporučena** kroz `BA-service-catalog-11` (audit 15, dokument 107), i to je
provjereno u kodu prije bilo kakve izmjene — nije prihvaćeno na riječ iz dokumentacije:

| Tvrdnja iz `BA-changes-08` | Stanje u kodu prije W7.64 |
| --- | --- |
| sync/release se izvršava poslije commita i guta greške | **ne stoji** — `syncDowntime` nema `catch`; greške idu u outbox retry |
| nema trajne namjere | **ne stoji** — `enqueueChangeDowntimeSync` se poziva **unutar** lifecycle transakcije u `create`, `update`, `act` i `approvals` |
| nema retry/dead-lettera | **ne stoji** — `change.downtime.sync` (max 10 pokušaja) kroz `TransactionalOutboxService` |
| nema reconciliationa | **ne stoji** — `ChangeDowntimeOutboxReconciler` (drain 2 s, drift scan 30 s, keyset po 100) |
| nema health signala | **ne stoji** — `ops-health` prikazuje `changeDowntimeOutbox` (pending/processing/dead-letter/najstarije) |

Provjera je ipak našla **jednu stvarno otvorenu granu** iste klase: tekst prozora (`CHG000012: <naslov>`) je
izvedeno stanje, ali ga ni update putanja ni drift provjera nisu gledale. Preimenovanje zakazanog changea zato
nikad nije stiglo u servisni kalendar — prozor je trajno reklamirao stari naslov, a reconciler ga nije vidio kao
drift. To je „status i availability odstupaju” u najčišćem obliku, pa je paket zatvoren na tom mjestu.

## Šta je urađeno

- **`changeUpdateAffectsDowntime`** (`change-downtime-outbox.ts`) — jedno mjesto koje odlučuje da li izmjena
  zaslužuje novu sync naredbu: `title`, `causesDowntime`, `plannedStart`, `plannedEnd` ili promjena service
  linkova. `changes.service.update` je sada koristi umjesto ručne liste polja, pa je `title` uključen.
- **`downtimeMessage`** (`change-schedule.service.ts`) — tekst prozora se gradi na jednom mjestu (prefix broja,
  naslov, truncation na `maximumMessageLength`), pa sync i drift ne mogu dati različite stringove.
- **`syncDowntime` / `apply`** — prozor koji preživi plan a ima zastario tekst dobija `message` update uz
  `recordServiceCatalogChange` zapis; `changeEvent.detail` nosi `messageUpdated`. Prozori koji se brišu ili
  re-tajmiraju ne dobijaju dvostruki update.
- **`hasDowntimeDrift`** — pored plana (create/update/delete) prijavljuje i **message-only** drift, pa
  reconciler pokriva i ovaj slučaj. Provjera čita samo prefiks broja (`ChangeAccessService.changeNumberPrefix`)
  umjesto osam settings čitanja pune konfiguracije.
- **Idempotentnost** — redelivery iste outbox naredbe čija je jedina radnja poruka ostaje no-op kroz postojeći
  `outboxDedupeKey` (`hasDowntimeCommandEvent`); message-only i skip-only slučajevi se dedupiraju isto.
- Nema promjene API oblika, šeme baze ni konfiguracije; `own` prozor u tipu `OwnDowntimeWindow` dobio je
  opcionalni `message` samo radi poređenja.

## Dokaz

- `change-downtime-outbox.spec.ts` (+3): rename je drift, uređivanje opisa nije, promjena service linka jeste.
- `changes-service-downtime-outbox.spec.ts` (+1): rename zakazanog changea enqueueuje sync **unutar** iste
  transakcije (redoslijed `change-update` → `outbox-enqueue`).
- `change-schedule-downtime-sync.spec.ts` (+4): message-only drift, „staloženo” stanje kad se tekst slaže,
  refresh zastarjelog teksta bez diranja prozora koji su u redu, i no-op pri redelivery-u.
- Changes modul: **17 suite / 93 testa** zeleno; ostatak backenda u CI-ju: „Backend build + test”, „Backend
  PostgreSQL + Redis integration”, frontend, docs-guard i supply-chain **success**; E2E i inventory `skipped`.

## Preostali rizik

1. **Message-only drift je vidljiv tek na sljedećem scanu** (30 s) ili na prvoj sljedećoj izmjeni; to je i cilj
   outbox obrasca, ali znači da kalendar može kratko nositi stari naslov.
2. **Skipped service zbog stranog preklapanja** ostaje zapisan u `changeEvent.detail.skippedServiceIds`, ali se
   još ne prikazuje kao operativni warning u `ops-health` — to je eksplicitno dio `BA-changes-13` (drift health),
   ne ovog nalaza.
3. **Reconciler skenira po keyset batchu od 100** na 30 s; pri velikom broju changeova puni ciklus traje više
   tickova (namjerno, da ne optereti bazu), pa se drift može ispraviti sa zakašnjenjem.
4. **Naslov se ne skraćuje u pretrazi**, samo u tekstu prozora; izmjena naslova i dalje mijenja samo `message`,
   ne i identitet prozora.

## Sljedeće

Sljedeći P2 u auditima 24 je `BA-changes-09` (requester/owner/CAB visibility izuzeci vraćaju puni plan, linkove,
events i vote komentare).
