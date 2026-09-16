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

- [x] R3a: `group.manage` permission (Groups mutacije odvojene od `routing.write`); data migracija; FE/backend testovi
- [x] R3a: Verifikacija pre-existing failova — `tickets.guardrails.spec.ts` (3 testa) postoji prije R2 (`850e592`), nije diran u `64abdf9`; cors/socket-cors suite prolazi (5/6 suite-ova); failovi nisu iz Groups promjena
- [x] Backend: endpoint za CRUD `RolePermission` mapinga (role→permissions), sa shadow-preview pozivom prije potvrde (poveži postojeći `ShadowAuthorizationService` na novi controller)
- [x] Frontend: RBAC editor ekran — lista rola, permisije po roli (checkbox/switch), shadow-preview prikaz prije snimanja, potvrda
- [x] Backend: endpoint za dodjelu role korisniku (uključujući OU/service scope) — `UsersController` ili prošireni `organizational-units` modul
- [x] Frontend: `users-page.tsx` — dodati akciju "Dodijeli rolu" po korisniku (izbor role + opcioni OU/service scope)
- [x] Test: superadmin promijeni permisiju role "agent" → shadow preview pokaže uticaj → potvrda → agent nalog odmah reflektuje novo stanje pri sljedećem loginu/refresh-u sesije (scenario: `ticket.merge`; `tickets.write` ne postoji u katalogu)

## Faza R4 — Generic Settings UI + backend registry (P1)

- [ ] Backend: `GET /settings` — vraća sve registrovane ključeve sa tipom, opisom, scope-om (public/private), trenutnom vrijednošću (sa maskiranjem za secret tipove)
- [ ] Frontend: generička forma po ključu — switch za boolean, number input za number, text input za string, opis ispod svakog polja, grupisano po kategoriji/prefiksu ključa
- [ ] Zadržati postojeće specijalizovane panele (Email, Addons) kao "featured" na vrhu, generic UI pokriva ostatak
- [ ] Test: promjena `public.maintenance.enabled` kroz novi generic UI odmah se reflektuje na Home banner (zavisi od Faze R6)

## Faza R5 — Shadow mode / permission preview dovršetak (P2)

- [ ] Backend: HTTP endpoint za `ShadowAuthorizationService` (već povezano djelimično kroz R3 — ako R3 to ne pokrije u potpunosti, dovršiti ovdje)
- [ ] Frontend: `config-versions-api.ts` — dodati poziv na `POST /config-versions/:id/shadow`
- [ ] Frontend: prikaz rezultata (`sampleSize`, `routingGroupMismatches`, `slaRuleMismatches`) u `ConfigVersionDiffPanel` ili novoj sekciji
- [ ] Test: kreiraj draft config verziju sa izmijenjenim routing pravilom → pokreni shadow → vidiš broj tiketa koji bi promijenili grupu prije aktivacije

## Faza R6 — Preostali admin UI ekrani (P2/P3)

- [ ] Audit log — export (CSV/JSON) i hash-chain verify dugme na frontend admin ekranu
- [ ] Policy packs — admin UI za pregled/dodjelu paketa OU/servisu
- [ ] Support bundle — dugme za export na admin ekranu
- [ ] Maintenance banner — Home komponenta koja čita `public.maintenance.*` settings i prikazuje non-blocking banner (globalno i/ili per-service)

## Faza R7 — Tehnički dug i kvalitet (P4)

- [ ] Reports/Dashboard KPI — prebaciti client-side agregaciju na backend `/reports` endpoint (izbjeći dupliranje logike, riješiti skalabilnost)
- [ ] CI pipeline (GitHub Actions) — pokreće postojeći test suite (uključujući RBAC testove) na svaki PR
- [ ] E2E testovi — implementacija po već postojećem planu u `.cursor/plans/quality-e2e-critical-flows/`

---

**Napomena o redoslijedu:** R1 i R2 su preduslov za realno testiranje svega ostalog (bez njih se ne može pouzdano provjeriti "ko šta vidi" niti "agent prima tikete"), zato idu prvi bez obzira na to što neke kasnije faze (npr. R4 Settings) djeluju veće po obimu koda.
