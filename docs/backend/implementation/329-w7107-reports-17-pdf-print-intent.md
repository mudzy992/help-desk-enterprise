# W7.107 — `BA-reports-17`: PDF kao **print intent**, ne kao dokaz izvoza

**Paket:** Val 7, `reports`, **P3**<br>
**Nalaz:** „PDF endpoint evidentira client intent kao export bez potvrde generisanog artefakta”<br>
**Kod:** `audit-log.constants.ts` (novi `report.pdf.print_intent`, stari `report.pdf.exported` ostaje samo za historiju),
`audit-action-compatibility-registry.ts`, `audit-action-schema-registry.ts`, `report-trends.service.ts`
(`recordPdfPrintIntent`), `reports.controller.ts` (`POST /reports/pdf-print-intents`),
`dto/report-trends-query.dto.ts` (`RecordReportPdfPrintIntentDto`)<br>
**Specovi:** `trends/report-trends.pdf-print-intent.spec.ts` (**novo, 11**), frontend `report-trends-api.spec.ts`
(**novo, 2**), `e2e/tests/19-reports-print.spec.ts` (ažuriran)<br>
**DB migracija:** ne<br>
**Rute:** **preimenovana jedna** (632 ostaje): `POST /reports/pdf-exports` → `POST /reports/pdf-print-intents`<br>
**Frontend:** `report-trends-api.ts` (`recordReportPdfPrintIntent`), `pages/reports-page.tsx`, `lib/audit/*` (akcija,
polja, vrijednosti), `bs`/`en` `common.json`<br>
**CI:** _popunjava se nakon push-a_

## Nalaz

Dugme „Sačuvaj kao PDF” ne pravi PDF na serveru — otvara **browser** dijalog za štampu. Stranica je zato zvala
beacon `POST /reports/pdf-exports`, a server je upisivao audit `report.pdf.exported`. Taj zapis tvrdi tri stvari koje
nijedna komponenta sistema ne može potvrditi:

1. da je dokument **napravljen** (server ga nikad ne renderuje);
2. da je **isporučen** korisniku (browser može odustati od dijaloga, blokirati `window.print()` ili pasti);
3. da je **istovjetan** onome što je korisnik vidio (štampa zavisi od browsera, zoom-a, fontova i `@media print`).

Posljedica nije velika u broju redova, ali je sustavna: audit je dokaz, a ovaj red je bio **tvrdnja klijenta**
preobučena u dokaz servera. Uz to, ime akcije je zavodilo svaki kasniji izvještaj, retention matricu i pretragu —
„koliko je PDF-ova izvezeno” nije pitanje na koje ovaj lanac može odgovoriti.

## Rješenje

### 1. Akcija kaže šta se zaista dogodilo

Nova akcija `report.pdf.print_intent` (`auditLogActions.reportPdfPrintIntent`) zamjenjuje pisanje stare. Metapodaci
su **zatvoren skup** i imenuju granicu eksplicitno:

| Ključ | Vrijednost | Zašto |
| --- | --- | --- |
| `view` | `overview` \| `trends` | koji je ekran bio na štampi |
| `from`, `to` | ISO datum ili `null` | prozor koji je korisnik vidio |
| `renderer` | `client` | dokument pravi browser, ne server |
| `artifactStored` | `false` | server ne čuva kopiju i ne može je izdati |

Nema `format`, `bytes`, `pages`, `pageCount`, `recordCount`, `fileName` ni `download` — svaki od tih ključeva bi
ponovo tvrdio artefakt. Schema registry zato ima allowlist `['artifactStored', 'from', 'renderer', 'to', 'view']`, a
test dokazuje da payload sa `format: 'pdf'` **pada** na `AUDIT_METADATA_FIELD_NOT_ALLOWED`. Senzitivnost ostaje
`pseudonymous` kao i prije (vremena i ekran, bez sadržaja).

### 2. Stara akcija ostaje čitljiva, ali se više ne piše

`report.pdf.exported` je i dalje u `auditLogActions`, u compatibility i schema registryju i u frontend katalogu.
Redovi napisani prije W7.107 su **nepromjenjiva činjenica** — lanac, filteri, izvoz i prijevod moraju nastaviti
raditi, a brisanje akcije bi ih osiromašilo. Zato:

- registriji je zadržavaju sa istim allowlistom (`from`, `to`, `view`) i istom verzijom šeme;
- nijedan kod je ne piše (test to provjerava na nivou servisa);
- frontend label je iskren prema istoriji: „PDF izvještaja — zabilježen izvoz (historijski)”.

Novi label: „PDF izvještaja — otvoren dijalog štampe”. Uz to su dodata i polja `renderer`/`artifactStored` te
zatvorene vrijednosti `renderer: client` i `artifactStored: false`, pa admin konzola prevodi i metapodatke, ne samo
akciju.

### 3. Ruta nosi isto ime kao i zapis

Stare rute `POST /reports/pdf-exports` više nema: sada je `POST /reports/pdf-print-intents`. Broj ruta ostaje **632**
(preimenovana jedna), ali `backend-wiring-manifest.json`, frontend servis i E2E spec 19 govore isti jezik kao audit.
Odgovor ostaje `204`, fora ostaje ista: beacon se šalje „fire and forget” i **nikad** ne blokira `window.print()`.

## Posljedice po ponašanje

- Korisnik i dalje klikne i dobije dijalog štampe; ništa se ne mijenja u toku rada.
- Audit više ne tvrdi da PDF postoji. On kaže: „ovaj korisnik je u ovom prozoru otvorio štampu ovog ekrana, dokument
  je napravio browser i server nema kopiju.”
- Historijski redovi ostaju vidljivi, pretraživi i izvozivi, sa labelom koji ih označava kao historijske.
- Nijedna migracija nije potrebna (akcija je string u postojećoj koloni).

## Testni dokaz

`report-trends.pdf-print-intent.spec.ts` (**novo, 11**):

- servis upisuje `report.pdf.print_intent`, `entityType = reportTrends`, `entityId` i OU = jedinica, akter i
  `requestId` iz zahtjeva;
- metapodaci su tačno `{view, from, to, renderer: 'client', artifactStored: false}` i **nemaju** nijedan
  artefaktni ključ;
- stara akcija se **ne** piše, ali ostaje registrovana sa istim allowlistom (historija);
- `prepareAuditEntry` odbija `format` uz novu akciju, a prihvata čist intent;
- isključeni `reports` modul ⇒ `REPORTS_DISABLED` i **nula** audit redova;
- ruta je `pdf-print-intents`, handler `recordPdfExport` više ne postoji, kontroler prosljeđuje `body`/aktera/`requestId`,
  odbija beacon bez aktera (`403`), mapira `REPORTS_DISABLED` u HTTP grešku i propušta neočekivanu grešku.

Frontend `report-trends-api.spec.ts` (**novo, 2**): beacon ide na `/reports/pdf-print-intents`, nikad na stari put, i
tijelo ima tačno `{organizationalUnitId, view, from, to}` — bez `format`/`bytes`/`pages`/`recordCount`/`fileName`.
`admin-ops-i18n-coverage.spec.ts` ostaje zelen jer katalog akcija, polja i vrijednosti ima prevode u oba jezika.

## Dokaz

CI: _popunjava se nakon push-a_ (vidi `## 33` u [26-reports.md](../audits/26-reports.md)).

## Otvoreno i dokumentovano

- **PDF se ne generiše na serveru.** Ovo nije „popravka izvoza”, nego ispravno imenovanje onoga što postoji. Ako
  produkt jednog dana traži dokaziv artefakt, potreban je serverski render (npr. headless Chromium) sa svojim
  `renderer: 'server'`, veličinom, hashom i retentionom — to je novi zahtjev, ne ovaj nalaz.
- **Browser može odustati od dijaloga.** Ni novi zapis ne tvrdi da je korisnik odštampao ili sačuvao; zna se samo da
  je intent poslan. Polje `artifactStored: false` tu granicu čini eksplicitnom.
- **Historijski redovi se ne prepisuju.** `report.pdf.exported` ostaje u lancu; mijenja se samo label u konzoli.
