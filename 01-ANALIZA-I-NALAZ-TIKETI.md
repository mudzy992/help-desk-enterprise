# EP-HelpDesk — Analiza i nalaz: modul TIKETI

**Datum analize:** 18.09.2026.
**Obuhvat:** isključivo funkcionalnosti tiketa i modula direktno vezanih za tikete (RBAC/OU scoping, grupe/handler groups, routing, katalog usluga kao ulaz u kreiranje tiketa, SLA kao atribut tiketa, i18n i UUID→naziv prikaz **na ekranima tiketa**). Svi moduli koji se tiču isključivo drugih domena (npr. cjelokupni Knowledge Base uređivački tok, Edge ekstenzija van ticket-remote/chat kontrakta, izvještaji koji nisu vezani za tikete) su **svjesno izostavljeni** u skladu sa uputom.
**Metod:** statička analiza izvornog koda (backend NestJS/Prisma, frontend React/Vite), poređenje sa `RAW_PROJECT_EPHELPDESK.md`, `TASKS.md`, `Master UI-UX Design Constitution.md` i `/referenca-dizajn`. Aplikacija nije pokretana (nema mrežnog pristupa u ovom okruženju), pa nalazi o ponašanju u runtime-u su izvedeni iz koda, ne iz manuelnog klikanja kroz UI.

---

## 1) Sažetak (executive summary)

| # | Nalaz | Ozbiljnost | Status |
|---|---|---|---|
| 1 | `GET /organizational-units/tree` (i srodne OU rute) zaključan na rolu `ADMIN`, a koristi ga forma za kreiranje tiketa i direktorij imena za SVE role → USER i AGENT ne mogu kreirati tiket / ne vide nazive | **Kritično** | Potvrđeno u kodu |
| 2 | Vidljivost tiketa za AGENT-a zavisi od **dva nepovezana mehanizma** (RBAC `UserRole` scope i `GroupMember` članstvo); zadani "Inbox" tab koristi samo drugi, pa ispravno dodijeljen OU/servis scope ne garantuje da agent vidi tikete | **Kritično** | Potvrđeno u kodu |
| 3 | `doesOrganizationalUnitScopeCover` tretira "bilo koja OJ" (null) kao **NEMA pristupa**, dok `doesServiceScopeCover` tretira "bilo koji servis" (null) kao **pristup svemu** — nekonzistentno, zavodljivo u UI-u | **Visoko** | Potvrđeno u kodu |
| 4 | Forma za kreiranje tiketa prisiljava ručan odabir organizacione jedinice za SVE role, iako je backend već sposoban auto-popuniti iz `user.organizationalUnitId` | **Srednje (UX)** | Potvrđeno u kodu |
| 5 | `ticket-split-panel.tsx` prikazuje sirovi `parentTicketId` (cuid) umjesto broja tiketa | **Nisko** | Potvrđeno u kodu |
| 6 | Dugme "CSV export" na listi tiketa iz referentnog dizajna nema ekvivalent na `/tickets` listi u trenutnoj implementaciji | **Nisko (parity)** | Potvrđeno u kodu |
| 7 | Referentni dizajn nema poseban mockup ekrana "Grupe" — trenutni `GroupsPage` je izveden iz `Admin.tsx`/`Routing.tsx` uzoraka, bez 1:1 vizuelnog izvora | **Informativno** | Potvrđeno |
| 8 | i18n (BS/EN) parity za `tickets.*` ključeve je **kompletan** (1981/1981 ključeva u oba jezika) | Pozitivan nalaz | Potvrđeno |
| 9 | State machine tranzicija statusa tiketa i reopen-guard su **ispravno implementirani** i usklađeni sa RAW-om | Pozitivan nalaz | Potvrđeno |
| 10 | Bulk akcije (zabrana bulk close, scope provjera, permission provjera) su **ispravno implementirane** | Pozitivan nalaz | Potvrđeno |

Nalazi #1–#4 direktno objašnjavaju oba prijavljena problema i predstavljaju prioritet za Fazu 1 faznog plana.

---

## 2) RAW → implementacija: pokrivenost funkcionalnosti tiketa

Provjereno na osnovu koda (ne samo `TASKS.md`), po `.cursor/docs/matrices/*` obuhvatu koji se tiče tiketa:

| Funkcionalnost (RAW slug) | Backend | Frontend | Napomena |
|---|:---:|:---:|---|
| `ticketing-core` (CRUD, statusi) | ✅ | ✅ | `tickets.controller.ts`, `create-ticket.ts`, state machine u `tickets.constants.ts` |
| `ticket-priority-impact-urgency-matrix` | ✅ | ✅ | `resolve-ticket-priority.ts`, `usePriorityMatrix` na frontu; override auditovan (`resolveTicketPriority`) |
| `routing-rules` / `routing-fallback-and-coverage` | ✅ | ✅ (admin) | `apply-create-ticket-routing.ts`, unrouted queue vidljiv u Inbox-u (`ticket-inbox-unrouted-banner.tsx`) |
| `ticket-group-inbox` | ✅ | ✅ | vidi **Nalaz #2** za prazninu u RBAC↔Group vezi |
| `ticket-participants-model` | ✅ | ✅ | `ticket-participants-panel.tsx`, default REQUESTER+HANDLER_GROUP |
| `ticket-chat-message-types` | ✅ | ✅ | `MessageType` enum, `ticket-message-bubble.tsx` razlikuje INTERNAL_NOTE |
| `ticket-attachments-uploads` | ✅ | ✅ | MIME/ext allow-list, klasifikacija naslijeđena od tiketa |
| `ticket-confidential-visibility` | ✅ | ✅ | `evaluate-confidential-ticket-access.ts`, break-glass sa audit-om |
| `ticket-forwarding-cross-ou` | ✅ (kroz bulk/assign + routing override) | ⚠️ djelimično | Cross-OU forward postoji kroz reassign grupe; eksplicitan "Forward" akcioni gumb sa obaveznim reason poljem nije zaseban UI element — trenutno se postiže promjenom `assignedGroupId` kroz update/])
| `ticket-waiting-for-user-automation` | ✅ | ✅ | reminder/auto-close job (`waiting-for-user-automation.service.ts`) |
| `ticket-reopen-policy` | ✅ | ✅ | `reopen-ticket.ts` razlikuje reopen unutar prozora (isti tiket) i van prozora (novi, linkovan tiket) |
| `ticket-sla-engine` (kao atribut tiketa) | ✅ | ✅ | `ticket-sla-panel.tsx`, pauza na WAITING_FOR_USER/PENDING_APPROVAL |
| `ticket-close-codes-analytics` | ✅ | ✅ | `apply-ticket-resolution.ts` traži close code prije RESOLVED |
| `ticket-dedup-merge` | ✅ | ✅ (admin/superadmin, bulk) | `apply-bulk-merge.ts` |
| `ticket-split` | ✅ | ✅ | vidi **Nalaz #5** za UUID prikaz |
| `ticket-bulk-actions` | ✅ | ✅ | bulk close eksplicitno zabranjen (`BULK_CLOSE_FORBIDDEN`), scope provjera odvojena (`assertBulkTicketScope`) |
| `structured-broadcast-incident-updates` | ✅ | ✅ | required polja (šta/koga/ETA), rate limit, preview broja primalaca |
| `ticket-saved-views` | ✅ | ✅ | per-user, `ticket-saved-views-panel.tsx` |
| `ticket-close-codes` / `workflow-required-fields` | ✅ | ✅ | `collect-missing-required-fields.ts` |
| `data-classification-inheritance` | ✅ | — (prikaz postoji, upravljanje je admin/servis) | `inherit-attachment-classification.ts` |
| `security-redaction-pii-secrets` | ✅ | ✅ (warn banner) | `detect-sensitive-content.ts`, warn-only default |
| `security-safe-logging` | ✅ | n/a (backend-only) | `format-safe-ticket-log.ts` |
| `guardrails-anti-loop-anti-spam` | ✅ | ✅ (upozorenje + "kreiraj ipak") | `find-duplicate-tickets.ts`, `CreateTicketReviewView` |
| `csat-feedback` | ✅ | ✅ | `ticket-csat-panel.tsx` |
| `data-lifecycle-archive` | ✅ | ✅ (ARCHIVED status filtriran iz aktivnih lista) | `ticket-archive-automation.service.ts` |
| `security-permissions-rbac` + `security-permission-scopes` (primijenjeno na tikete) | ⚠️ **djelimično ispravno** | ⚠️ **djelimično ispravno** | vidi Nalaze #1–#3 |

**Zaključak ovog dijela:** funkcionalna širina implementacije (feature-by-feature) je vrlo visoka i uglavnom vjerno prati RAW specifikaciju — problem nije u "šta nedostaje" nego u **kako se sastavljaju dvije-tri postojeće, ispravno napisane cjeline** (RBAC scope, Group membership, OU stablo kao read-permission), gdje presjek stvara prazninu koja se u praksi manifestuje kao "ne mogu / ne vidim".

---

## 3) Matrica kretanja tiketa (state machine)

Izvor istine: `backend/src/modules/tickets/tickets.constants.ts` (`allowedTicketStatusTransitions`) + `assert-patch-ticket-status.ts` + `reopen/`, `approvals/`, `archive/` guard slojevi.

### 3.1 Dozvoljene tranzicije (osnovni graf)

| Iz statusa | Dozvoljeno u | Ko smije (uz OU/servis/confidential scope) | Napomena / guard |
|---|---|---|---|
| `UNROUTED` | `PENDING` | AGENT/ADMIN sa scope-om na taj OU+servis, SUPER_ADMIN | Nastaje kad routing nema match; vidljivo u "unrouted queue" (SUPER_ADMIN owner po RAW-u) |
| `PENDING` | `ASSIGNED`, `IN_PROGRESS`, `PENDING_APPROVAL` | AGENT/ADMIN/SUPER_ADMIN (`canChangeTicketStatus`) | `PENDING_APPROVAL` samo ako servis/politika zahtijeva odobrenje (postavljeno već pri kreiranju, ne ručnim PATCH-om) |
| `PENDING_APPROVAL` | `PENDING` (odobreno), `CLOSED` (odbijeno) | **Samo** kroz `tickets-approvals.controller.ts` (approve/reject), **NE** kroz generički `PATCH /tickets/:id` | `assertPatchTicketStatus` eksplicitno baca `APPROVAL_DECISION_REQUIRED` / `APPROVAL_TRANSITION_FORBIDDEN` na direktan pokušaj |
| `ASSIGNED` | `IN_PROGRESS`, `PENDING`, `WAITING_FOR_USER` | AGENT/ADMIN/SUPER_ADMIN | `PENDING` = "vrati u red" (npr. agent otpusti tiket) |
| `IN_PROGRESS` | `WAITING_FOR_USER`, `RESOLVED`, `ASSIGNED` | AGENT/ADMIN/SUPER_ADMIN | `RESOLVED` prolazi kroz `apply-ticket-resolution.ts` (traži close code + required fields) |
| `WAITING_FOR_USER` | `IN_PROGRESS`, `RESOLVED`, `CLOSED` | AGENT/ADMIN/SUPER_ADMIN (i sistemska automatika za auto-close nakon Y dana) | `IN_PROGRESS` se automatski postavlja i kad korisnik odgovori (`resume-waiting-for-user-on-reply.ts`) |
| `RESOLVED` | `CLOSED`, `IN_PROGRESS` | `CLOSED`: AGENT/ADMIN/SUPER_ADMIN (i user preko CSAT/close puta); `IN_PROGRESS`: **samo kroz reopen endpoint**, direktan PATCH je blokiran (`REOPEN_REQUIRED`) | Reopen unutar prozora N dana → isti tiket ide u `IN_PROGRESS`; van prozora → **novi** tiket sa `reopenedFromTicketId` |
| `CLOSED` | `ARCHIVED`, `IN_PROGRESS` | `ARCHIVED`: sistemska automatika (`archive-closed-ticket.ts`, X dana nakon closed); `IN_PROGRESS`: **samo kroz reopen endpoint** | Isto pravilo kao gore — generički PATCH ne smije zaobići reopen politiku |
| `ARCHIVED` | *(terminalno, nema izlaza)* | — | Read-only; ostaje pretraživ ako `archive.searchable=true` |

### 3.2 Paralelni/orthogonal tokovi (ne mijenjaju status direktno, ali uslovljavaju ga)

- **Split** (`split/split-ticket.ts`): ne mijenja status roditelja; child tiketi kreću iz `PENDING`/routed statusa kao novi tiketi, sa `parentTicketId` linkom. Audituje se kao `SYSTEM_EVENT`.
- **Merge/dedup** (`apply-bulk-merge.ts`): child tiketi prate status roditelja i primaju broadcast poruke; sam merge ne prolazi kroz `assertTicketStatusTransition` nego kroz zaseban bulk-merge put.
- **Bulk status update**: prolazi kroz **isti** `assertPatchTicketStatus` guard (poziva se u petlji po tiketu), pa naslijeđuje sva ista pravila — uključujući zabranu direktnog reopen-a i zabranu `PENDING_APPROVAL` skoka. Dodatno: `CLOSED`/`ARCHIVED` kao **cilj** bulk operacije je eksplicitno zabranjen (`closedBulkStatuses = ['CLOSED', 'ARCHIVED']` → `BULK_CLOSE_FORBIDDEN`), što je u skladu sa RAW zahtjevom "bulk close nije dozvoljen".
- **SLA pauza**: ne mijenja status, ali `applyTicketSlaTimers` reaguje na `WAITING_FOR_USER` i `PENDING_APPROVAL` kao pauzirajuća stanja (response/resolution timer stoji).
- **Confidential**: ne blokira nijednu tranziciju statusa; utiče isključivo na *vidljivost* tiketa (ko uopšte može doći do PATCH poziva).

### 3.3 Nalaz — ovaj sloj je ispravan

State machine, reopen-guard i bulk-close zabrana su **korektno implementirani i usklađeni sa RAW zahtjevima**. Nije pronađena nijedna nedozvoljena tranzicija niti zaobilazni put. Ovo je pozitivan nalaz — nije potrebna intervencija u Fazi 1/2 faznog plana, samo regresioni test (vidi fazni plan, Faza 6).

---

## 4) Root-cause analiza prijavljenih problema

### 4.1 Problem A — "Korisnik sa dodijeljenim OU i ulogom Korisnik ne može kreirati tiket"

**Zašto SuperAdmin uvijek uspije:** `decideAuthorizationAccess()` (`evaluate-authorization-access.ts`) ima eksplicitnu granu:

```ts
if (input.context.isSuperAdmin) {
  if (!input.context.isLocalOnly) return deny(...);
  return allow(authorizationDecisionReasons.superAdminAllowed);
}
```

SuperAdmin **zaobilazi svaku rola/permission provjeru** prije nego što se uopšte pogleda `requiredRoles`. Zbog toga SuperAdmin nikad ne udari ni na jedan od guard-ova opisanih niže.

**Zašto USER (i AGENT) ne uspijevaju:**

1. Forma za kreiranje tiketa (`useCreateTicketCatalog` → `frontend/src/lib/tickets/use-create-ticket-catalog.ts`) učitava katalog OVAKO:
   ```ts
   Promise.all([listOfferedServices(), listOrganizationalUnitTree()])
   ```
2. `listOrganizationalUnitTree()` zove `GET /organizational-units/tree`.
3. Taj endpoint je zaštićen na nivou **cijelog kontrolera**:
   ```ts
   @Controller('organizational-units')
   @UseGuards(SessionAuthenticationGuard, RoleGuard)
   @RequireRoles(authorizationRoleKeys.admin)   // ⚠️ SAMO admin
   ```
   Nema per-route override za GET rute (za razliku od servisnog kataloga — vidi niže).
4. Za USER/AGENT ovaj poziv vraća `403`. Pošto je upakovan u `Promise.all`, **cijeli** `.then()` se preskače i pada u `.catch()`, koji postavlja `errorKey = "tickets.errorCatalog"` — čak i ako je `listOfferedServices()` uspio. Rezultat: forma za kreiranje tiketa prikazuje grešku kataloga i **ne renderuje korak biranja servisa** ni za koga osim ADMIN/SUPER_ADMIN.

**Dokaz da je ovo previd, ne namjeravano ponašanje:** modul `service-catalog` (services, service-forms, service-availability) ima **upravo za ovaj scenarij** definisanu konstantu:

```ts
// backend/src/modules/service-catalog/catalog-ticket-create-read-roles.ts
export const catalogTicketCreateReadRoles = [
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
] as const;
```
i koristi je per-rutno da override-uje class-level `admin`-only guard na GET rutama koje mora čitati svako ko kreira tiket (`services.controller.ts:58,64`, `service-forms.controller.ts:63,85`, `service-availability.controller.ts:127`). **Isti obrazac nije primijenjen na `organizational-units.controller.ts`** (ni na `groups.controller.ts`, koji trenutno nema nijednu javno-čitljivu rutu).

**Posljedica van forme za kreiranje:** `useDirectory()` (`frontend/src/lib/directory/use-directory.ts`), koji se koristi na listi tiketa (`ticket-list-page.tsx` za `originNames`), na stranici Korisnici i Grupe, poziva isti `listOrganizationalUnitTree()` prvi u nizu — za USER/AGENT ovo baca grešku prije nego što se ijedan naziv OU-a učita, pa se u UI-u umjesto naziva organizacione jedinice prikazuje prazno/ID (vidi i Nalaz #6 dole).

### 4.2 Problem B — "Agent sa dodijeljenim OU i bilo kojim servisom ne vidi tikete koji pripadaju tom OU"

Ovdje postoje **dva nezavisna sistema vidljivosti** koji nisu povezani u administraciji:

**Sistem 1 — RBAC scope (`UserRole`)**
- `UserRole { roleId, organizationalUnitId?, serviceId? }` — dodjeljuje se preko `UserRolesSection` (na profilu korisnika) ili automatski pri `createUser()` (Add User forma).
- Koristi ga `canManageTicketsInScope()` za: opću listu tiketa (`GET /tickets`), detalje tiketa, PATCH akcije.
- Provjereno u kodu: kada je servis "Bilo koji" (`serviceId = null`), `doesServiceScopeCover()` ispravno vraća `true` za bilo koji traženi servis (wildcard radi).
- **Kada je OU postavljen na konkretnu vrijednost i servis na "bilo koji", ovaj sloj ispravno vraća `true`/vidljivost za tikete iz te OJ.** Ovaj sloj **nije** uzrok problema B kad je OU eksplicitno postavljen — ali je uzrok šireg dizajn-nedostatka (vidi 4.3 ispod) kada admin izabere "Bilo koja organizaciona jedinica".

**Sistem 2 — Group Inbox (`GroupMember`)**
- Tiketi se rutiraju na **grupu** (`Group`, preko routing pravila `originUnit+service → group`), ne direktno na OU ili na agenta.
- Zadani ekran koji agent vidi kad otvori "Tiketi" je **Inbox** (`parseView()` default = `"inbox"` u `use-ticket-list.ts`).
- Inbox se puni preko `listGroupInboxTickets()` (`backend/src/modules/tickets/assignment/list-group-inbox-tickets.ts`):
  ```ts
  async function resolveInboxGroupWhere(prisma, context) {
    if (context.isSuperAdmin) return { not: null };
    const memberships = await prisma.groupMember.findMany({ where: { userId: context.subjectId } });
    const groupIds = memberships.map(m => m.groupId);
    if (groupIds.length === 0) return null;   // ⚠️ prazan inbox, bez obzira na RBAC scope
    return { in: groupIds };
  }
  ```
  Ako agent **nije ručno dodan** kao `GroupMember` grupe koja pokriva tu OJ (poseban korak na `/admin?tab=groups`, admin-only ekran), funkcija odmah vraća `null`, i **Inbox je prazan bez ikakve provjere OU/servis scope-a** — RBAC provjera (`canManageTicketsInScope`) se u ovom slučaju nikad ne ni izvrši, jer se prekine ranije.

**Zaključak:** RBAC dodjela role+OU+servis (koju admin obično radi na profilu korisnika) **ne implicira** i članstvo u handler grupi (koje se radi na potpuno odvojenom ekranu — Grupe). Ništa u UI-u ne upozorava admina na ovaj raskorak, niti postoji "moje grupe" prikaz za samog agenta da provjeri zašto ne vidi ništa. Agent tako ima ispravan RBAC pristup (vidljiv, npr., kroz tab "Svi tiketi" ili filtriranu listu — jer taj put IDE kroz `canManageTicketsInScope` bez Group-provjere), ali **podrazumijevani prvi ekran koji vidi (Inbox) je prazan**, što stvara utisak "ne vidim tikete iz moje OJ" — a to je tačno onaj utisak koji je prijavljen.

### 4.3 Dodatni nalaz koji pojačava problem B — asimetrija "bilo koji" wildcard-a

`backend/src/modules/authorization/does-organizational-unit-scope-cover.ts`:
```ts
export function doesOrganizationalUnitScopeCover(input) {
  if (!isNonEmptyScopeValue(input.assignedPath) || !isNonEmptyScopeValue(input.requestedPath)) {
    return false;   // ⚠️ "Bilo koja OJ" (null) => NIKAD ne pokriva ništa
  }
  ...
}
```
nasuprot
```ts
export function doesServiceScopeCover(input) {
  if (!isNonEmptyScopeValue(input.requestedServiceId)) return false;
  if (input.assignedServiceId === null) return true;   // "Bilo koji servis" (null) => pokriva SVE
  ...
}
```
U `UserRolesSection` i `AddUserForm` na frontu, opcija za OU u dropdown-u glasi **"Bilo koja organizaciona jedinica"** (`t("users.scopeAnyOrganizationalUnit")`), a analogna opcija za servis glasi **"Bilo koji servis"**. Iz UI perspektive ove dvije opcije izgledaju simetrične — ali backend ih tretira suprotno: servis-wildcard radi kao globalni pristup, OU-wildcard **nikad ne odobrava pristup nijednom tiketu** (pošto je `requireOrganizationalUnitScope: true` fiksno postavljeno u `canManageTicketsInScope`). Ako je admin, pokušavajući da agentu da širi pristup (npr. agent na nivou Direkcije koji pokriva više OJ), izabrao "Bilo koja OJ" umjesto da doda po jedan `UserRole` red za svaku relevantnu OJ, taj agent **efektivno nema pristup baš nijednom tiketu** van onih koje je sam prijavio — što je najgori mogući ishod za tačno onu namjeru admina.

---

## 5) UUID → naziv: sistemski nalaz (ekrani tiketa)

Pretraga direktnog renderovanja `*Id` polja u `src/components/tickets/*` i `src/pages/ticket-*`:

| Lokacija | Polje | Status |
|---|---|---|
| `ticket-split-panel.tsx:47` | `ticket.parentTicketId` renderovan direktno kao link tekst | **Bug** — treba `ticketNumber` (npr. `T-000045`) roditeljskog tiketa, ne cuid |
| `ticket-list-table.tsx` | `assignedUserId`/`serviceId`/`originUnitId` | OK — prolaze kroz `directoryAssigneeNames`/`serviceNames`/`originNames` mape (ali te mape **zavise od Nalaza #1** — ako OU stablo ne učita, fallback je prazan naziv, ne UUID, što je bar bezbjedno degradiranje, ali ne i ispravno rješenje) |
| `ticket-detail-sidebar.tsx`, `ticket-participants-panel.tsx` | Isto — koriste name-lookup helpere, ne prikazuju sirove ID-jeve direktno | OK, uz istu zavisnost od Nalaza #1 |
| `ticket-badges.tsx`, `ticket-sla-panel.tsx` | Statusi/prioriteti/SLA stanja | OK — koriste labelKey mape (enum → i18n), nema UUID izloženosti |

**Zaključak:** sistemska disciplina "ne prikazuj UUID" je uglavnom ispoštovana kroz namjenske name-lookup helpere (`ticket-display.ts`), sa jednim konkretnim propustom (split panel) i jednom **posrednom** ranjivošću — ako izvor imena (OU stablo/direktorij) ne uspije učitati zbog Nalaza #1, prikaz degradira na prazno polje umjesto na čitljiv naziv. Popravkom Nalaza #1 se automatski poboljšava i pouzdanost ovog sloja.

---

## 6) Auto-fill nalaz (ekran kreiranja tiketa)

RAW i eksplicitan zahtjev traže da se izbjegne ručni odabir gdje god je vrijednost izvediva iz konteksta korisnika.

| Polje | Trenutno stanje | Nalaz |
|---|---|---|
| **Organizaciona jedinica (originUnitId)** | Uvijek prikazan kao obavezan `<select>` sa placeholderom, za SVE role (`create-ticket-fields.tsx:52-68`) | Backend (`resolveCreateOriginUnitId`) već ume izvesti OU iz `user.organizationalUnitId` kad polje nije poslano. Za rolu USER (koja ne smije birati tuđu OJ osim ako `canManageTicketsInScope` to dozvoli) ovo polje bi trebalo biti **auto-popunjeno i read-only prikaz** ("Vaša organizaciona jedinica: X"), a ne obavezan ručni odabir. Za AGENT/ADMIN/SUPER_ADMIN zadržati editabilan odabir (jer oni legitimno kreiraju tikete u ime drugih OJ). |
| **Podnosilac zahtjeva (requester)** | Uvijek trenutni korisnik (`actor.id`), backend podržava `requesterUserId` override, ali frontend forma za kreiranje **nema polje** za to | Djelomično OK — auto-fill po defaultu je ispravan; ako se želi da agent kreira tiket u ime drugog korisnika (nije eksplicitno u RAW obaveznim listama za MVP van agent-side workflow-a), trenutno nedostaje UI za to. Ne tretira se kao bug, samo napomena za fazni plan ako se doda kasnije. |
| **Impact/Urgency → Priority** | Predložena vrijednost se automatski računa i prikazuje (`suggestedPriority`), korisnik bira samo impact/urgency (2 klika) | OK, usklađeno sa RAW ("brzo, 1-2 klika") |
| **Form verzija (formVersionRef)** | Auto-učitava se aktivna verzija forme za odabrani servis (`activeFormVersion`) | OK |
| **Department/Company (sekundarni AD atributi)** | Nisu izloženi u formi za kreiranje (samo OU se traži) | U skladu sa RAW — Company/Department su sekundarni, ne primarni scope izvor |

---

## 7) Dizajn — usklađenost ekrana tiketa sa `/referenca-dizajn`

Napomena metodologije: nije moguće izvršiti piksel-tačno poređenje bez pokretanja oba UI-a (nema browser/render alata u ovom okruženju). Poređenje niže je **strukturno** (raspored sekcija, prisutnost elemenata, tokens/klase) na osnovu izvornog koda oba projekta.

### 7.1 Svi tiketi (`/tickets`)
- Podudaranje: `PageHeader` (crumbs/title/subtitle/actions), lijevi panel "Sačuvani pogledi" širine ~220px, `UnderlineTabs`/`Tabs` sa statusima + poseban "SLA rizik" tab sa crvenom tačkom, traka filtera (pretraga + prioritet chip-ovi + servis select) — **implementacija u `ticket-list-filters.tsx` strukturno vrlo blisko odgovara referenci** (`referenca-dizajn/src/pages/Tickets.tsx`).
- **Razlika:** referentni dizajn u zaglavlju ima dugme `Download` → "CSV export (audited)" pored "Novi tiket"; trenutna `ticket-list-page.tsx` nema ekvivalent dugme na listi (CSV export postoji samo unutar `/reports`, koji je van obuhvata ovog zadatka, ali sa stanovišta parity-ja liste tiketa ovo je vizuelna razlika).

### 7.2 Detalji tiketa (`/tickets/:id`)
- Podudaranje na nivou strukture komponenti: `ticket-detail-header.tsx` (naslov + status/prioritet/SLA/confidential bedž-ovi), `ticket-detail-sidebar.tsx` (Grupa/Prioritet/OJ/servis meta-polja), `ticket-sla-panel.tsx`, `ticket-conversation.tsx`+`ticket-message-composer.tsx`, `ticket-attachments-panel.tsx`, `ticket-time-tracking-panel.tsx`, `ticket-participants-panel.tsx` — nazivi i podjela odgovornosti komponenti **direktno odražavaju** sekcije viđene u `referenca-dizajn/src/pages/TicketDetail.tsx` (meta lista `["Grupa", ...], ["Prioritet", ...]`, tabovi, SLA bedž, attachments sa klasifikacijom).
- **Preporuka:** obavezan vizuelni QA prolaz (Faza 4 faznog plana) jer strukturna sličnost ne garantuje identične razmake/boje/tipografiju — to zahtijeva manuelno renderovanje oba UI-a jedno pored drugog.

### 7.3 Kreiranje novog tiketa (`/tickets/new`)
- Koraci (service picker → detalji/forma → KB intercept → pregled) odgovaraju konceptu wizard-a; `create-ticket-*` komponente prate isti obrazac sekcija kao `referenca-dizajn/src/pages/NewTicket.tsx`.
- **Otvoreno pitanje riješeno Nalazom #4:** OU dropdown u koraku detalja treba redizajnirati (auto-fill/read-only za USER).

### 7.4 Grupe (`/admin?tab=groups`)
- **Referentni dizajn nema samostalan ekran "Grupe".** Grupe se u `referenca-dizajn` pojavljuju samo kao lookup podatak (bedž uz OU u tabeli korisnika na `Admin.tsx`, i kao target select u `Routing.tsx`). Trenutni `GroupsPage`/`groups-panel.tsx`/`group-card.tsx` su nužno izvedeni iz najbližih srodnih obrazaca (kartice + sekcija članova), bez izvornog 1:1 mockup-a.
- **Preporuka za fazni plan:** eksplicitno dokumentovati ovu dizajn-odluku (Grupe ekran prati Constitution tokene + obrazac kartica iz `Routing.tsx`/`Admin.tsx` tabele), umjesto nagađanja nepostojećeg mockup-a.

---

## 8) i18n nalaz (ekrani tiketa)

- Ključevi za namespace `tickets.*` su **potpuno paritetni** između `src/i18n/locales/bs/common.json` i `.../en/common.json` (ukupno 1981 ključ u svakom fajlu, 0 razlika bilo kojim smjerom).
- Grep pretraga na hardkodovan tekst (regex za veliko početno slovo + razmaci, van `t(...)`/`ticketText(...)`) u `src/components/tickets/*.tsx` nije pronašla pogotke.
- **Preporuka:** ovaj nalaz je pozitivan; u faznom planu predviđena je samo verifikacija kvaliteta prevoda (ne strukturna dopuna), plus provjera enum labela (status/priority/impact/urgency/message type) koje se koriste i van `tickets` namespace-a (npr. u audit logu, notifikacijama) da im labela ne "cure" na engleskom kad je BS aktivan jezik.

---

## 9) Popis izvora provjerenih u ovoj analizi (za sljedivost)

- `RAW_PROJECT_EPHELPDESK.md`, `TASKS.md`
- `backend/src/modules/tickets/**` (kompletan popis fajlova pregledan strukturno; ključni fajlovi čitani u cjelini: `create-ticket.ts`, `assert-can-create-ticket.ts`, `list-tickets.ts`, `authorize-ticket-actor.ts`, `assert-ticket-status-transition.ts`, `assert-patch-ticket-status.ts`, `tickets.constants.ts`, `assignment/list-group-inbox-tickets.ts`, `bulk/*`, `ticket-split-panel.tsx`)
- `backend/src/modules/authorization/**` (`evaluate-authorization-access.ts`, `does-organizational-unit-scope-cover.ts`, `does-service-scope-cover.ts`, `role.guard.ts`)
- `backend/src/modules/organizational-units/organizational-units.controller.ts`, `backend/src/modules/groups/groups.controller.ts`
- `backend/src/modules/service-catalog/catalog-ticket-create-read-roles.ts` i kontroleri koji ga koriste
- `backend/src/modules/users/create-user.ts`
- `backend/prisma/schema/identity.prisma`, `enums.prisma`
- `frontend/src/lib/tickets/use-create-ticket-catalog.ts`, `frontend/src/lib/directory/use-directory.ts`, `frontend/src/lib/tickets/use-ticket-list.ts`
- `frontend/src/components/tickets/**`, `frontend/src/components/users/user-roles-section.tsx`, `add-user-form.tsx`, `frontend/src/components/groups/**`
- `frontend/src/i18n/locales/{bs,en}/common.json`
- `referenca-dizajn/src/pages/{Tickets,TicketDetail,NewTicket,Admin,Routing}.tsx`
