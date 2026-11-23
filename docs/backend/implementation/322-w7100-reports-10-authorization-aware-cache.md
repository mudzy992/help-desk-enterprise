# W7.100 — `BA-reports-10`: summary cache nosi verziju autorizacije

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Summary/dashboard cache nema scope-revoke/mutation invalidaciju; stale authorization prozor”<br>
**Kod:** `summary/report-summary-cache.ts` (ključevi + dokumentacija granice), `report-summary.cache.ts`
(signature sa `authzVersion`), `report-summary.service.ts` (`authzVersionOf` preko `PrincipalContextLoader`,
verzija u ključu i single-flight ključu)<br>
**Specovi:** `summary/report-summary-cache.spec.ts` (**+1**), `report-summary.service.spec.ts` (**+2**, fake cache
i harness prošireni verzijom)<br>
**DB migracija:** **ne** (`User.authzVersion` postoji od paketa 2.2)<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45175565106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45175565106) ✓ na `95027f6`

## Nalaz

Dashboard i SLA summary se keširaju per korisnik u Redis-u (`reports:dashboard-summary:<user>:<zone>`,
`reports:sla-summary:<user>`) sa TTL-om od 60 s. Payload nije „neutralan broj”: to je **projekcija onoga što
korisnik smije vidjeti** (`buildTicketListWhere`). Posljedice:

1. **Revoke ne važi dok TTL ne istekne.** Ako korisnik izgubi pristup (rola/permission, članstvo u grupi,
   premještaj u drugu OJ, deaktivacija), do minute može dobiti brojeve izračunate pod pristupom koji više nema.
   Za autorizaciju je to pogrešna granica: TTL je prihvatljiv za *svježinu podataka*, ne za *pravo pristupa*.
2. **Nema nikakvog signala ni hooka.** Nijedna sigurnosna promjena nije znala za ovaj cache, pa nije bilo ni načina
   da ga invalidira — samo čekanje.
3. **Mutacija tiketa i OU dashboard.** Za mutaciju tiketa TTL od 60 s je odobrena granica (staging k6,
   2026-09-25); OU dashboard cache (`reports:dashboard:<hash>`) sadrži podatke jedinice koji ne zavise od toga ko
   pita, a pristup se provjerava **prije** čitanja cache-a — tu nema stale autorizacije.

## Rješenje

**Verzija autorizacije je dio cache ključa.**

- `dashboardSummaryCacheKey(userId, authzVersion, timeZone)` → `reports:dashboard-summary:<user>:v<N>:<zone>`
- `slaSummaryCacheKey(userId, authzVersion)` → `reports:sla-summary:<user>:v<N>`
- `N = User.authzVersion`, isti fence koji već koriste principal context cache i sesijska provjera: **svaka**
  sigurnosna promjena ga inkrementira (`PrincipalContextInvalidator`), pa stari zapis postaje **nedostupan na
  sljedećem zahtjevu**. Nema aktivnog brisanja: stari ključ istječe sam u 60 s, a nijedan pisac ne mora znati koje
  korisnike eviktovati.
- Verzija ulazi i u **single-flight** ključ, pa dva zahtjeva sa različitim verzijama ne dijele istu kalkulaciju.
- Servis čita verziju kroz `PrincipalContextLoader.load(actorUserId)` — unutar zahtjeva memoiziran (isti promise
  koji su koristili guardovi), sa vlastitim `User.authzVersion` fenceom. Cijena: nula dodatnih upita u praksi.

### Zašto ne drugačije

- **Aktivna invalidacija po korisniku** (`DEL` na svaku sigurnosnu promjenu) zahtijeva da svaki pisac zna tačan
  format ključa i zonu; propušten poziv vraća stari problem. Verzija u ključu ne može biti propuštena — ako se
  verzija promijeni, ključ se promijeni.
- **Kraći TTL** samo smanjuje prozor; ne otklanja ga i plaća se češćim agregatima.
- **Per-write invalidacija na ticket mutacije** (tražena kao opcija u nalazu) svjesno nije uvedena: 60 s je
  odobrena granica za brojeve, a uvođenje bi vezalo svaku ticket mutaciju za format reports cache ključeva.
  Sigurnosni dio (scope revoke) je taj koji nije smio čekati TTL, i on je sada riješen ključem.
- **Verzija bez čitanja principal contexta** (npr. iz JWT claima) bila bi brža, ali bi zahtijevala da svaki poziv
  nosi svjež token; `load()` je već fenced i memoiziran.

## Posljedice po ponašanje

- Poslije sigurnosne promjene prvi zahtjev računa iznova (jedan agregat ~600 ms na 100k tiketa), a ne servira stari
  presjek — to je namjerna cijena tačnosti autorizacije.
- Stari ključevi ostaju do TTL-a (60 s) i sami nestaju; memorijski otisak je zanemariv.
- Payload, TTL i rute su nepromijenjeni; nema migracije.
- Ako servis radi bez principal loadera (samo unit testovi), verzija je `0` i ponašanje je staro — produkcijski graf
  ga uvijek ima (`ReportsModule` importuje `AuthenticationModule`).

## Testni dokaz

- `summary/report-summary-cache.spec.ts` (**+1**, uz ažuriran postojeći): ključ nosi korisnika, verziju i zonu;
  promjena verzije mijenja **oba** ključa, a korisnik i zona ostaju razdvojeni.
- `report-summary.service.spec.ts` (**+2**): poslije bumpea verzije servis ponovo računa (cache hit samo za istu
  verziju; oba payloada postoje pod svojim ključem), i SLA summary se kešira pod istom verzijom.
- Lokalno: backend **946 suite / 5.460 testa** ✓ (104 suite skipped — integracije bez `PRIVACY_IT_DATABASE_URL`);
  `reports` **37 suite / 208 testa**; `eslint` 0; `wiring` 632 rute; `db:migration-policy` 124 (bez nove migracije);
  `check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **Strogi versioned schema/payload cap Redis parsera** — `BA-reports-15` (P3).
- **Invalidacija na ticket mutaciju** ostaje TTL granica (60 s), dokumentovano gore i u audit §5.
- **Retention run loga** — `BA-reports-14`; **privacy matrica** — `BA-reports-13`.

## CI i testni dokaz

**Run [`45175565106`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45175565106) — success iz prvog
pokušaja** (push na `arena/864951a6-help-desk-enterprise`, commit `95027f6`, `CI gate` ✓). Poslovi:
`Backend build + test` ✓, `Backend PostgreSQL + Redis integration` ✓ (103/103 izolovana suitea),
`Frontend build + test` ✓, `Docs guard` ✓, `Backend container + supply chain` ✓; `E2E *` preskočeni (nema `e2e`
promjena).

**Zašto bez popravke:** promjena je u potpisu tri DOM-domain helpera i jednog servisa, bez novih tabela i bez
novog Redis poziva — `PrincipalContextLoader` je i ranije bio u grafu (`ReportsModule` importuje
`AuthenticationModule`), pa je DI i tip bio poznat prije CI-ja.

**Ostale provjere (lokalno, prije commita):**

| provjera | rezultat |
| --- | --- |
| `jest` (backend, cijeli) | **946 suite / 5.460 testa** ✓, 104 suite skipped (integracije bez `PRIVACY_IT_DATABASE_URL`) |
| `jest src/modules/reports` | **37 suite / 208 testa** ✓ (+6 skipped, integracioni specovi) |
| `eslint src/modules/reports` | 0 problema ✓ |
| `npm run wiring:check` | ✓ 99 controllera, **632** rute (nepromijenjeno) |
| `npm run db:migration-policy:check` | ✓ **124** migracije (bez nove migracije) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| `node scripts/check-backend-findings.mjs` | ✓ **696/696**, zatvoreno **318** / otvoreno **378** |

## Registar nalaza

`BA-reports-10` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **318 zatvoreno /
378 otvoreno / 696**; Val 7 **97 / 18 (0/8/10)**, `reports` **10/19**.

## Veze

- [Audit 26 — §5 i §26 (closeout)](../audits/26-reports.md)
- [W7.99 — at-least-once isporuka](321-w799-reports-09-at-least-once-delivery.md)
- [W7.98 — scheduler reconciliation](320-w798-reports-08-scheduler-reconciliation.md)
