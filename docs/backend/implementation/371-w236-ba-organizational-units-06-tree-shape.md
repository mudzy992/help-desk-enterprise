# 371 — W2.36 `BA-organizational-units-06`: tree read više ne izlaže LDAP topologiju svima

**Paket:** `W2.36` · **Nalaz:** `BA-organizational-units-06` (P2) · **Datum:** 2026-11-28 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** organizational-units / security owner · **Povezano:** `W2.9`/`W2.11` (scope vidljivost i revizija), `BA-organizational-units-08` (operativne granice tree reada)
**DB migracije:** ne · **API promjena:** oblik odgovora `GET /organizational-units/tree` zavisi od permisije

## 1. Nalaz i provjera premise

Baseline: „`GET /tree` je dostupan USER ulozi i vraća puni `OrganizationalUnitResponse`: DN, `ouPath`, company,
department, parent i timestampove za cijelu organizaciju."

Provjera prije paketa:

| Tvrdnja | Stanje prije W2.36 |
| --- | --- |
| tree ruta je dostupna svakoj roli | **tačno** — `@RequireRoles(...organizationalUnitTreeReadRoles)` sa `USER/AGENT/ADMIN/SUPER_ADMIN` |
| odgovor je puni `OrganizationalUnitResponse` | **tačno** — `assembleOrganizationalUnitTree` radi `toOrganizationalUnitResponse` nad cijelim redom |
| pozivalac vidi cijelu organizaciju | **tačno za pozivaoce bez `organizationalUnit.manage`**; nosioci permisije su od W2.9 filtrirani na svoj scope |
| postoji privilegovana ruta za pune detalje | **tačno** — `GET /organizational-units/:id` traži `organizationalUnit.manage` |
| selector koristi DN/putanju | **ne** — `id`/`name`/`type` su dovoljni (frontend koristi `ouPath` samo kao labelu) |

Premisa nije zastarjela: W2.9 je suzio **skup grana** za nosioce permisije, ali nije dirao **oblik** odgovora za
sve ostale, pa je svaki autentifikovani račun i dalje dobijao `OU=...,DC=...` za cijelu firmu.

## 2. Korekcija

### 2.1 Odluka je na serveru, oblik je eksplicitan

| Pozivalac | Oblik odgovora | Sadržaj |
| --- | --- | --- |
| drži `organizationalUnit.manage` | `OrganizationalUnitTreeNodeResponse` (nepromijenjen), filtriran na scope (W2.9) | sve kolone |
| bez permisije (USER, AGENT, servisni račun) | `OrganizationalUnitTreeSummaryNode` | `id`, `name`, `type`, `children` |
| bez identiteta (`actorUserId === null`) | `OrganizationalUnitTreeSummaryNode` | kao gore |

Zajednički tip je `OrganizationalUnitTreeResponseNode` (union), pa ruta ima jedan ugovor, a oblik se vidi u tipu.

### 2.2 Projekcija, ne filtriranje polja

`get-organizational-unit-selection-tree.ts` traži od Prisma-e:

```ts
select: { id: true, name: true, type: true, parentId: true }
orderBy: [{ ouPath: 'asc' }, { name: 'asc' }]
```

`ouPath` se pojavljuje **samo u `orderBy`** (redoslijed siblinga), nikad u `select`. Zato osetljive kolone nisu
pročitane, a kasnije dodato polje na model ne može iscuriti kroz ovu rutu — za razliku od „mapiraj pa obriši",
gdje bi svako novo polje bilo pitanje da li je neko sjetio izbaciti.

### 2.3 Dogovorena politika grana

Pozivalac bez `organizationalUnit.manage` **i dalje vidi cijelu topologiju**, ali bez opisa jedinica. To je svjesna
odluka: OU filteri i „origin unit” izbor su dio poslovnog toka (tiket, izvještaji, SLA), a skriva se **šta** je
jedinica (DN, putanja, org metadata), ne **da postoji**. Filtriranje grana ostaje vezano za scope permisije i
`BA-organizational-units-01` (W2.9).

### 2.4 Frontend

`OrganizationalUnitTreeNode` privilegovane kolone sada ima **opcione**; svaki potrošač ima fallback:

| Mjesto | Prije | Sada |
| --- | --- | --- |
| `organizational-unit-tree-item.tsx` | uvijek renderuje `node.ouPath` | kolona putanje se renderuje samo kad polje postoji |
| `organizational-unit-details-card.tsx` | `subtitle={node.ouPath}` | `subtitle={node.ouPath ?? typeLabel}`, blok „Putanja" uslovan |
| `flattenOriginUnitOptions` (`ticket-display.ts`) | `item.ouPath.length` | `item.ouPath && item.ouPath.length > 0 ? … : item.name` |
| `matchCatalogEntry` (`directory`) | `normalizeDirectoryPath(node.ouPath)` | bez putanje vraća `missing` — ne pogađa red po imenu |

## 3. Dokaz

| Test | Šta dokazuje |
| --- | --- |
| `organizational-units.tree-shape.spec.ts` — **4** | bez permisije: `select` je tačno `{id,name,type,parentId}` i odgovor nema **nijedan** zabranjeni ključ ni kad fake klijent vrati cijele redove (u serijalizovanom odgovoru nema `DC=example` ni `/Korisnici`); sa permisijom: `select` odsutan i `ouPath`/DN prisutni; `null` akter: minimalni oblik |
| `get-organizational-unit-selection-tree.spec.ts` — **3** | ugovor `findMany` poziva, redoslijed siblinga, ključevi ograničeni na `{id,name,type,children}`, red sa nepostojećim roditeljem ne postaje lažni korijen |
| `organizational-units.scope.spec.ts` (W2.9, ažuriran) | nosilac permisije i dalje dobija admin projekciju i sopstveni podskup (W2.9 nije regresiran) |
| `frontend ticket-display.spec.ts` +**1** | selector-only tree se labelira imenom |

Lokalno: `npx jest --testPathPatterns "organizational-units/"` → **16 suite / 83 testa**;
`npx vitest run src/components/organizational-units src/lib/directory src/lib/tickets src/components/admin` →
**65 fajlova / 265 testova**; `npx tsc -b` (frontend) zelen.

## 4. Šta ovaj paket ne tvrdi

- Ne mijenja **skup vidljivih grana** za neprivilegovane pozivaoce (to je W2.9 scope politika) i ne uvodi
  per-actor filtriranje bez permisije.
- Ne dira `GET /organizational-units/:id`, `/:id/users` ni mutacije — one su od W2.9 vezane za
  `organizationalUnit.manage` i `OuAccessGuard`.
- Ne uvodi keš, paginaciju ni operativne granice tree reada — to je `BA-organizational-units-08` (P3).
- `type` ostaje u minimalnom obliku: UI po njemu bira ikonu i labelu, a to je kategorija jedinice, ne LDAP metadata.

## 5. Fajlovi

`backend/src/modules/organizational-units/`:
`organizational-unit.types.ts` (`OrganizationalUnitTreeSummaryNode`, `OrganizationalUnitTreeResponseNode`),
`get-organizational-unit-selection-tree.ts` (+ `.spec.ts`, novo), `organizational-units.service.ts` (`getTree`),
`organizational-units.controller.ts` (tip odgovora), `organizational-units.tree-shape.spec.ts` (novo),
`organizational-units.scope.spec.ts` (narrowing za union).
`frontend/src/`: `services/organizational-units-api.ts`, `components/organizational-units/organizational-unit-tree-item.tsx`,
`organizational-unit-details-card.tsx`, `lib/tickets/ticket-display.ts` (+ `.spec.ts`), `lib/directory/match-catalog-entry.ts`.
Dokumentacija: `docs/backend/audits/05-organizational-units.md` (§10, §17), `docs/backend/BACKEND-FINDINGS-REGISTER.md`,
`docs/backend/backend-findings-plan.json`, `docs/backend/EXECUTION-PLAN-REMAINING.md`.
