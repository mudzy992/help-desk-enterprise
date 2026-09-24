# EP-HelpDesk — Fazni plan implementacije: modul TIKETI

Prati nalaze iz `01-ANALIZA-I-NALAZ-TIKETI.md`. Obuhvat je strogo ograničen na tikete i direktno povezane module (RBAC/OU/Grupe kao davaoci pristupa tiketima, katalog kao ulaz u kreiranje tiketa). Svaka faza ima: cilj, tačne fajlove za izmjenu, kriterij prihvatanja (acceptance criteria) i test plan. Faze su poredane po prioritetu (Faza 1 rješava oba prijavljena bug-a i mora ići prva).

Pravilo rada (preuzeto iz `TASKS.md` konvencije repozitorija): raditi jednu stavku u isto vrijeme, označiti završeno, commit, tek onda sljedeća.

---

## Faza 1 — KRITIČNO: RBAC/OU/Grupe vidljivost tiketa (root-cause fix)

**Cilj:** ukloniti uzrok oba prijavljena bug-a bez širenja pristupa van onoga što RAW dozvoljava (OU izolacija ostaje netaknuta za sve WRITE operacije — mijenja se samo READ pristupačnost podataka neophodnih da bi tiketi uopšte radili za USER/AGENT, plus ispravka scope-logike).

### 1.1 — Otvoriti READ rute organizacionih jedinica za sve autentifikovane role

**Fajl:** `backend/src/modules/organizational-units/organizational-units.controller.ts`

- Zadržati `@RequireRoles(authorizationRoleKeys.admin)` na nivou kontrolera za WRITE rute (`create`, `update`, `delete`, `assignUser`).
- Dodati per-rutni override (isti obrazac kao `catalogTicketCreateReadRoles`) na GET rutama koje se koriste za prikaz/kreiranje tiketa:
  - `GET /organizational-units/tree`
  - `GET /organizational-units/:organizationalUnitId`
  - `GET /organizational-units/:organizationalUnitId/users` — **razmotriti pažljivo**: ova ruta otkriva listu korisnika po OJ; ako se otvori svim rolama, provjeriti da li curi podatke van OU scope-a onoga ko poziva (npr. USER ne bi trebao vidjeti punu listu zaposlenih u tuđoj OJ). Preporuka: ili ostaviti ovu specifičnu rutu admin-only i riješiti "directory" potrebu drugačije (vidi 1.2), ili joj dodati `RequireOrganizationalUnitScope` guard umjesto potpunog otvaranja.
- Novu konstantu definisati analogno postojećoj (radi konzistentnosti imenovanja i buduće ponovne upotrebe), npr. `organizationalUnitTreeReadRoles` u novom fajlu `backend/src/modules/organizational-units/organizational-unit-tree-read-roles.ts`, sa istim sadržajem kao `catalogTicketCreateReadRoles` (USER/AGENT/ADMIN/SUPER_ADMIN).

**Acceptance criteria:**
- Test kao USER: `GET /organizational-units/tree` → `200`.
- Test kao AGENT: `GET /organizational-units/tree` → `200`.
- Test kao USER: `POST /organizational-units` → i dalje `403`.
- Postojeći `organizational-units.controller.guard.spec.ts` proširen novim slučajevima (USER/AGENT read = allow, USER/AGENT write = deny).

### 1.2 — Popraviti (ili zaobići) zavisnost `useDirectory()` / `useCreateTicketCatalog()` od jednog `Promise.all`

**Fajlovi:** `frontend/src/lib/tickets/use-create-ticket-catalog.ts`, `frontend/src/lib/directory/use-directory.ts`

- Nakon 1.1, OU stablo će raditi za sve role, ali princip **"jedan neuspješan poziv ne smije srušiti čitav ekran"** treba primijeniti nezavisno od toga (odbrana u dubinu):
  - `listOrganizationalUnitTree()` i `listOfferedServices()` odvojiti u nezavisne `.catch()` grane (kao što je već urađeno za `listOrganizationalUnitUsers` unutar `useDirectory`), tako da djelimičan neuspjeh degradira funkcionalnost (npr. prazna imena OJ) umjesto da blokira cijelu formu/listu.
- U `useCreateTicketCatalog`, ako `listOrganizationalUnitTree()` padne, forma za kreiranje tiketa mora i dalje raditi (posebno za USER, gdje OU polje nakon 1.3 postaje auto-popunjeno i ne zavisi od cijelog stabla, samo od jednog poznatog ID-a/naziva sa profila korisnika).

**Acceptance criteria:**
- Simuliran 403/500 na `organizational-units/tree` (npr. unit test sa mock servisom) ne smije spriječiti prikaz koraka odabira servisa.

### 1.3 — Auto-fill organizacione jedinice u formi kreiranja tiketa (USER rola)

**Fajlovi:** `frontend/src/components/tickets/create-ticket-fields.tsx`, `frontend/src/components/tickets/create-ticket-form.tsx`, novi helper `frontend/src/lib/tickets/current-user-origin-unit.ts` (ili prošireni `ticket-display.ts`)

- Dodati u sesijski kontekst (`useSession`/`useSessionCapabilities`) trenutnog korisnika: `organizationalUnitId` + naziv (dolazi sa `current-session.controller.ts` / treba provjeriti da li `CurrentSessionResponse` već nosi OU naziv — ako ne, dodati ga na backendu u `to-current-session-response.ts`).
- Za rolu **USER**: polje OJ postaje read-only prikaz ("Vaša organizaciona jedinica: {naziv}"), vrijednost se automatski postavlja u `draft.originUnitId` iz sesije, `<select>` se ne renderuje.
- Za role **AGENT/ADMIN/SUPER_ADMIN**: zadržati editabilan `<select>` (legitimna potreba kreiranja u ime druge OJ), ali predpopuniti default vrijednošću iz sesije korisnika (trenutno se koristi `defaultOriginUnitId(catalog.originUnits)` koji uzima **prvu** OJ iz stabla — treba promijeniti da prioritetno uzme OJ trenutnog korisnika, pa tek onda prvu iz liste kao fallback).

**Acceptance criteria:**
- E2E: prijava kao USER → `/tickets/new` → korak "detalji" ne prikazuje `<select>` za OJ, prikazuje statičan tekst sa ispravnim nazivom OJ korisnika.
- E2E: prijava kao AGENT → `/tickets/new` → `<select>` je prisutan, prethodno izabrana (default) vrijednost je OJ agenta, može se promijeniti.
- Kreiranje tiketa kao USER bez slanja `originUnitId` u payload-u i dalje radi ispravno (backend fallback ostaje netaknut).

### 1.4 — Ispraviti asimetriju "Bilo koja organizaciona jedinica" wildcard-a

**Fajl:** `backend/src/modules/authorization/does-organizational-unit-scope-cover.ts` (i pozivaoci koji postavljaju `requireOrganizationalUnitScope`)

Dvije opcije — **odabrati A** osim ako produkt-vlasnik eksplicitno traži B (sigurnosno konzervativnije, i usklađenije sa RAW principom "Admin/Agent defaultno scoped na OU; cross-OU samo eksplicitno i auditovano"):

- **Opcija A (preporučeno):** zadržati postojeće ponašanje "null OU scope = nema pristupa", ali:
  1. Ukloniti/preimenovati opciju "Bilo koja organizaciona jedinica" iz `UserRolesSection`/`AddUserForm` dropdown-a **ako uloga zahtijeva OU-scoped tiket-pristup** (AGENT/ADMIN), ili
  2. Ako se zadrži, promijeniti labelu u nešto nedvosmisleno poput "Bez pristupa tiketima po OJ (samo administrativne dozvole)" da se UI ne čita kao simetričan wildcard servisu.
  3. Dodati validacijsku poruku u `UserRolesSection` kada admin pokuša dodijeliti rolu AGENT sa praznim OU poljem: upozorenje "Ova dodjela neće dati pristup nijednom tiketu po organizacionoj jedinici. Ako želite pristup na više OJ, dodajte poseban zapis za svaku."
- **Opcija B (širi domet, veći sigurnosni rizik):** implementirati eksplicitan `GLOBAL` scope marker (razdvojen od "nije postavljeno") koji svjesno znači "sve OJ", uz obavezan `audit.export`-nivo permisije i change-log zapis (u skladu sa RAW "cross-OU akcije su auditovane"). Ovo zahtijeva schema promjenu (npr. `organizationalUnitScopeMode: 'SPECIFIC' | 'ANY'` na `UserRole`) i veći test obuhvat — **ne raditi u ovoj fazi**, otvoriti kao zaseban prijedlog za produkt-vlasnika.

**Acceptance criteria (Opcija A):**
- Unit test: `doesOrganizationalUnitScopeCover({assignedPath: null, ...})` i dalje `false` (bez promjene ponašanja) — dokumentovano kao namjerno, ne kao bug.
- UI test: `UserRolesSection` prikazuje upozorenje opisano gore prilikom odabira AGENT/ADMIN role bez OJ.
- Ažurirati `users.rolesEmpty`/srodne i18n ključeve (BS+EN) sa novim upozorenjem.

### 1.5 — Povezati RBAC OU-scope dodjelu sa Group membership (UX most, ne automatska magija)

**Fajlovi:** `frontend/src/components/users/user-roles-section.tsx`, `frontend/src/pages/groups-page.tsx`, backend `backend/src/modules/tickets/assignment/list-group-inbox-tickets.ts` (samo ako se odluči za "meku" promjenu ponašanja — vidi ispod)

Cilj nije spojiti dva modela u jedan (Group i RBAC UserRole imaju različitu semantiku i oba su namjerni RAW koncepti — "handler group" vs. "OU/service permission scope"), nego **učiniti raskorak vidljivim i lako popravljivim za admina**:

1. Nakon što admin doda `UserRole` sa rolom AGENT/ADMIN i konkretnom OJ (`UserRolesSection`), prikazati inline informativnu poruku: "Ovaj korisnik još nije član nijedne grupe koja pokriva {naziv OJ}. Tiketi iz ove OJ se dodjeljuju grupama — dodajte korisnika u odgovarajuću grupu na ekranu Grupe." sa direktnim linkom na `/admin?tab=groups&ou={id}`.
   - Backend: dodati read-only endpoint `GET /groups?organizationalUnitId=` (već postoji filter u `ListGroupsQueryDto` — provjeriti/iskoristiti) da frontend zna koje grupe pokrivaju tu OJ i da li je korisnik već član ijedne.
2. Na `GroupsPage`, kod dodavanja člana grupe (`GroupMembersSection`), prikazati pored svakog kandidata iz `availableUsers` i njegov trenutni RBAC OU-scope (npr. "Agent · OU=Breza") radi lakšeg uparivanja — koristeći već postojeći `listUserRoles`.
3. **Ne mijenjati** `resolveInboxGroupWhere` da "pada nazad" na OU-scope kad nema group membership-a — to bi zamaglilo namjerno različitu semantiku Inbox-a (grupni red čekanja) naspram opšte liste (RBAC vidljivost), i bilo bi netransparentno ponašanje. Umjesto toga, poboljšati **prazno stanje Inbox-a** (vidi 1.6).

**Acceptance criteria:**
- Admin dodjeljuje AGENT rolu sa OU=X na `UserRolesSection` → vidi upozorenje + link ako korisnik nije član nijedne grupe za OU=X.
- `GroupMembersSection` prikazuje RBAC OU-scope pored imena kandidata.

### 1.6 — Poboljšati prazno stanje "Inbox" taba kad je uzrok Group membership

**Fajlovi:** `frontend/src/components/tickets/ticket-inbox-panel.tsx`, `frontend/src/lib/tickets/use-ticket-list.ts`, backend `list-group-inbox-tickets.ts`

- Backend: kad `resolveInboxGroupWhere` vrati `null` (korisnik nije član nijedne grupe), vratiti eksplicitan signal razlici umjesto praznog niza koji izgleda identično kao "nema tiketa" — npr. dodatno polje u response meta-u ili zaseban endpoint `GET /tickets/inbox/status` koji vraća `{ hasGroupMembership: boolean }`.
- Frontend: ako `hasGroupMembership === false`, `TicketInboxPanel` prikazuje jasnu poruku ("Niste član nijedne grupe za obradu tiketa. Kontaktirajte administratora.") umjesto generičkog "Nema tiketa" empty state-a, i (za ADMIN/SUPER_ADMIN koji gleda) link ka Grupama.

**Acceptance criteria:**
- Agent bez group membership-a vidi razlikovanu poruku od agenta koji ima membership ali stvarno nema tiketa u redu.
- Regresioni test: SuperAdmin inbox ponašanje ostaje nepromijenjeno (`{ not: null }` grana).

### Test plan Faze 1
- Backend: prošireni `organizational-units.controller.guard.spec.ts`, novi `does-organizational-unit-scope-cover.spec.ts` slučaj koji dokumentuje namjerno "null = false" ponašanje, `tickets.group-inbox.spec.ts` dopunjen slučajem "agent sa OU-scope-om ali bez group membership-a → inbox prazan, ali `GET /tickets` sa istim OU filterom vraća tikete".
- Frontend: novi test za `use-create-ticket-catalog` (djelimičan neuspjeh ne blokira), test za `create-ticket-fields` (USER vs AGENT prikaz OU polja).
- Ručni E2E scenario (ponoviti tačno prijavljeni bug): kreirati USER-a sa OU=X → prijaviti se kao taj USER → kreirati tiket bez biranja OU (auto-fill) → uspjeh. Kreirati AGENT-a sa OU=X + servis=bilo koji, dodati ga u grupu koja pokriva OJ=X → prijaviti se kao taj AGENT → tiket kreiran u koraku prije treba biti vidljiv u Inbox-u.

---

## Faza 2 — UUID → naziv, preostali auto-fill i sitni UI ispravci

### 2.1 — Split panel: prikazati broj tiketa umjesto cuid-a

**Fajl:** `frontend/src/components/tickets/ticket-split-panel.tsx`

- Zamijeniti `{ticket.parentTicketId}` sa nazivom/brojem roditeljskog tiketa. Provjeriti da li `TicketResponse` već nosi `parentTicketNumber`/naslov roditelja; ako ne, dodati ga u `to-ticket-response.ts` (backend) kao denormalizovano polje (`parentTicketNumber: string | null`, `parentTicketTitle: string | null`) da se izbjegne dodatni fetch na frontu.

**Acceptance criteria:** Split panel prikazuje npr. `T-000045 — Nalog ne radi` umjesto sirovog ID-a; link i dalje vodi na `/tickets/{parentTicketId}`.

### 2.2 — Sistemska provjera preostalih ticket-ekrana za UUID curenje

- Ponoviti grep obrazac iz analize (`\{[a-zA-Z]+\.(originUnitId|assignedGroupId|assignedUserId|requesterId|serviceId|formVersionId|parentTicketId)\}`) nakon svake nove komponente ili izmjene u ovoj fazi — dodati kao lint/CI provjeru ako je izvodljivo (jednostavan grep-based test u `e2e/` ili `scripts/`).

**Acceptance criteria:** 0 pogodaka van legitimnih `value={...}` atributa na kontrolama.

---

## Faza 3 — Dizajn parity pass (create / detalji / svi tiketi / grupe)

Preduslov: Faza 1 završena (jer je dio "praznih"/degradiranih stanja u UI-u direktna posljedica bug-ova, ne dizajna).

### 3.1 — Priprema za vizuelni QA
- Pokrenuti `referenca-dizajn` i trenutni frontend lokalno jedan pored drugog (Storybook-style ili dva porta), po jednoj rezoluciji desktop breakpointa iz Constitution.
- Za svaki od 4 ekrana napraviti checklist: razmaci (spacing scale), tipografija (Inter veličine iz Constitution §23), boje (semantic token upotreba 80-90% neutrals), radius/motion.

### 3.2 — Svi tiketi (`/tickets`)
- Dodati "CSV export" akciono dugme u `ticket-list-page.tsx` zaglavlje (desno od "Novi tiket", stil `variant="outline"` kao u referenci), koje poziva postojeći scoped export mehanizam (`audit.export`/report pack infrastruktura — samo za listu tiketa, ne cijeli Reports modul; provjeriti da li postoji već servisna funkcija za CSV export filtrirane liste tiketa, ili je potrebno dodati uzak backend endpoint `GET /tickets/export?...filters` sa istim OU scoping-om kao `GET /tickets`).
- Vidljivost dugmeta: samo za role sa `audit.export`/`ticket.export`-ekvivalentnom permisijom (ne za plain USER, po RAW granularnim permisijama).

### 3.3 — Detalji tiketa i Kreiranje tiketa
- Proći checklist iz 3.1 komponentu po komponentu; nesklad zabilježiti i ispraviti direktno u Tailwind klasama (bez strukturnih promjena, jer je struktura već strukturno usklađena — vidi Analizu §7.2/7.3).

### 3.4 — Grupe
- Formalno dokumentovati dizajn-odluku (nema izvornog mockup-a): ekran prati Constitution + obrazac kartica iz `Routing.tsx` (target group selector stil) i tabele korisnika iz `Admin.tsx`. Dodati kratku bilješku u `.cursor/docs/` (npr. `06-groups-design-rationale.md`) da se ne ponavlja pitanje u budućim izmjenama.
- Primijeniti isti spacing/radius/token checklist kao 3.1.

**Acceptance criteria Faze 3:** checklist za sva 4 ekrana zatvoren (0 otvorenih neusklađenosti ili eksplicitno obrazloženo odstupanje), CSV export dugme funkcionalno i permission-gated.

---

## Faza 4 — i18n dovršni prolaz (van osnovnog namespace-a)

- Provjeriti da enum labele koje tikete referenciraju van `tickets.*` namespace-a (audit log akcije, notifikacijski template-i, email subject/body za "new ticket"/"assigned"/"new message"/"resolved-closed") imaju BS+EN parity — trenutna provjera je pokrivala samo `tickets.*` ključeve; proširiti skriptu iz analize (§8) da prekrije i `notifications.*`, `auditLog.*` namespace ako sadrže ticket-vezan tekst.
- Ručna provjera kvaliteta prevoda (ne samo postojanje ključa) za 10-ak nasumično odabranih poruka po ekranu.

**Acceptance criteria:** 0 nedostajućih ključeva u proširenom namespace skupu; spot-check prevoda potpisan.

---

## Faza 5 — Regresija i RBAC test suite dopuna

- `TASKS.md` već ima otvorenu stavku `[ ] RBAC test suite u CI` — ova faza je prirodni nastavak, fokusiran na scenarije otkrivene u ovoj analizi:
  1. USER sa OU, bez posebnih permisija → može kreirati tiket, ne može vidjeti tuđe tikete van svoje OJ, ne može pristupiti admin OU/servis WRITE rutama.
  2. AGENT sa OU=X, servis=bilo koji, **bez** group membership-a → `GET /tickets?originUnitId=X` vraća tikete; `GET /tickets/inbox` vraća prazno + `hasGroupMembership=false`.
  3. AGENT sa OU=X, servis=bilo koji, **sa** group membership-om u grupi koja pokriva X → i lista i inbox vraćaju tikete.
  4. AGENT sa OU=null ("bilo koja") → potvrditi da NEMA pristup nijednom tiketu (dokumentovano namjerno ponašanje iz 1.4, regresioni test da se to ne promijeni slučajno u budućnosti).
  5. SuperAdmin → uvijek pristup, uvijek bypass, bez obzira na role/permission/OU zahtjeve (postojeće, samo dodati eksplicitan test-case naziv koji referencira ovu analizu radi sljedivosti).
  6. Bulk close i dalje zabranjen (`BULK_CLOSE_FORBIDDEN`) — regresioni test da buduće izmjene Faze 1-4 ne naruše ovo.
  7. Reopen guard (`REOPEN_REQUIRED` na direktan PATCH iz RESOLVED/CLOSED) — regresioni test.

**Acceptance criteria:** svi navedeni scenariji kao automatizovani testovi u `backend/src/modules/tickets/*.spec.ts` i `backend/src/modules/authorization/*.spec.ts`, uključeni u CI pipeline (`.github/workflows`).

---

## Redoslijed izvršenja (sažetak)

| Faza | Zavisi od | Rizik ako se preskoči |
|---|---|---|
| 1 — RBAC/OU/Grupe fix | — | Bug-ovi ostaju, USER/AGENT i dalje blokirani |
| 2 — UUID/auto-fill sitnice | Faza 1 (dijelom) | Kozmetički propusti ostaju |
| 3 — Dizajn parity | Faza 1 | Vizuelne razlike se miješaju sa funkcionalnim greškama u budućem QA |
| 4 — i18n dovršni prolaz | — (nezavisno) | Manji broj neprevedenih poruka van glavnog toka |
| 5 — RBAC test suite | Faza 1 | Regresija ostaje neotkrivena u budućim izmjenama |

**Napomena:** Faze 2-5 se mogu raditi paralelno nakon Faze 1, ali Faza 1 mora biti završena i verifikovana (test plan) prije nego što se bilo šta drugo smatra "gotovim", jer svaka naredna faza pretpostavlja ispravan RBAC/OU/Grupe sloj kao temelj.
