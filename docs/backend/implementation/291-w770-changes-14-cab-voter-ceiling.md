# W7.70 — `BA-changes-14`: svaki CAB glasač, i jasan prestanak iznad limita

**Paket:** Val 7, audit 24 / `changes` — CAB eligibility i kvorum<br>
**Nalaz:** `BA-changes-14` (P2) — „CAB eligibility hard-limit 100 tiho izostavlja članove i mijenja
quorum”<br>
**Kodni commit:** `9f2a6d5` · **CI:** [44730522227](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44730522227)<br>
**DB migracija:** **nema** — jedan paginirani upit i stroža validacija

## Šta je nalaz tvrdio

Audit 24 §7: `loadCabVoterIds` je tražio **prvih 100** članova CAB grupe sa `change.approve` i zadržao što
dobije. Grupa sa 101+ podobnih članova zato je davala skup od 100 glasača i kvorum `min(postavka, 100)` —
**tiho**, i to u smjeru koji odobravanje čini lakšim. Komentar „more = misconfigured group” bio je
dokumentacija, ne runtime guard.

W7.47 (`BA-changes-06`) je zamrznuo skup glasača i kvorum u `status` event koji otvara krug, ali je taj skup
punjen iz istog, odsječenog upita — pa je zamrznuta i **pogrešna** činjenica. Uz to je čitač snapshota imao
svoj, nezavisni limit od 100: da je pisac tada i mogao upisati više glasača, čitač bi snapshot proglasio
neispravnim (`null`) i pao na **živu** članstvo — kvorum bi se ponovo pomjerio.

## Šta je urađeno

**1. Pun skup, stranicu po stranicu** (`load-cab-voters.ts`)

`loadCabVoterIds` sada šeta keysetom: `id asc`, `take: cabVoterPageSize + 1` (jedan red više dokazuje da ima
još, bez `count` upita), kursor je zadnji pročitani `id`. Predikat podobnosti ostaje u bazi — `isActive`,
`anonymizedAt: null`, članstvo u grupi i `change.approve` kroz rolu — pa stranice ne mogu „procuriti” nekoga
ko ne smije glasati. Rezultat je uređen, što zamrznuti snapshot čini uporedivim.

**2. Limit je guard, ne komentar** (`changes.constants.ts`)

| Postavka | Vrijednost | Zašto |
| --- | --- | --- |
| `cabVoterPageSize` | 100 | veličina stranice, ne limit skupa |
| `cabVotersMax` | 500 | gornja granica jednog kruga |

Prelazak granice baca `CHANGE_CAB_GROUP_TOO_LARGE` sa ID-em grupe u `detail` (HTTP **409**, uz
`CHANGE_NO_APPROVERS`). Krug se **zaustavlja** i neko mora srediti CAB; alternative su bile tiho odsijecanje
(današnje ponašanje) ili neograničen upit (memorija i notifikacije rastu sa greškom u konfiguraciji). CAB koji
traži više od 500 glasača nije CAB.

**3. Pisac i čitač dijele istu granicu** (`change-voter-snapshot.ts`)

`maxVoters` više nije nezavisna konstanta `100` nego `changeLimits.cabVotersMax`. Time nestaje klasa greške u
kojoj pisac prihvati snapshot koji čitač odbije — jer bi odbijanje značilo povratak na živo članstvo, tj.
kvorum koji se pomjera unutar otvorenog kruga.

**4. Projekcija i poruka na ekranu**

- `ChangeApprovalsService.overview` čita najviše `cabVotersMax` korisnika — ista granica kao krug, pa panel ne
  može prikazati više glasača nego što ih krug može imati.
- Frontend mapira kod na `changes.errors.cabGroupTooLarge` (bs/en) umjesto da prikaže sirov ključ:
  „CAB grupa ima više članova s pravom glasanja nego što jedan krug može obuhvatiti…”.

**5. Notifikacije**

`ChangeNotifier.cabVoters` koristi isti loader. Za preveliku grupu notifikacija se ne šalje i `run()` je
zabilježi kao `change_notice_failed … CHANGE_CAB_GROUP_TOO_LARGE` — konzistentno sa tim da se krug ne može ni
otvoriti, a ne kao tiha isporuka pogrešnom skupu.

## Dokaz

- `load-cab-voters.spec.ts` (5): 150 glasača stiže svih 150 (staro ponašanje: 100) uz tačno dvije stranice i
  kursor `id > u0100`; predikat ostaje u `where`; prazna stranica ne petlja; `cabVotersMax + 1` ⇒
  `CHANGE_CAB_GROUP_TOO_LARGE` sa `detail: 'cab-1'`; tačno na granici prolazi.
- `change-voter-snapshot.spec.ts` (4, +1): snapshot sa 150 glasača se čita (prije: `null`), `maxVoters + 1` se
  odbija.
- `change-approvals-snapshot.spec.ts` (7, +2): krug sa 150 podobnih zamrzne svih 150 i kvorum **150**
  (`min(150, 150)`, prije `min(150, 100)`); grupa iznad granice zaustavlja `voterSnapshot`.
- `change-view.spec.ts` (+1): `CHANGE_CAB_GROUP_TOO_LARGE` → `changes.errors.cabGroupTooLarge`.
- Backend `changes` modul **28 suite / 170 testa** (1 suite preskočen: integracija bez baze); eslint čist;
  `wiring:check` 99/631; `db:migration-policy:check` 121 migracija (bez nove); `tsc` bez **novih** grešaka
  (upoređeno prije/poslije izmjene, 13 grešaka manje jer su testovi prestali da referenciraju nestali simbol).
- Frontend `lib/changes` + `i18n` **12 fajlova / 64 testa**; `prettier` i `eslint` čisti.

## Preostali rizik

1. **Granica je broj, ne politika** — 500 je izabrano da kvorum ostane izračunljiv i da greška u konfiguraciji
   bude glasna. Instalacija koja stvarno ima ogroman CAB mora ga sažeti; produkt joj ne nudi „više od 500”.
2. **Paginacija je `id asc` bez `offset`-a**, ali nije snapshot izolacije: član koji uđe između dvije stranice
   može biti pročitan ili ne. Za *otvaranje* kruga to je prihvatljivo (skup se odmah zamrzne u eventu); za
   tačnost bi trebao `REPEATABLE READ` ili jedan upit, što bi vratilo problem memorije.
3. **Legacy krugovi bez snapshota** (otvoreni prije W7.47) i dalje koriste živo članstvo; ako je grupa iznad
   granice, pregled glasanja vraća 409 umjesto tiho pogrešnog kvoruma — namjerno.
4. **Notifikacije padaju na istu grešku** za preveliku grupu; log imenuje razlog, ali nema odvojenog alarma za
   „CAB grupa je prevelika”. To bi bio ops signal, ne dio ovog nalaza.

## Sljedeće

Sljedeći P2 u auditu 24 je `BA-changes-15` (template update nema optimistic concurrency ni before/after audit).
