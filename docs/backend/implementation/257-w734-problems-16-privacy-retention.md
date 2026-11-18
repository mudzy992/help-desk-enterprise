# Package closeout — W7.34

**Paket:** W7.34 — privacy/retention za probleme: imenovanja, replike i closed-record lifecycle<br>
**Nalaz:** `BA-problems-16` (P2) — zatvoren<br>
**Kodni commit:** `111f3e6` (implementacija), `fcee1e8` (contract guardovi zadržavanja)<br>
**Finalni testani SHA:** `fcee1e8`<br>
**CI:** [`44279046507`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44279046507) — zelen<br>
**DB migracije:** nema (nema schema promjene)

## Nalaz i acceptance

Audit (§11, `23-problems.md`) opisuje četiri stvari pod jednim ID-om:

1. **Imenovanja.** Anonimizacija pronalazi problem samo ako je osoba kreator, vlasnik ili je njen tiket
   u scrub scopeu. Problem koji osobu **imenuje u tekstu** (menadžer citiran u 5-zašto, kolega u
   zaobilaznom rješenju) nije ulazio u scrub skup.
2. **Replike.** Notifier u in-app obavještenje prepisuje naslov problema (`body = broj · naslov`), a
   problem može vezati članak baze znanja; nijedna od tih kopija nije bila vezana za granicu
   zadržavanja problema. Event JSON i link metadata nisu se uklanjali nikad.
3. **Closed-record lifecycle.** Problem se nije mogao obrisati kroz API (nema `delete`), pa su
   zatvoreni i otkazani zapisi, event JSON i link metadata ostajali trajno.
4. **Pseudonimizirani prikaz.** Trebalo je provjeriti prikazuju li vlasnik/kreator pseudonim nakon
   anonimizacije.

Acceptance iz audita: (a) scrub/anonimizacija pokriva imena i identitete koji **nisu** creator/owner/
requester (event JSON, link metadata, tekst); (b) notifier body/e-mail i KB draft ne smiju replicirati
problem title/RCA izvan problem retention granice; (c) eksplicitna problem retention/tombstone
politika za closed/cancelled zapise uz legal hold; (d) provjera pseudonimiziranog prikaza vlasnika i
kreatora.

**Odluka o migraciji (trajno pravilo paketa).** Polazi se od toga da migracije nema, i nije bilo
potrebno: oznaka „već redigovano“ je postojeći `retentionRedactionMarker` u naslovu, a stanje
zatvaranja/otkazivanja čitaju postojeće kolone `status`, `closedAt` i `cancelledAt`. Nova kolona
`contentRedactedAt` bila bi ljepša (kao kod tiketa i statusnih incidenata), ali ne mijenja ni jedno
ponašanje koje acceptance traži; ako je zatreba za reporting, to je zaseban, aditivni paket.

## Implementacija

### (a) Anonimizacija: izbor po imenovanju, ne samo po vezi

**`anonymization/problem-mentions.ts` (novo)**

- `problemMentionTokens(identifiers)` gradi tačno one stringove koje scrubber **može** zamijeniti:
  puna adresa, lokalni dio adrese ≥ 5 znakova, DN, login ≥ 4 znaka i puno ime u oba redoslijeda
  (`nameVariants`). Isti pragovi kao u `text-scrubber.ts`, pa se filter i zamjena ne mogu razići.
- `problemMentionWhere(tokens)` — `OR` po svih šest scrubbable kolona (`title`, `description`,
  `rootCause`, `workaround`, `resolution`, `cancelReason`) sa `contains` + `mode: 'insensitive'`. Filter
  je namjerno **superset**: podstring u bazi može pogoditi token unutar duže riječi gdje scrubber ne
  bi zamijenio (word boundary). Višak redova je bezopasan — scrub je idempotentan i problem bez ijedne
  zamjene se preskače.
- `problemEventMentionSql(tokens)` — jedan ograničen `SELECT "id" FROM "ProblemEvent" WHERE
  "detail"::text ILIKE …` za cijeli run: Prisma ne filtrira tekst unutar `Json` kolone, a upit po
  eventu bio bi N+1.
- `createTextScrubber` sada vraća i `identifiers`, pa filter nastaje iz istog izvora kao zamjena.

**`anonymization/scrub-problem-mentions.ts` (novo)** — jedan ulaz koji koristi i izvršenje i preview:

- problem: `createdByUserId` / `ownerUserId` / povezani tiket **ili** tekstualno imenovanje; scrub svih
  šest kolona + `rcaWhys` (JSON);
- event: detalji eventa koji je osoba izazvala, eventa odabranih problema **i** eventa čiji JSON
  imenuje osobu (raw upit gore);
- obavještenja: redovi pronađeni preko `payload.problemId` (pokazivač, ne pretraga teksta);
- baza znanja: članak koji je problem napravio (`knowledgeArticleId`) — naslov i tijelo, i nacrt i
  objavljeni, jer scrubber mijenja samo identitete i članak ostaje upotrebljiv.

`anonymization-executor.ts` zove taj modul umjesto ranijeg inline bloka (ista mjesta u `counts`:
`problems`, `problemEvents`, plus novo `problemNotifications`, `knowledgeArticles`). Preview sada
prijavljuje i `problemsNamed` / `problemEventDetailsNamed`, pa probni prolaz pokaže i probleme koje
osoba samo spominje; tekstualne zamjene iz tih problema ulaze u `textReplacements` i primjere.

### (b) Replike: granica zadržavanja pokriva i kopije

- **In-app obavještenje** nosi `broj · naslov` (bez opisa, bez RCA, ≤ 500 znakova) i `payload.problemId`.
  Retention sada redaktuje `title`/`body`/`payload` svih obavještenja koja pokazuju na problem, pa
  kopija ne živi duže od problema. Novi guard u `problem-notifier-dedupe.spec.ts` drži oba dijela
  ugovora: naslov je samo headline i pokazivač je uvijek tu (inače retention kopiju ne bi našao).
- **E-mail** se sastavlja u trenutku slanja (`composeProblemEmail`) i ne pohranjuje se: ledger
  `NotificationEmailDelivery` čuva primaoca, ključ, status i pokušaje, ne tijelo poruke. Zato e-mail
  ne može nadživjeti problem u bazi; to je sada eksplicitno dokumentovano, a ne pretpostavljeno.
- **Baza znanja.** Nacrt (`DRAFT`) koji je problem napravio redaktuje se zajedno s problemom. Objavljeni
  članak se **ne** dira: to je objavljeni sadržaj koji ima svoj životni ciklus (verzije, povlačenje,
  vlasnik), a tiha redakcija iz retention runa bila bi gubitak sadržaja koji je neko objavio namjerno.
  Identiteti u objavljenom članku se ipak uklanjaju — anonimizacijom, koja mijenja samo identitete.
  Granica je zapisana i u opisu postavke.

### (c) Retencija: nova kategorija `problemContent`

Nova kategorija u `privacy.constants.ts` (i u `retentionCategoriesRequiringDryRun`) sa sopstvenim
executorom; u redoslijedu noći ide **poslije** `ticketContent` (problem citira tikete, pa prvo tiketi
izgube tekst), prije `audit`.

**`retention/problem-content-retention.executor.ts` (novo)**

- **Due:** `status in (CLOSED, CANCELLED)` uz `closedAt`/`cancelledAt < cutoff` i naslov ≠ marker.
- **Pravna blokada:** preskače se problem čiji je vlasnik ili kreator pod blokadom, kao i problem koji
  ima povezani tiket pod blokadom (problem koji citira blokiran tiket ne smije nestati ispod blokade).
- **Redakcija (jedna transakcija po batchu od 50):** `title`/`description` → marker, `rootCause`,
  `workaround`, `workaroundAt`, `resolution`, `cancelReason` → `null`, `rcaWhys` → `DbNull`;
  `ProblemEvent.detail` → `DbNull` (akcija, akter i vrijeme ostaju); `ProblemHandoff.reason` → marker,
  `decisionReason` → `null`; `ProblemResolutionRun.message` → marker, `responseBody` → `DbNull`,
  `lastError` → `null`; obavještenja problema → marker/`null`/`DbNull`; nacrt članka → marker.
- **Kostur ostaje:** broj (`sequence`), status, prioritet/uticaj/hitnost, grupa, jedinica, usluga,
  vlasnik, datumi, sve veze (tiket, imovina, usluga, incident) i metrika — reporti, pretraga i dvije
  `problems` reporte ostaju tačni.
- **Idempotencija:** `title = marker` znači „već redigovano“; drugi run ne nađe ništa. `refs` u
  `RetentionRun` su `#<sequence>` (broj problema nije pohranjen u koloni, a izvedeni broj je dovoljan
  operatoru da nađe zapis bez sadržaja).
- Nema brisanja redova: tombstone je „kostur + marker“, isto pravilo kao `ticketContent` i
  `statusIncidents`.

**Postavka:** `private.privacy.retention.problemContentDays`, default **0** (isključeno), minimum
**180** dana, maksimum 36 500, uz obavezan probni prolaz (dry run) — kao `ticketContent`. Uz nju su
ažurirani loader (ključ/default/minimum), ROPA (`processing-record.service.ts`, bs/en), e-mail
sažetak retention runa (`compose-privacy-email.ts`, bs/en), frontend lista kategorija i bs/en labeli.

### (d) Pseudonimizirani prikaz vlasnika i kreatora

Provjereno čitanjem: problem nigdje ne drži denormalizovano ime. `listSelect`/`detailSelect` u
`problems.service.ts` uzimaju `owner: { select: userSelect }` i `createdBy: { select: userSelect }`,
event i history prikazuju aktera kroz isti join, a `ProblemNotifier` čita `owner.displayName` iz
`User` reda. Pošto anonimizacija mijenja `User.displayName` u pseudonim, svaki prikaz vlasnika,
kreatora, aktera eventa i primaoca podsjetnika odmah pokazuje pseudonim — bez dodatnog koda i bez
prepisivanja problema. Dedup i pretraga vlasnika rade po `userId`, ne po imenu.

### Frontend i guardovi

- `services/privacy-api.ts`: lista kategorija je dobila `problemContent` **i** `statusIncidents`.
  Potonja je postojala u API-ju i u oba prevoda, ali nije bila u listi, pa operator nije mogao vidjeti
  ni filtrirati njene runove — tiha rupa koju je novi guard sada zatvorio.
- `services/privacy-retention-categories.spec.ts` (novo, 3 testa): lista mora biti **tačno** skup
  kategorija iz backend `privacy.constants.ts`, a bs/en moraju imati `name` i `hint` za svaku.
- `privacy.counts.*` labeli (bs/en) za `problems`, `problemEvents`, `problemNotifications`,
  `knowledgeArticles`, `problemsNamed`, `problemEventDetailsNamed` — ti ključevi su se ranije prikazivali
  kao sirovi ključevi u tabeli izvršenja.
- Settings registry coverage guard je dobio 518. ključ; naslov postavke ostaje u jednom redu (≤ 220),
  detalj je u help tekstu (≤ 420).

## Direktni testni dokaz

- `problem-mentions.spec.ts` (6) — tačan skup tokena (adresa, lokalni dio, DN, login, ime u oba
  redoslijeda); pragovi (kratak lokalni dio/login/ime se preskaču, puna adresa ostaje); filter po svih
  šest kolona sa `insensitive`; prazan skup tokena nikad ne matcha; jedan `ILIKE` upit za evente sa svim
  tokenima; scrubber izlaže `identifiers` iz kojih filter nastaje.
- `scrub-problem-mentions.spec.ts` (7) — problem se scrubuje i broji, nedirani se preskače; izbor je
  veza **i** imenovanje (uključujući povezane tikete); event detalji (vlastiti, od odabranih problema,
  imenovanje u tuđem problemu) sa tačnim skupom ID-eva; in-app kopija; članak baze znanja; potpuno
  odsustvo osobe vraća nule i ne poziva nepotrebne upite.
- `problem-content-retention.executor.spec.ts` (5) — preview broji samo zatvorene/otkazane koji nisu
  redigovani; kostur ostaje (status/sequence/`knowledgeArticleId` se ne diraju) uz marker na svim
  sadržajnim kolonama i `refs` `#42`; replike (event, handoff, resolution run, obavještenje, **samo
  nacrt** članka) se redaktuju; pravna blokada vlasnika/kreatora/povezanog tiketa je u filteru; prazan
  batch ne otvara transakciju.
- `problem-notifier-dedupe.spec.ts` (+1) — kopija je samo headline (broj · naslov, ≤ 500, bez preloma)
  i nosi `payload.problemId`/`problemNumber`, što retention koristi kao pokazivač.
- Ažurirani contract guardovi: `attachments.constants.spec.ts` (lista executorа) i
  `retention.integration.spec.ts` (redoslijed noći).
- Frontend: `privacy-retention-categories.spec.ts` (3) i `settings-registry-coverage.spec.ts` (518).

## CI i testni dokaz

CI run [`44279046507`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44279046507) na
`fcee1e8`:

- **Backend:** generisani Prisma (`Validate`/`Generate`/`Verify artifacts`), build sa anotiranim
  dijagnostikama, `npm run lint`, wiring (API/worker/scheduler/shutdown), SLA matrica i pun
  `npm test -- --ci --coverage=false` — prolaze.
- **PostgreSQL/Redis integracija:** prolazi; paket ne dodaje migraciju, pa run dokazuje da nova
  kategorija radi na postojećoj šemi i da redoslijed noći odgovara guardu.
- **Frontend:** lint, Prettier, `npm test`, build i bundle/cold-route budgeti — prolaze.
- **Docs/CI gate/container:** docs guard, container + supply chain i `CI gate` prolaze.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E install wizard` i `E2E critical flows`
  — workflow ih preskače na ovom tipu promjene (`skipped`, ne passed).
- **Neuspjeli pokušaj:** `44277429190` na `111f3e6` pao je na tri **contract guarda**, ne na logici:
  `attachments.constants.spec.ts` je pinovao listu od osam executorа, `retention.integration.spec.ts`
  redoslijed noći bez nove kategorije, a frontend `settings-registry-coverage.spec.ts` traži 517
  ključeva i naslov postavke ≤ 220 znakova (naš je imao 243). Guardovi su ažurirani, naslov skraćen na
  203/191 znaka, detalj preseljen u help tekst (326/309) — `fcee1e8`.

Lokalno: `npx jest` nad `src/modules/privacy` i `src/modules/settings` — 232 prošlo, 25 skipped (DB
suiteovi bez baze u sandboxu); ciljani `attachments.constants.spec.ts` i `problem-notifier-dedupe.spec.ts`
prolaze; frontend `vitest` za nove/izmijenjene guardove prolazi, `tsc -b` i `prettier --check` čisti;
`eslint` čist na svim izmijenjenim backend fajlovima; `npm run wiring:check`/`wiring:test` zeleni.
Backend `tsc --noEmit` u sandboxu nije mjerodavan (Prisma klijent je stub, generisanje traži mrežu za
schema engine), pa je CI mjerodavni tipski dokaz — i tamo je prošao.

## Registar nalaza

- Zatvoreni: `BA-problems-16`.
- Ostaju otvoreni u ovom auditu: `BA-problems-17`, `18`, `19`, `20`, `21`.
- Kontrolni zbir: source/plan **439** otvorenih / **257** zatvorenih / **696** ukupno
  (P1 174 / P2 371 / P3 151); ovaj registar **450** / **246**; Val 7 **36/111** (75 otvorenih:
  13 P1 / 42 P2 / 20 P3); `problems` **16/21** (5 otvorenih: 0 P1 / 1 P2 / 4 P3) — stanje poslije
  ovog paketa.

## Migracija, rollout i rollback

**Nema migracije ni schema promjene.** Default postavke je `0`, pa deploy sam po sebi ne mijenja
nijedan zapis: retention počinje tek kada rukovalac/DPO upiše period (minimum 180 dana) i pusti probni
prolaz. Rollout je običan deploy backend + frontend bundlea; stari frontend ne poznaje novu kategoriju
i prikazuje sedam kartica, novi frontend uz stari backend ne dobija kategoriju i ne prikazuje je
(aditivno). Rollback je vraćanje prethodne slike i, ako je potrebno, gašenje postavke na `0`.
**Redakcija je nepovratna**: vraćanje slike ne vraća sadržaj koji je retention redigovao — jedini put
je restore baze, i to samo za zapise koji su redigovani poslije posljednjeg backupa. Zato je probni
prolaz obavezan pri svakoj promjeni perioda.

## Sljedeći paket

Preostali P2 u ovom auditu je **`BA-problems-20`** (DB provenance trigger whitelist ne pokriva
`problem.updated`/`problem.claimed`); P3 nalazi `17`, `18`, `19` i `21` ostaju otvoreni. Naredni paket
po planu korisnika je P3 red notifications-14, websocket 12–14, integration-queue 13–15, inbound-email
11–13 — ne počinje prije zelenog gatea za ovaj paket ni bez izričitog odobrenja.
