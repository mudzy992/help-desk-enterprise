# W7.108 — `BA-reports-18`: preview je **read audit**, ne telemetrija

**Paket:** Val 7, `reports`, **P3**<br>
**Nalaz:** „Preview osjetljivih redova nema formalnu read-audit odluku”<br>
**Kod:** `audit-log.constants.ts` (`report.pack.previewed`), `audit-action-compatibility-registry.ts`,
`audit-action-schema-registry.ts`, `record-report-preview-audit.ts` (**novo**), `reports.service.ts`
(`previewPack` sada traži aktera i `requestId`), `reports.controller.ts` (prosljeđuje `x-request-id`)<br>
**Specovi:** `preview-read-audit.spec.ts` (**novo, 8**), `reports.service.spec.ts` (ažuriran: preview više nije „bez
audita”), `e2e/tests/12-reports-packs.spec.ts` (+1 provjera)<br>
**DB migracija:** ne<br>
**Rute:** nepromijenjene (632); `GET /reports/packs/:packSlug/preview` sada **piše** audit<br>
**Frontend:** `lib/audit/audit-log-actions.ts`, `audit-log-fields.ts`, `audit-log-values.ts`, `bs`/`en`
`common.json` (label akcije, polja `boundaries`/`truncated`/`truncatedInput`/`windowMode` i zatvorene vrijednosti
`windowMode`)<br>
**CI:** _popunjava se nakon push-a_

## Nalaz

Preview paketa vraća **iste redove** koje bi vratio izvoz: brojeve tiketa, naslove, primaoca, izvršioca, trajanja i
ostale kolone iz 19 packova. Izvoz je bio auditiran (`reports.export`, sa OU, periodom, packom, formatom i brojem
redova), ali preview nije — nije bilo ni zapisa ni metrike.

To nije samo praznina u evidenciji; to je **zaobilaznica kontrole**. Administrator koji želi pročitati osjetljive
redove bez traga ne mora izvesti CSV: dovoljno je otvoriti preview, pročitati 200 redova, promijeniti filter i
ponoviti. Izvozni audit tako dokazuje samo jedan od dva puta do istih podataka.

Nalaz je tražio **formalnu odluku**: je li preview read audit ili high-volume telemetry. Odluka mora biti u kodu, ne
u namjeri.

## Odluka

**Preview je read audit.** Tri razloga, po težini:

1. **Isti podaci, ista obaveza.** Preview i izvoz vraćaju isti presjek; ako je jedan auditiran, drugi mora biti, inače
   kontrola ne pokriva putanju.
2. **Nije visokofrekventan.** Frontend **resetuje** preview na svaku promjenu izbora, OU ili perioda i traži novi
   pregled tek na eksplicitan klik („Prikaži pregled”) — dakle jedan zapis po namjernom čitanju, ne po promjeni
   filtera. To je isti red veličine kao izvoz.
3. **Metrika ne odgovara na pitanje.** „Ko je vidio primaoca X u periodu Y” je pitanje identiteta i vremena; brojač
   `preview_total` to ne može reći. Telemetrija bi zadovoljila volumen, ne dokaz.

Cijena je jedan `INSERT` u audit lanac po pregledu — uz upit koji ionako prolazi kroz 19 loadera i agregacije, to je
zanemarljivo, a lanac je particionisan po OU (W7.96).

## Rješenje

### 1. Akcija `report.pack.previewed`

Nova akcija (`auditLogActions.reportPackPreviewed`) sa entitetom `reportPack` i `entityId` = pack. Metapodaci su
zatvoren skup i opisuju **šta je akter vidio**, ne šta bi mogao izvesti:

| Ključ | Značenje |
| --- | --- |
| `pack`, `organizationalUnitId` | koji paket i čija jedinica |
| `from`, `to`, `boundaries`, `windowMode` | period, otvorena granica i semantika (W7.102) |
| `recordCount` | **koliko je redova akter dobio** (0 je legitiman, ali evidentiran ishod) |
| `truncated`, `truncatedInput` | da li je `recordCount` gornja granica ili donja (cap prikaza / cap ulaza) |

Senzitivnost `pseudonymous`. Allowlist **ne prima** `fileName`, `format` ni druge izvozne ključeve — preview nema
fajl, pa se dva događaja ne mogu zamijeniti (`AUDIT_METADATA_FIELD_NOT_ALLOWED`).

### 2. Akter i `requestId` su dio ugovora

`previewPack(query, actorUserId, requestId, now?)` — potpis je sada isti oblik kao `exportPack`, jer je i preview
medijski čitanje sa identitetom. Kontroler uzima aktera iz sesije (bez njega `403`, kao i prije) i `x-request-id` iz
headera; servis ne može zapisati preview bez aktera, pa nema „anonimnog” čitanja.

### 3. Fail-closed

Audit red se piše **prije** nego što redovi napuste servis. Ako upis padne, preview se odbija — nema podataka bez
zapisa. To je ista politika kao kod izvoza (audit u istoj transakciji) i namjerno stroža od „best-effort” beacona:
ovdje se ne radi o intentu, nego o pristupu ličnim podacima.

Preview koji padne **prije** čitanja (isključen pack, predugačak period, zabranjen problem-pack) ne piše ništa —
audit beleži čitanje, ne pokušaj.

## Posljedice po ponašanje

- Svaki uspješan preview (uključujući onaj sa **nula** redova) ostavlja jedan red u audit lancu; admin konzola ga
  prikazuje kao „Pregled paketa izvještaja — otvoren” sa periodom, packom i brojem redova.
- Preview sada zavisi od audit upisa: ako je audit nedostupan, pregled vraća grešku umjesto neevidentiranih podataka.
- Frontend se ne mijenja (header `x-request-id` već ide uz svaki zahtjev); mijenja se samo ono što konzola prikazuje.
- Bez migracije (akcija je string u postojećoj koloni) i bez promjene ruta (632).

## Testni dokaz

`preview-read-audit.spec.ts` (**novo, 8**):

- tačan zapis: akcija, entitet `reportPack`, `entityId`, akter, `requestId`, OU i **kompletan** skup metapodataka;
- prazan preview (`forward_ping_pong` bez podataka) **takođe** ostavlja red sa `recordCount: 0`;
- kada je prikaz skraćen, `recordCount` je broj **primljenih** redova, a `truncated`/`truncatedInput` kažu da je to
  donja granica;
- **fail-closed**: pad audit upisa ⇒ preview odbija zahtjev i ne vraća redove;
- isključen pack ⇒ `REPORT_PACK_NOT_ENABLED` i **nula** zapisa (nije bilo čitanja);
- schema registry drži preview i izvoz razdvojene (`fileName` pada), a akcija je registrovana;
- kontroler prosljeđuje aktera i `requestId` (i prevodi kebab-slug u pack key), a bez aktera odbija prije servisa.

`reports.service.spec.ts` je ažuriran: test koji je tvrdio „previews without auditing” sada tvrdi suprotno
(`report.pack.previewed`, pa `reports.export`, u tom redu). `e2e/tests/12-reports-packs.spec.ts` provjerava da su
**oba** preview-a (API i onaj iza dugmeta) u audit listi, sa `boundaries` i `windowMode`.

## Dokaz

CI: _popunjava se nakon push-a_ (vidi `## 34` u [26-reports.md](../audits/26-reports.md)).

## Otvoreno i dokumentovano

- **Sam preview ne mijenja retention.** Redovi u audit lancu su `pseudonymous` i dijele sudbinu lanca (W7.104:
  lanac se ne briše jer dokazuje ko je šta čitao).
- **Volumen je vezan na klik, ne na filter.** Ako se frontend jednog dana promijeni da preview radi „uživo” na svaku
  promjenu, odluka ostaje ista (read audit), ali volumen prestaje biti zanemarljiv — tada je potreban coalescing
  identičnih ponavljanja, ne prelazak na telemetriju.
- **Dashboard i trendovi nisu dio ovog nalaza.** Oni vraćaju agregate; preview i izvoz vraćaju redove. Ako se ikad
  pokaže da agregat otkriva lični podatak (mali uzorak), to je zaseban nalaz.
