# EP-HelpDesk — Fazni plan popravki (na osnovu GAP_LIST_v2)

Svaka faza je nezavisno isporučljiva (build+test prolazi na kraju svake faze). Redoslijed prati prioritet iz gap liste: prvo sigurnosni/operativni blokeri (P0), zatim administrativna kontrola (P1), zatim ostatak.

---

## Faza R1 — RBAC / route guarding (P0) — ✅ ZAVRŠENO (uklj. R1.5 sigurnosnu zakrpu: guard dodan na OrganizationalUnitsController i DirectorySyncController)

**Cilj:** niko ne vidi ni ne može otvoriti ono za šta nema pravo, ni kroz sidebar ni direktnim URL-om.

- [ ] `RequireAuth` wrapper komponenta — redirect na login ako nema validne sesije
- [ ] `RequireRole`/`RequirePermission` wrapper — redirect/EmptyState ako sesija postoji ali nema pravo
- [ ] `/login` kao prava ruta (ne samo header forma); `SessionControls` i dalje može ostati kao brzi prikaz stanja sesije u header-u
- [ ] `router.tsx` — sve rute pod `ApplicationShell` omotane odgovarajućim guard-om (admin/superadmin rute strožije od agent/requester ruta)
- [ ] `ApplicationShell` — ne renderuje sidebar/header dok se sesija ne provjeri (loading state), i ne renderuje privilegovani sadržaj bez sesije
- [ ] `lib/navigation.ts` — dodati `permission`/`role` polje svakoj stavci
- [ ] `app-sidebar.tsx` — filtrirati `navigationSections` kroz `useSessionCapabilities()` prije renderovanja
- [ ] `AdminPage` (i Users/Org tabovi koji je nemaju) — dodati `hasRole`/`hasPermission` guard po uzoru na `settings-page.tsx`
- [ ] Test: neprijavljen korisnik → prazan/login ekran, ne vidi sidebar stavke; agent korisnik → ne vidi Admin/Config Versions u sidebaru niti može otvoriti rutu direktnim URL-om

## Faza R2 — Grupe (Group/GroupMember) CRUD (P0) — ✅ ZAVRŠENO (E2E claim flow ostaje TODO — ručna provjera na dev instanci)

**Cilj:** admin može kreirati grupu i dodati/ukloniti agenta iz nje kroz UI, bez direktnog upisa u bazu.

- [ ] Backend: `GroupsController` — `GET/POST /groups`, `PATCH/DELETE /groups/:id`, `POST/DELETE /groups/:id/members/:userId`, postavljanje fallback grupe po OJ (permission: `service.catalog.write` ili novi `group.manage`, po uzoru na postojeći permission model)
- [ ] Backend: validacija — grupa mora pripadati OJ, fallback grupa ne smije se obrisati dok postoji tiket u toku/dok je jedina fallback za tu OJ
- [ ] Frontend: `services/groups-api.ts`
- [ ] Frontend: admin ekran (nova stranica ili tab u Admin panelu) — lista grupa po OJ, kreiranje, uređivanje naziva, brisanje, upravljanje članovima (dodaj/ukloni korisnika), oznaka fallback grupe
- [ ] Provjeriti/poravnati routing-rule formu da grupe učitava iz ovog novog API-ja
- [ ] Test: kreiraj grupu → dodaj agenta → kreiraj routing pravilo prema toj grupi → novi tiket se pojavi u grupnom inboxu agenta → agent klikne "Claim" → tiket dobije `assignedUserId`

## Faza R3 — Administrativna kontrola pristupa (P1) — ✅ ZAVRŠENO

- [ ] Backend: endpoint za CRUD `RolePermission` mapinga (role→permissions), sa shadow-preview pozivom prije potvrde (poveži postojeći `ShadowAuthorizationService` na novi controller)
- [ ] Frontend: RBAC editor ekran — lista rola, permisije po roli (checkbox/switch), shadow-preview prikaz prije snimanja, potvrda
- [ ] Backend: endpoint za dodjelu role korisniku (uključujući OU/service scope) — `UsersController` ili prošireni `organizational-units` modul
- [ ] Frontend: `users-page.tsx` — dodati akciju "Dodijeli rolu" po korisniku (izbor role + opcioni OU/service scope)
- [ ] Test: superadmin promijeni permisiju role "agent" → shadow preview pokaže uticaj → potvrda → agent nalog odmah reflektuje novo stanje pri sljedećem loginu/refresh-u sesije

## Faza R4 — Generic Settings UI + backend registry (P1) — ✅ ZAVRŠENO (zadnja stavka zavisi od R6 — banner)

- [x] Backend: `GET /settings` — vraća sve registrovane ključeve sa tipom, opisom, scope-om (public/private), trenutnom vrijednošću (sa maskiranjem za secret tipove)
- [x] Frontend: generička forma po ključu — switch za boolean, number input za number, text input za string, opis ispod svakog polja, grupisano po kategoriji/prefiksu ključa
- [x] Zadržati postojeće specijalizovane panele (Email, Addons) kao "featured" na vrhu, generic UI pokriva ostatak
- [ ] Test: promjena `public.maintenance.enabled` kroz novi generic UI odmah se reflektuje na Home banner (zavisi od Faze R6)

## Faza R5 — Shadow mode / permission preview dovršetak (P2) — ✅ ZAVRŠENO

- [x] Backend: HTTP endpoint za `ShadowAuthorizationService` (već povezano djelimično kroz R3 — ako R3 to ne pokrije u potpunosti, dovršiti ovdje)
- [x] Frontend: `config-versions-api.ts` — dodati poziv na `POST /config-versions/:id/shadow`
- [x] Frontend: prikaz rezultata (`sampleSize`, `routingGroupMismatches`, `slaRuleMismatches`) u `ConfigVersionDiffPanel` ili novoj sekciji
- [x] Test: kreiraj draft config verziju sa izmijenjenim routing pravilom → pokreni shadow → vidiš broj tiketa koji bi promijenili grupu prije aktivacije

## Faza R6 — Preostali admin UI ekrani (P2/P3)

- [ ] Audit log — export (CSV/JSON) i hash-chain verify dugme na frontend admin ekranu
- [ ] Policy packs — admin UI za pregled/dodjelu paketa OU/servisu
- [ ] Support bundle — dugme za export na admin ekranu
- [ ] Maintenance banner — Home komponenta koja čita `public.maintenance.*` settings i prikazuje non-blocking banner (globalno i/ili per-service)

## Faza R8 — Admin: "Organizacija (OU)" i "Korisnici i uloge" po referentnom dizajnu (P1)

**Osnova:** `referenca-dizajn/src/pages/Admin.tsx` (funkcije `OuTree()` i `UsersRoles()`). Trenutno stanje (`organizational-units-page.tsx`, `users-page.tsx`) je čisto read-only prikaz — nema kreiranja/izmjene/brisanja OU, nema AD sync dugmeta, nema kreiranja/izmjene/brisanja korisnika, tabela korisnika ima samo 2 kolone (referenca ima 7). Ova faza dovodi oba taba na paritet sa referencom, punom funkcionalnošću, ne samo vizuelno.

**Nezavisno od R5/R6/R7** — može ići paralelno, ali ako se AdminPage tabovi mijenjaju istovremeno u više faza, agent treba rebase prije merge-a da izbjegne konflikt (R3 je već dodao "Permissions" tab u isti `AdminPage`).

### R8a — Organizacija (OU): stablo + AD sync

**Referenca — struktura ekrana:**

- Lijevo: kartica "Stablo organizacionih jedinica" (`OuTree` u referenci) — collapsible stablo, `Building2` ikona, naziv OU, broj korisnika (badge), `ouPath` (mono, desno poravnato, sakriveno na manjim ekranima), hover "..." meni po redu, dugme **"Dodaj OU"** u header-u kartice.
- Desno gore: kartica "Detalji" za selektovanu OU — naziv (segment putanje), `ouPath` (kanonski), Distinguished Name (LDAP, mono, prelomljen tekst), badge-ovi "mapirano: N korisnika" i "N routing pravilo".
- Desno dolje: kartica **"AD sinhronizacija"** — badge režima čitanja (`manual_only` / `entra_ad`), throttle vrijednost, keš trajanje, "zadnje očitavanje" (timestamp), dugme **"Pokreni ručno očitavanje"**.

**Ključni funkcionalni zahtjev (eksplicitno traženo):** "manuelno definisanje stabla treba biti tretirano kao sync sa AD" — to znači da se ručno kreiranje/izmjena/brisanje OU **ne smije** raditi kao direktna mutacija `OrganizationalUnit` tabele. Backend već ima `manual-only-directory-sync.provider.ts` i `manual-only-directory-catalog.ts` — trenutno je taj katalog **hardkodovan u kodu** (statični fixture sa 3 OU i 2 usera). Ovaj katalog treba postati admin-editabilan (DB-backed), a svaka izmjena OU stabla mora proći kroz **isti** `POST /directory-sync/read` **pipeline** koji bi AD sync koristio (throttle, keš invalidacija, `directory-sync` audit/log zapis) — ne pisati poseban, paralelan put za "manuelne" izmjene.

**Zadaci:**

1. **Backend:**
  - Premjesti `manual-only-directory-catalog.ts` iz statičnog fixture-a u DB-backed izvor (novi Prisma model, npr. `ManualDirectoryOrganizationalUnit`/`ManualDirectoryUser`/`ManualDirectoryGroup`, ili prošireni postojeći model — provjeri da li `OrganizationalUnit` model već ima dovoljno polja pa je poseban model nepotreban dupliranje).
  - Novi CRUD endpoint(i) za uređivanje manual-only kataloga: `POST/PATCH/DELETE` na OU stavke (naziv, parent, DN). Guard: `SUPER_ADMIN` (ovo mijenja izvor istine identiteta, isti nivo kao `DirectorySyncController` iz R1.5).
  - Validacija: brisanje OU odbijeno dok postoje djeca ili mapirani korisnici (tačno po referenci: *"Brisanje OU se odbija dok postoje djeca ili mapirani korisnici"*).
  - Nakon CRUD izmjene kataloga, ne materijalizuj promjenu direktno — izmjena mora čekati (ili automatski okinuti) `POST /directory-sync/read` da se promjena zvanično "sinhronizuje" u stvarno stablo, isto kao da je AD provider vratio nove podatke. Objasni u handoff-u kako si to riješio (auto-trigger nakon patch-a vs. ručno dugme).
  - Provjeri postojeći throttle/keš mehanizam (`directory-read.throttle.ts`, `directory-read.cache.ts`) — UI treba čitati ta stvarna trenutna stanja (ne hardkodovane "15 min" / "24 h" iz reference dizajna, to su samo placeholder vrijednosti u mock-u).
2. **Frontend:**
  - `services/directory-sync-api.ts` (novi) — poziv na `POST /directory-sync/read` (ručno pokretanje), plus status/metadata read (režim, throttle, keš, zadnje očitavanje) — provjeri da li backend ima poseban `GET` status endpoint ili se to čita iz odgovora `read` poziva/postojeće `directory` state-a.
  - Proširi `services/organizational-units-api.ts` (ili napravi novi) sa `POST/PATCH/DELETE` pozivima za manual-only katalog iz koraka 1.
  - `organizational-units-page.tsx` — dodaj dugme "Dodaj OU" (forma: naziv, parent OU, opciono DN), edit/delete akciju na svaki node u `OrganizationalUnitTree`/`OrganizationalUnitTreeItem` (hover "..." meni po uzoru na referencu), i novu karticu "AD sinhronizacija" sa dugmetom "Pokreni ručno očitavanje" + prikazom režima/throttle/keš/zadnje-očitavanje.
  - Prikaz greške backend validacije (djeca/mapirani korisnici) jasno u UI, ne generička greška.
  - Zaštita: `RequireAccess` sa `SUPER_ADMIN` (isto obrazloženje kao za backend guard).
  - BS + EN i18n ključevi.

### R8b — Korisnici i uloge (paritet sa referencom)

**Referenca — struktura ekrana:**

- Vrh: red od 3 kartice "Policy pack" (kod, opis, broj dozvola, broj dodjela) — koristi postojeći policy-packs modul iz backenda (R3b/policy-packs postojeći backend), ne izmišljaj novi izvor.
- Glavna tabela "Korisnici" — search input + dugme **"Dodaj korisnika"** u header-u.
- Kolone (tačno po referenci, trenutno postoje samo prve dvije): **Korisnik** (avatar, ime, email, badge "neaktivan" ako je disabled, shield ikona ako je SuperAdmin), **Uloga** (badge, boja po roli: super=danger, manager=primary, agent=info, user=neutral), **OU/Grupa** (naziv OU + ime grupe ispod ako postoji), **Policy pack** (badge ili "—"), **Opseg dozvola** (tekstualni opis izveden iz role — "cijeli sistem" za super, "OU: X ↓" za agenta, "svoji tiketi" za usera), **MFA** (ikona/status), **Opterećenje** (broj otvorenih tiketa dodijeljenih tom korisniku, ili "—").

**Zadaci:**

1. **Backend:**
  - Endpoint za kreiranje korisnika (`POST /users` — provjeri da li ovo ide kroz `directory-sync`/manual-only katalog kao i OU, ili je `User` zaseban model koji se kreira direktno; ako je local-auth korisnik, ovo je direktan `User` CRUD, ne directory-sync tok — razjasni i objasni u handoff-u koji je tačan slučaj).
  - Endpoint za izmjenu (aktivan/neaktivan status, MFA status ako je upravljivo iz app-a) i brisanje korisnika.
  - Endpoint (ili prošireni postojeći iz R3c `GET/POST/DELETE /users/:userId/roles`) koji uz rolu vraća i dovoljno podataka da frontend popuni sve kolone iz reference (policy pack po korisniku, OU/grupa, workload/broj otvorenih tiketa) — provjeri da li je efikasnije agregirati ovo na backendu (jedan endpoint) nego da frontend pravi N poziva po korisniku.
  - Guard: isti nivo kao R3c (`ADMIN`/`SUPER_ADMIN`, `SUPER_ADMIN` dodjela samo od `SUPER_ADMIN` actora).
2. **Frontend:**
  - Proširi `users-page.tsx` tabelu na svih 7 kolona iz reference.
  - Dodaj dugme "Dodaj korisnika" (forma: ime, email, OU, inicijalna rola).
  - Dodaj red od 3 policy-pack kartice na vrhu (reuse `service-catalog-table.tsx` stila kartica ili `settings/addon-catalog-row.tsx` kao referentni pattern za "kartica sa brojem/opisom").
  - Poveži role badge boje tačno po mapiranju iz reference (`ROLE_STYLE`).
  - MFA i workload kolone — ako backend trenutno ne vraća te podatke, prijavi kao poseban nalaz (ne izmišljaj vrijednosti/mock).
  - Zaštita: isti guard kao R8a i R3c.
  - BS + EN i18n ključevi.

**Ograničenja (ista kao ranije faze):**

- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Shadow mode config-version (R5), Audit/Policy-packs UI van onoga što je gore eksplicitno traženo (samo čitanje policy-pack kartica, ne CRUD), Reports refactor, CI, E2E.
- Bez mock podataka — ako referenca prikazuje polje koje backend trenutno ne vraća (npr. MFA, workload po korisniku, throttle/keš stvarne vrijednosti), prijavi to kao nalaz prije nego što izmisliš vrijednost ili je hardkoduješ.

**Verifikacija (obavezno prijavi rezultate):**

- Superadmin kreira novu OU ručno → izmjena se ne vidi u stablu dok se ne "sinhronizuje" (auto ili ručno) → nakon sync-a, OU se pojavljuje u stablu identično kao da je došla iz AD.
- Pokušaj brisanja OU sa djecom/mapiranim korisnicima → blokirano sa jasnom porukom.
- Dugme "Pokreni ručno očitavanje" pokreće `POST /directory-sync/read` i ažurira "zadnje očitavanje" vrijeme u UI.
- Superadmin kreira novog korisnika, dodijeli mu rolu (reuse R3c toka) → korisnik se odmah pojavljuje u tabeli sa svih 7 kolona tačno popunjenih (ili jasno "—" gdje podatak ne postoji).
- Vizuelno poređenje `/admin?tab=org` i `/admin?tab=users` naspram `referenca-dizajn/src/pages/Admin.tsx` — desktop 1440 + mobile 390 (isti kriterijum kao raniji FE planovi).
- `npm run test`, `npm run build` (frontend); odgovarajući backend testovi.

**Obavezno:** čekiraj (`- [x]`) završene stavke direktno u `PHASE_PLAN_ephelpdesk.md` (sekcija "Faza R8") i pošalji mi ažuriranu verziju te sekcije nazad.

## Faza R7 — Tehnički dug i kvalitet (P4)

- [ ] `tickets.guardrails.spec.ts` — 3 pre-existing failing testa (warn/soft-block/concurrent scenariji), potvrđeno postojali prije R2, nisu regresija — treba zaseban ticket da se ispravi stvarna guardrails logika, ne samo test
- [ ] Reports/Dashboard KPI — prebaciti client-side agregaciju na backend `/reports` endpoint (izbjeći dupliranje logike, riješiti skalabilnost)
- [ ] CI pipeline (GitHub Actions) — pokreće postojeći test suite (uključujući RBAC testove) na svaki PR
- [ ] E2E testovi — implementacija po već postojećem planu u `.cursor/plans/quality-e2e-critical-flows/`

---

**Napomena o redoslijedu:** R1 i R2 su preduslov za realno testiranje svega ostalog (bez njih se ne može pouzdano provjeriti "ko šta vidi" niti "agent prima tikete"), zato idu prvi bez obzira na to što neke kasnije faze (npr. R4 Settings) djeluju veće po obimu koda.
