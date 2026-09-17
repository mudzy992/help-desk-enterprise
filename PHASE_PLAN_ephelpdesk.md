# EP-HelpDesk — Fazni plan popravki (na osnovu GAP_LIST_v2)

Svaka faza je nezavisno isporučljiva (build+test prolazi na kraju svake faze). Redoslijed prati prioritet iz gap liste: prvo sigurnosni/operativni blokeri (P0), zatim administrativna kontrola (P1), zatim ostatak.

---

## Faza R1 — RBAC / route guarding (P0) — ✅ ZAVRŠENO (uklj. R1.5 sigurnosnu zakrpu: guard dodan na OrganizationalUnitsController i DirectorySyncController)

**Cilj:** niko ne vidi ni ne može otvoriti ono za šta nema pravo, ni kroz sidebar ni direktnim URL-om.

- [x] `RequireAuth` wrapper komponenta — redirect na login ako nema validne sesije
- [x] `RequireRole`/`RequirePermission` wrapper — redirect/EmptyState ako sesija postoji ali nema pravo
- [x] `/login` kao prava ruta (ne samo header forma); `SessionControls` i dalje može ostati kao brzi prikaz stanja sesije u header-u
- [x] `router.tsx` — sve rute pod `ApplicationShell` omotane odgovarajućim guard-om (admin/superadmin rute strožije od agent/requester ruta)
- [x] `ApplicationShell` — ne renderuje sidebar/header dok se sesija ne provjeri (loading state), i ne renderuje privilegovani sadržaj bez sesije
- [x] `lib/navigation.ts` — dodati `permission`/`role` polje svakoj stavci
- [x] `app-sidebar.tsx` — filtrirati `navigationSections` kroz `useSessionCapabilities()` prije renderovanja
- [x] `AdminPage` (i Users/Org tabovi koji je nemaju) — dodati `hasRole`/`hasPermission` guard po uzoru na `settings-page.tsx`
- [x] Test: neprijavljen korisnik → prazan/login ekran, ne vidi sidebar stavke; agent korisnik → ne vidi Admin/Config Versions u sidebaru niti može otvoriti rutu direktnim URL-om



## Faza R2 — Grupe (Group/GroupMember) CRUD (P0) — ✅ ZAVRŠENO (E2E claim flow ostaje TODO — ručna provjera na dev instanci)

**Cilj:** admin može kreirati grupu i dodati/ukloniti agenta iz nje kroz UI, bez direktnog upisa u bazu.

- [x] Backend: `GroupsController` — `GET/POST /groups`, `PATCH/DELETE /groups/:id`, `POST/DELETE /groups/:id/members/:userId`, postavljanje fallback grupe po OJ (permission: `service.catalog.write` ili novi `group.manage`, po uzoru na postojeći permission model)
- [x] Backend: validacija — grupa mora pripadati OJ, fallback grupa ne smije se obrisati dok postoji tiket u toku/dok je jedina fallback za tu OJ
- [x] Frontend: `services/groups-api.ts`
- [x] Frontend: admin ekran (nova stranica ili tab u Admin panelu) — lista grupa po OJ, kreiranje, uređivanje naziva, brisanje, upravljanje članovima (dodaj/ukloni korisnika), oznaka fallback grupe
- [x] Provjeriti/poravnati routing-rule formu da grupe učitava iz ovog novog API-ja
- [x] Test: kreiraj grupu → dodaj agenta → kreiraj routing pravilo prema toj grupi → novi tiket se pojavi u grupnom inboxu agenta → agent klikne "Claim" → tiket dobije `assignedUserId`



## Faza R3 — Administrativna kontrola pristupa (P1) — ✅ ZAVRŠENO

- [x] Backend: endpoint za CRUD `RolePermission` mapinga (role→permissions), sa shadow-preview pozivom prije potvrde (poveži postojeći `ShadowAuthorizationService` na novi controller)
- [x] Frontend: RBAC editor ekran — lista rola, permisije po roli (checkbox/switch), shadow-preview prikaz prije snimanja, potvrda
- [x] Backend: endpoint za dodjelu role korisniku (uključujući OU/service scope) — `UsersController` ili prošireni `organizational-units` modul
- [x] Frontend: `users-page.tsx` — dodati akciju "Dodijeli rolu" po korisniku (izbor role + opcioni OU/service scope)
- [x] Test: superadmin promijeni permisiju role "agent" → shadow preview pokaže uticaj → potvrda → agent nalog odmah reflektuje novo stanje pri sljedećem loginu/refresh-u sesije



## Faza R4 — Generic Settings UI + backend registry (P1) — ✅ ZAVRŠENO (zadnja stavka zavisi od R6 — banner)

- [x] Backend: `GET /settings` — vraća sve registrovane ključeve sa tipom, opisom, scope-om (public/private), trenutnom vrijednošću (sa maskiranjem za secret tipove)
- [x] Frontend: generička forma po ključu — switch za boolean, number input za number, text input za string, opis ispod svakog polja, grupisano po kategoriji/prefiksu ključa
- [x] Zadržati postojeće specijalizovane panele (Email, Addons) kao "featured" na vrhu, generic UI pokriva ostatak
- [x] Test: promjena `public.maintenance.enabled` kroz novi generic UI odmah se reflektuje na Home banner (zavisi od Faze R6)



## Faza R5 — Shadow mode / permission preview dovršetak (P2) — ✅ ZAVRŠENO

- [x] Backend: HTTP endpoint za `ShadowAuthorizationService` (već povezano djelimično kroz R3 — ako R3 to ne pokrije u potpunosti, dovršiti ovdje)
- [x] Frontend: `config-versions-api.ts` — dodati poziv na `POST /config-versions/:id/shadow`
- [x] Frontend: prikaz rezultata (`sampleSize`, `routingGroupMismatches`, `slaRuleMismatches`) u `ConfigVersionDiffPanel` ili novoj sekciji
- [x] Test: kreiraj draft config verziju sa izmijenjenim routing pravilom → pokreni shadow → vidiš broj tiketa koji bi promijenili grupu prije aktivacije



## Faza R6 — Preostali admin UI ekrani (P2/P3)

- [x] Audit log — export (CSV/JSON) i hash-chain verify dugme na frontend admin ekranu
- [x] Policy packs — admin UI za pregled/dodjelu paketa OU/servisu
- [x] Support bundle — dugme za export na admin ekranu
- [x] Maintenance banner — Home komponenta koja čita `public.maintenance.*` settings i prikazuje non-blocking banner (globalno i/ili per-service)



## Faza R8 — Admin: "Organizacija (OU)" i "Korisnici i uloge" po referentnom dizajnu (P1)

**Osnova:** `referenca-dizajn/src/pages/Admin.tsx` (`OuTree`, `UsersRoles`).

### R8a — Organizacija (OU): stablo + AD sync

1. **Backend:**
  - [x] DB-backed katalog: `ManualDirectoryOrganizationalUnit` / `ManualDirectoryUser` / `ManualDirectoryGroup` (+ seed iz starog fixturea)
  - [x] CRUD `GET/POST/PATCH/DELETE /directory-sync/manual-catalog/organizational-units` — guard `SUPER_ADMIN`
  - [x] Brisanje odbijeno dok postoje djeca ili mapirani korisnici (`HAS_CHILDREN` / `HAS_MAPPED_USERS`)
  - [x] Materializacija **samo** preko eksplicitnog `POST /directory-sync/read` (`forceRefresh`); catalog CRUD ne dira live stablo; cache clear nakon CRUD
  - [x] `GET /directory-sync/status` — stvarni strategy/QPS/TTL/`lastSuccessfulReadAt` (ne mock 15 min / 24 h)
2. **Frontend:**
  - [x] `services/directory-sync-api.ts` — read + status + catalog CRUD
  - [x] `organizational-units-page.tsx` — Dodaj OU, hover "...", AD sync kartica
  - [x] Jasne greške za brisanje sa djecom/korisnicima
  - [x] Mutacije/sync samo za `SUPER_ADMIN`
  - [x] BS + EN i18n



### R8b — Korisnici i uloge

1. **Backend:**
  - [x] `POST /users` — **direktan User CRUD** (ne directory-sync); inicijalna rola preko R3c
  - [x] `PATCH /users/:id` (`isActive`), `DELETE /users/:id` (blokada ako open tickets)
  - [x] Agregacioni `GET /users` za 7 kolona (`openTicketCount`, `policyPackKey`, `mfa: null`)
  - [x] Guard `ADMIN`/`SUPER_ADMIN`; SUPER_ADMIN role samo od SUPER_ADMIN actora
2. **Frontend:**
  - [x] 7 kolona + `ROLE_STYLE`; Dodaj korisnika
  - [x] Policy-pack kartice — reuse R6 `PolicyPacksPanel`
  - [x] MFA = "—" (nalaz: nema polja u šemi); workload iz API count
  - [x] BS + EN i18n

**Verifikacija:**

- [x] Catalog OU → sync (`forceRefresh`) → live stablo
- [x] Delete blocked sa jasnom porukom
- [x] Ručno očitavanje ažurira `lastSuccessfulReadAt`
- [x] Create user + role → 7 kolona (MFA "—")
- [x] Vizuelno poređenje vs referenca (desktop 1440 + mobile 390) — ručni UI check
- [x] Frontend `npm run test` (191) + `npm run build`; backend directory-sync/users testovi (39 passed)

## Faza R9 — Nalazi iz ADMIN_ANALYSIS.md (rješava se dio po dio)

**Osnova:** `ADMIN_ANALYSIS.md` (root repoa). Svaki pod-dio (R9a–R9f) je nezavisna isporuka, radi se jedan po jedan, potvrđuje se prije prelaska na sljedeći.

- [x] R9a — **KRITIČNO**: Add user password / init-password tok (nalaz #4)
- [x] R9b — Ops: worker tabela + integracioni red u istom tabu + backend worker-health signal (nalaz #1)
- [x] R9c-1 — Settings: i18n `registry.keys` / `registry.categories` popuniti (BS+EN) — 231 ključeva, 24 kategorije (nalaz #2a)
- [x] R9c-2 — Settings: backend category metadata (`categoryId`/`icon`/`priority`) + FE grupisanje/ikone (nalaz #2b)
- [x] R9d — Permisije: backend opis po permission key-u + i18n + frontend prikaz (nalaz #3)
- [ ] R9e — Grupe: namjenski dizajn taba (nalaz #5)
- [ ] R9f — OU: dokumentacija dvostepenog toka (manual katalog → sync) + provjera rename/move putanje (nalaz #6)
- [ ] R9g — AD linking tok za postojećeg lokalnog korisnika (nalaz #4b, niži prioritet, može čekati)

## Faza R7 — Tehnički dug i kvalitet (P4)

- [x] `tickets.guardrails.spec.ts` — 3 pre-existing failing testa (warn/soft-block/concurrent scenariji), potvrđeno postojali prije R2, nisu regresija — treba zaseban ticket da se ispravi stvarna guardrails logika, ne samo test
- [x] Reports/Dashboard KPI — prebaciti client-side agregaciju na backend `/reports` endpoint (izbjeći dupliranje logike, riješiti skalabilnost)
- [x] CI pipeline (GitHub Actions) — pokreće postojeći test suite (uključujući RBAC testove) na svaki PR
- [x] E2E testovi — implementacija po već postojećem planu u `.cursor/plans/quality-e2e-critical-flows/`

---

**Napomena o redoslijedu:** R1 i R2 su preduslov za realno testiranje svega ostalog (bez njih se ne može pouzdano provjeriti "ko šta vidi" niti "agent prima tikete"), zato idu prvi bez obzira na to što neke kasnije faze (npr. R4 Settings) djeluju veće po obimu koda.
