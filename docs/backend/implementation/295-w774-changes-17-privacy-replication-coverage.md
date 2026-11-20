# W7.74 — `BA-changes-17`: anonimizacija i retencija pokrivaju sve čitaoce sadržaja promjene

**Paket:** Val 7, audit 24 / `changes` — privacy i retention paritet<br>
**Nalaz:** `BA-changes-17` (P2) — „Privacy/retention ne pokrivaju sve tekstualne i downtime/notifier/problem replike”<br>
**Kodni commit:** `9a82f03` (paket: `edb5b6d` + `99ae6d2`, fail-safe `bc6d5d7`, fixture `9a82f03`)<br>
**CI:** [44800485011](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44800485011)<br>
**DB migracija:** **nema** — nijedna kolona se ne dodaje; retencija koristi postojeće statuse i datume

## Šta je nalaz tvrdio

Audit 24 §11 je bio precizan i u dva smjera:

> „Coverage je heuristic: osoba može biti imenovana u planu/changeu kojem nije requester/owner; taj zapis se ne
> scrubuje. CAB overview čuva i prikazuje vote komentare neograničeno. Downtime message replicira change
> number/title u service-catalog zapis. Notification/email i linked problem event mogu replicirati podatke
> izvan change lifecyclea.
>
> Nema formalnog retentiona za closed/rejected/cancelled change, approval komentare i event JSON. API delete ne
> postoji, pa zapisi ostaju neograničeno. Potrebna je ITSM/legal retention politika i parity za
> downtime/change-log/notifier replike.”

Dakle **dva** problema: (1) anonimizacija je birala promjene samo po vezi (`requesterUserId`, `ownerUserId`),
pa je osoba imenovana u tuđem planu ostajala u bazi; (2) sadržaj promjene nije imao rok — ni redak, ni planove,
ni komentare odobrenja, ni event JSON.

## Šta je urađeno

### 1. Jedan izvor identiteta (`mention-tokens.ts`)

Pravilo „koje stringove uopšte tražiti” je izdvojeno iz problemskog filtera u zajedničku funkciju
`mentionTokens(identifiers)`: puna adresa, lokalni dio ≥ 5 znakova, DN, login ≥ 4 znaka i `nameVariants`
(puno ime i „Prezime Ime”). Problemski `problemMentionTokens` sada delegira; test tvrdi da su dvije liste
**identične**, pa novi prag dužine ne može tiho razići dva modula. Filter u bazi je namjerno **nadskup**
podniza (SQL `contains`/`ILIKE`) onoga što scrubber mijenja (word boundary), jer je scrub idempotentan.

### 2. Anonimizacija: pet čitalaca sadržaja promjene

Novi `change-mentions.ts` (devet tekstualnih kolona, bounded `ILIKE` nad `ChangeEvent.detail`, filter nad
`ServiceDowntimeWindow.message`) i `scrub-change-mentions.ts` (`collectChangeMentions` + `scrubChangeMentions`).

| Čitalac | Prije | Sada |
| --- | --- | --- |
| `ChangeRequest` tekst | samo `requesterUserId`/`ownerUserId` | **+ svaka promjena koja imenuje osobu** u `title`, `description`, `reason`, četiri plana, `reviewNotes`, `cancelReason` |
| `ChangeApproval.comment` (CAB glasanje) | samo sopstveni glasovi | **+ komentari na sopstvenim promjenama** (CAB pregled prikazuje svaki komentar kruga) |
| `ChangeEvent.detail` | sopstveni eventi i eventi svojih promjena | **+ eventi čiji JSON imenuje osobu** (jedan upit za cijeli prolaz, ne po redu) |
| `Notification` | nije bilo | `payload.changeId` → scrub `title`, `body` i `payload` |
| `ServiceDowntimeWindow.message` | nije bilo | prozori svojih promjena **+ svaki prozor čiji `number · title` imenuje osobu** |
| `ChangeLog` (service history) | samo `entityId = userId` / `actorUserId` | **+ zapisi prozora** (`entityType = service_downtime_window`, `diff.after.message` je ista replika) |

`NotificationEmailDelivery` **nema tijelo poruke** (čuva adresu, `templateKey`, `dedupeKey`), pa tu nema šta
scrubovati; red se briše kroz postojeću kategoriju `emailDeliveries`. To je razlika prema auditovoj
pretpostavci i eksplicitno je zapisano u kodu.

### 3. Preview i izvršenje čitaju isti izbor

`collectChangeMentions` je jedina selekcija; preview i `scrubChangeMentions` je dijele, pa broj iz
`GET /privacy/anonymizations/:id/preview` odgovara onome što izvršenje stvarno napiše. Primjeri zamjena
(`replacementExample`) uzimaju se **samo iz tekstova same promjene**: komentari glasanja, eventi, obavještenja i
kalendar drugih ljudi se **broje**, ali ne citiraju u preview-u.

### 4. Retencija: nova kategorija `changeContent`

`change-content-retention.executor.ts`, minimum **180 dana**, default **0** (isključeno), obavezan **probni
prolaz** (redakcija mijenja sadržaj — ista grupa kao `ticketContent`/`problemContent`), batch 50, red u
`retentionExecutionOrder` odmah poslije `problemContent`.

| Ostaje (skelet) | Nestaje |
| --- | --- |
| broj/`sequence`, tip, status, impact/likelihood/risk, planirani i stvarni datumi, OU, veze usluga/asset/problem, CAB grupa, tražilac i vlasnik, `submittedAt`/`authorizedAt`, odobrenja (glasanje), `ChangeEvent` (akcija/akter/vrijeme) | `title`/`description`/`reason` → marker; četiri plana, `reviewNotes`, `cancelReason` → `null`; `ChangeApproval.comment` → `null`; `ChangeEvent.detail` → `DbNull`; `Notification.body` → `null` (naslov je i18n ključ, payload nosi id-eve); `ServiceDowntimeWindow.message` → marker; `ChangeLog` prozora → marker + `{ redacted }` |

Dospijeće po statusu: `CLOSED` → `closedAt`, `CANCELLED` → `cancelledAt`, **`REJECTED` → `updatedAt`**.
Odbijanje nema vlastiti timestamp (`changeActionTimestamps` nema `REJECTED`), ali se finalna promjena ne može
uređivati (`changeEditScope` vraća `none`), pa je `updatedAt` vrijeme odbijanja. Idempotencija ne traži novu
kolonu: promjena je gotova kad joj je `title` marker, kao kod problema. Pravna blokada: tražilac ili vlasnik pod
blokadom (ili `null`) čuva promjenu netaknutom.

### 5. Fail-safe koji je kategorija otkrila

`RetentionService.sweepNightly` i `runCategory` pitali su `configuration.retentionDays[category] <= 0`. U
JavaScriptu je `undefined <= 0` **false**, pa je kategorija koje nema u konfiguraciji izvršavana kao da je
uključena. Loader uvijek popunjava sve ključeve, ali djelimična konfiguracija (starija instalacija, ručno
napisan objekat, fixture) ne smije autorizovati brisanje. Sada se čita `?? 0` i traži konačan pozitivan broj:
noćni prolaz preskače, a `runCategory` baca `RETENTION_DISABLED`. Test to dokazuje na konfiguraciji kojoj
`changeContent` nedostaje.

### 6. Postavka, kopija i e-mail

- nova postavka `private.privacy.retention.changeContentDays` (default 0, minimum 180) u `setting-keys.ts`,
  definiciji i loaderu;
- bs/en registar: naslov postavke (≤ 220 znakova) i objašnjenje (≤ 420) — čuvari `settings-registry-*` su
  tražili oba slota;
- panel retencije: `retentionCategories` u `privacy-api.ts` + naziv i hint kategorije (bs/en);
- e-mail o anonimizaciji: labele za brojače koje izvršenje sada piše (`changes`, `changeVotes`, `changeEvents`,
  `changeNotifications`, `downtimeWindows`, `changeLogs`) — do sada su se prikazivali tehnički nazivi ključeva;
- Record of processing: novi red retencije i „kostur tiketa, problema **i promjena**” u napomeni.

## Dokazi

- Backend: `change-mentions.spec.ts` (7 — tokeni dijeljeni s problemima, devet kolona, prazan skup,
  bounded `ILIKE`, kalendar, saglasnost sa scrubberom), `scrub-change-mentions.spec.ts` (7 — selekcija
  imenovane osobe, glasovi, eventi bez dvostrukog brojanja, obavještenja, kalendar, change log, nula),
  `change-content-retention.executor.spec.ts` (5 — dospijeće po tri statusa, skelet, replike, pravna blokada,
  prazan batch), `attachments.constants.spec.ts` (lista kategorija). Puni ne-integracioni backend prolaz:
  **877 suite / 4.999 testova** zeleno; `eslint` čist.
- Integracija: `retention.integration.spec.ts` sada imenuje `problemContent` i `changeContent` eksplicitno i
  dokazuje fail-safe na konfiguraciji bez ključa; `runCategory` za nedostajući period baca `RETENTION_DISABLED`.
- Frontend: `privacy-retention-categories.spec.ts` (3), `settings-registry-coverage.spec.ts` (15),
  `settings-registry-keys.spec.ts` (2), `identical-translations.spec.ts` (1) — **4 fajla / 19 testova** zeleno;
  broj ključeva u čuvaru podignut na 519 (novi ključ je jedina promjena).
- Nema migracije, nema promjene ruta, nema nove zavisnosti.

## Šta ostaje netaknuto

- Izvoz podataka i dalje ide po istoj definiciji (veza + sopstveni glasovi/akcije); ovaj paket dodaje
  **redakciju**, ne širenje izvoza. Anonimizacija i dalje poštuje pravnu blokadu tiketa i ne dodiruje
  objavljene članke baze znanja.
- Retencija poštuje pravnu blokadu i ne dira `ChangeEvent` akciju/aktera/vrijeme: vremenska linija ostaje
  dokaziva i poslije redakcije.
- Ostali brojači anonimizacije (npr. `timeLogs`, `approvals`, `reportRecipients`) i dalje padaju na tehnički
  naziv u e-mailu — to je postojeće stanje izvan ovog nalaza; novi brojači su imenovani.
- Sljedeći paketi u ovom modulu: P3 `BA-changes-18`, `19`, `20`.

## Preostali rizik

- Retencija je **politika**, ne zakonski rok: minimum od 180 dana i default 0 znače da instalacija bez
  odluke rukovaoca/DPO ne briše ništa, a probni prolaz je obavezan prije prvog izvršenja.
- Redakcija `ChangeLog` zapisa prozora čuva `entityType`/`entityId`/aktera/vrijeme, a `diff` postaje
  `{ redacted: "[redacted]" }`; ko čita service history vidi da je zapis redaktovan, ne šta je bilo.
- Scrubber ne mijenja samostalno prvo ime (dokumentovano ograničenje od Paketa 2.6), pa „Amra” u tekstu bez
  prezimena ostaje; filter traži iste tokene, tako da red nije promašen nego nije ni kandidat.
