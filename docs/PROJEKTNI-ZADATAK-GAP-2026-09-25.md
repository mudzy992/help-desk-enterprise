# Usklađenost s projektnim zadatkom + šta još nedostaje — 2026-09-25

Izvor zahtjeva: `RAW_PROJECT_EPHELPDESK.md` (strukturirani SRS iz `EPHELPDESK.pdf`),
§1 Core features, §8 Notifikacije, §10 Kvalitet, §12 Acceptance criteria, MVP constraints.
Edge ekstenzija je **izuzeta** (posebna tema).

Metoda: svaka stavka zadatka provjerena u kodu (backend modul/servis/kontroler, frontend
komponenta, scheduler, test), plus poređenje svih 281 settings ključeva iz zadatka s registrom u
kodu. „✅" znači da postoji implementacija i test; nije ručno testirano na stagingu.

## 0. Sažetak

| | Broj stavki |
|---|---|
| ✅ Implementirano | 51 |
| 🟡 Djelimično (bitan dio fali) | 8 |
| ❌ Nije implementirano | 2 |
| 🔎 Treba verifikovati na EPBiH infrastrukturi | 3 |

**Nedostaje ili je djelimično (po prioritetu):**

| # | Stavka zadatka | Stanje | Šta fali |
|---|---|---|---|
| G1 | **Prosljeđivanje / eskalacija tiketa (cross-OU forwarding)** | ✅ (paket 1.1, 2026-09-25) | Nema akcije „Proslijedi" na tiketu. Grupa se mijenja samo kroz **bulk assign**, i to bez obaveznog razloga, bez `FORWARDED_FROM/TO_GROUP` participanata (enum postoji, niko ga ne upisuje) i **bez provjere permisije `ticket.forward.cross_ou`** (definisana, nigdje korištena). Ciljna grupa se ne provjerava po OU-u. |
| G2 | **Ticket templates / playbooks** (agent-side) | ✅ (paket 1.4, 2026-10) | ~~Nema modela, API-ja ni UI-ja.~~ Riješeno: šabloni odgovora (zajednički i lični) s pickerom u composeru i playbooks s checklistom na tiketu. **Svjesno odstupanje od RAW §682:** ključ `private.ticket.templates.registryJson` se ne uvodi — pravi model s UI-jem, change logom, soft deleteom i config versioningom (opseg `templates`) ga u potpunosti pokriva, a JSON u postavci bi bio drugi izvor istine. Uvoz/izvoz ide kroz config versioning. |
| G3 | **Time tracking anti-abuse** | 🟡 | Start/Stop radi (jedan aktivni timer po korisniku/tiketu). Fali auto-pauza kad tab nije aktivan > X min i tvrdi limit trajanja sesije (`private.timeTracking.*` ne postoje) → zaboravljen timer broji danima. |
| G4 | **Merge: child prati parent** | 🟡 | Merge postavlja `mergedIntoTicketId`, ali promjena statusa parenta se **ne prenosi** na child tikete, niti broadcast na parent automatski ide child requesterima. |
| G5 | **Priority override (pojedinačno, auditovano)** | 🟡 | Postoji samo bulk priority. Na detalju tiketa agent ne može promijeniti prioritet (DTO nema `priority`). |
| G6 | **Report packs u UI-ju** | 🟡 | Backend `GET /reports/packs/:slug` (Monthly KPI, Overdue by service, Top close codes, KB helpfulness) postoji, a **frontend ga nigdje ne poziva** — admin ne može preuzeti izvještaj. |
| G7 | **E-mail notifikacije — kvalitet** | 🟡 | Šablone postoje (novi, dodijeljen, poruka, riješen, zatvoren, odobrenje, SLA, remote), ali: samo bs (nema EN fallbacka koji zadatak traži za email), samo plain-text, **bez linka na tiket** (`APP_PUBLIC_URL` se ne koristi), naslov confidential tiketa ide u e-mail. |
| G8 | **Workflow transitions u admin UI** | 🟡 | State machine je tvrdo kodirana (`tickets.constants.ts`); zadatak traži da je admin vidi/uređuje (`private.workflow.stateMachine.*`). Prihvatljivo kao svjesna odluka — preporuka: samo read-only prikaz. |
| G9 | **Unrouted queue — cilj grupa i rok čišćenja** | 🟡 | Queue i owner rola postoje; `targetGroupId` i `cleanupSlaHours` (upozorenje kad unrouted tiket stoji > 8 h) nisu implementirani. |
| G10 | `routing.rules.updated` realtime event | ❌ (nisko) | Ne emituje se; drugi admin mora osvježiti stranicu. |

**Za verifikaciju na EPBiH strani (kod postoji, ne može se provjeriti odavde):**
- V1 — Entra ID SSO na pravom tenantu (ID token → korisnik, role iz lokalne baze).
- V2 — LDAPS AD sync (`OU=Korisnici`, `OU=Grupe`) na pravim DC-ovima; mapiranje OU po DN putanji.
- V3 — DR restore drill (`ops/DR.md` postoji; zadatak traži bar jedan stvarno izveden restore).

## 1. Stavka po stavka

### 1.1 Identitet, organizacija, sigurnost
| Zahtjev | Stanje | Gdje |
|---|---|---|
| Lokalni dev auth sa istim claims modelom | ✅ | `authentication/`, `authorization-provider-independence.spec` |
| Entra ID SSO, SuperAdmin samo lokalni | ✅ 🔎V1 | `entra-authentication.provider.ts`, `assert-super-admin-is-local-only.ts` |
| AD sync (manual-only, throttle, cache, scope) | ✅ 🔎V2 | `directory-sync/` (LDAPS + ručni katalog) |
| OU stablo + mapiranje korisnika | ✅ | `organizational-units/`, `materialize-directory-read.ts` |
| RBAC + OU izolacija, SuperAdmin globalno | ✅ | `authorization/evaluate-authorization-access.*` |
| Granularne permisije + default mapiranje | ✅ | `permission-catalog.ts`, `default-role-permissions.spec` |
| Permission scopes (OU / servis) | ✅ | `does-organizational-unit-scope-cover`, `does-service-scope-cover` |
| Shadow permission check (ko dobija/gubi) | ✅ | `shadow-authorization.*`, stranica Permisije |
| RBAC test suite u CI | ✅ | ~20 authorization specova se vrte u `ci.yml` (TASKS.md je zastario) |
| Audit log + hash chain + verify + export CSV/JSON | ✅ | `audit-log/` (`POST /audit-logs/verify`) |
| PII/secret redaction (warn / soft-block) | ✅ | `tickets/redaction/` |
| Safe logging za confidential/restricted | ✅ | `tickets/safe-logging/` |
| Data classification + nasljeđivanje na priloge | ✅ | `inherit-attachment-classification.ts`, `raise-stored-attachment-classification.ts` |
| Read-only mode admin modula | ✅ | `admin-read-only.interceptor.ts` |

### 1.2 Katalog, forme, routing
| Zahtjev | Stanje | Gdje |
|---|---|---|
| Katalog (kategorije → servisi), i za ne-IT službe | ✅ | `service-catalog/` |
| Schema forme po servisu + verzionisanje (`formVersionRef`) | ✅ | `FormVersion`, `resolve-create-form-version-ref.ts` |
| Lifecycle DRAFT / ACTIVE / DEPRECATED | ✅ | `ServiceLifecycle` |
| Availability status + downtime prozori (auto MAINTENANCE) | ✅ | `evaluate-service-runtime-availability.ts` (računa se pri čitanju) |
| Routing po (OU + servis), fallback, unrouted queue | ✅ / 🟡G9 | `routing/`, `apply-create-ticket-routing.ts` |
| Routing coverage provjera u adminu | ✅ | `routing-coverage-table.tsx` |
| Service onboarding wizard + auto-fill routinga | ✅ | `service-onboarding/` |
| Policy packs (IT / HR / Finance) | ✅ | `policy-packs/` |

### 1.3 Tiketi
| Zahtjev | Stanje | Gdje |
|---|---|---|
| Kreiranje: katalog → forma → KB intercept → tiket → group inbox | ✅ | `create-ticket*`, e2e `01-ticket-create` |
| Impact/urgency matrica → prioritet (admin pravila) | ✅ | `PriorityMatrixRule`, `calculate-ticket-priority.ts` |
| Priority override agenta, auditovan | 🟡 G5 | samo `apply-bulk-priority.ts` |
| Group inbox + „preuzmi" + auto-assign (Least Busy / Round Robin) | ✅ | `assignment/` |
| Prosljeđivanje / eskalacija / cross-OU s razlogom | ✅ **G1** | `tickets/forwarding/*`, bulk kroz isti servis |
| Approvals (Pending Approval → approve/reject s razlogom) | ✅ | `tickets/approvals/`, e2e `03-approvals` |
| Waiting for User: podsjetnik + auto-close | ✅ | `WaitingForUserSchedulerService` |
| Reopen u roku N dana, poslije toga novi povezani tiket | ✅ | `tickets/reopen/` |
| State machine guardovi | ✅ / 🟡G8 | `assert-ticket-status-transition.ts` |
| Participants model + tipovi poruka, interne bilješke | ✅ | `TicketParticipant`, `MessageType` |
| Confidential + break-glass, skriveno iz lista i pretrage | ✅ | `tickets/confidential/`, e2e `06-confidential` |
| Prilozi (allow-list, block-list, limit, disk) + ClamAV | ✅ | `tickets/attachments/` |
| Merge (incident) + broadcast | 🟡 G4 | `apply-bulk-merge.ts` |
| Split (parent/child, izbor poruka/priloga) | ✅ | `tickets/split/`, `ticket-split-panel.tsx` |
| Bulk (assign, status bez close, priority, strukturirani broadcast, merge) | ✅ | `tickets/bulk/`, e2e `05-bulk-broadcast` |
| Saved views (lični, default) | ✅ | `tickets/saved-views/` |
| Time tracking + anti-abuse | 🟡 **G3** | `start/stop-ticket-time-log.ts` |
| Remote „Request Remote" (Quick Assist) + rate limit | ✅ | `tickets/remote/` |
| Close codes na RESOLVED + analitika | ✅ | `tickets/close-codes/` |
| Obavezna polja prije RESOLVED/CLOSED | ✅ | `tickets/required-fields/` |
| Anti-spam guardrails (duplikati, veliki broadcast) | ✅ | `tickets/guardrails/` |
| Auto-arhiviranje zatvorenih (read-only) | ✅ | `TicketArchiveSchedulerService` |
| CSAT 1–5 + komentar, u KPI | ✅ | `tickets/csat/`, e2e `08-close-codes-csat` |
| Ticket templates / playbooks | ✅ (paket 1.4) | `modules/templates/`, `/admin/templates`; bez `registryJson` (vidi G2) |

### 1.4 SLA
| Zahtjev | Stanje |
|---|---|
| Pravila po servis + OU + prioritet, fallback profil | ✅ `sla/` |
| Response / resolution, BH kalendari + praznici | ✅ |
| Pauza (Waiting for User, Pending Approval) | ✅ |
| T-minus upozorenja + eskalacije (samo in-app) | ✅ `apply-due-sla-escalations.ts` |
| CRUD kalendara/profila/pravila + change log | ✅ |
| Startni set (BH_STANDARD, 5 profila, P1–P4 baseline) | ✅ `ensure-starting-*` |
| Overdue badge i filter | ✅ e2e `07-sla` |

### 1.5 KB, pretraga, izvještaji
| Zahtjev | Stanje |
|---|---|
| KB intercept + „pomoglo / nije" + rangiranje po feedbacku | ✅ `knowledge-base/` |
| Owner + review due + podsjetnik + „stale" | ✅ `KnowledgeBaseReviewReminderSchedulerService` |
| Full-text (tsvector + GIN) | ✅ migracije `init_enterprise_schema`, `knowledge_article_lifecycle` |
| Globalna pretraga (tiketi, članci, korisnici) + filteri liste | ✅ `search/`, lista tiketa |
| Dashboard KPI (po OU, prosječno rješavanje, opterećenje, KB rate) | ✅ `reports/summary` |
| Bottleneck dashboard | ✅ `GET /reports/bottlenecks` |
| Report packs (CSV/JSON, OU scope) | 🟡 **G6** (samo backend) |

### 1.6 Konfiguracija, integracije, ops
| Zahtjev | Stanje |
|---|---|
| Settings registry (public/private, tipovi, tajne) + UI | ✅ `settings/` |
| Settings realtime prema webu | ✅ `settings.updated` |
| Change log (reason + diff) za settings/routing | ✅ `change-log/` |
| Config versioning + diff + rollback | ✅ `config-versioning/`, e2e `09-config-ops` |
| Dry-run validacija + shadow mode | ✅ |
| Durable queue (BullMQ) + retry/backoff + DLQ + admin UI | ✅ `integration-queue/`, `integration-queue-card.tsx` |
| Teams stub (feature flag) | ✅ |
| In-app notifikacije (lista, nepročitane, mark read) | ✅ |
| E-mail kanal (O365 SMTP, internal-only allow-list) | ✅ / 🟡**G7** |
| i18n bs default + en fallback (UI) | ✅ (2195 ključeva, bez rupa) |
| Install wizard (+ INSTALL_TOKEN) | ✅ |
| Observability + support bundle | ✅ `observability/` |
| DR (backup/restore dokument) | ✅ `ops/DR.md` · 🔎V3 drill |
| E2E kritični tokovi (svih 9 iz §10) | ✅ `e2e/tests/01–09` |
| NFR: < 300 ms, ≥ 1000 korisnika, horizontalno skaliranje | ✅ izmjereno (`PERF_BUDGETS.md`; 200 VU p95 u budžetu, WS cross-instance) |

## 2. Šta nedostaje van projektnog zadatka (preporuke za produkciju)

Stvari koje zadatak ne traži eksplicitno, a u help-desku ovog obima se očekuju. Poredano po
vrijednosti za pilot.

| # | Preporuka | Zašto |
|---|---|---|
| P1 | **MFA (TOTP) za lokalni SUPER_ADMIN nalog** | Jedini nalog s lozinkom i globalnim pravima (break-glass). Login limit postoji, ali lozinka je jedini faktor. |
| P2 | **Link na tiket u svakom e-mailu + HTML šablon** (dio G7) | Bez linka korisnik mora sam tražiti tiket; najčešći razlog da se e-mail ignoriše. |
| P3 | **Odgovor e-mailom (inbound → poruka na tiketu)** | Korisnici odgovaraju na notifikaciju; bez toga odgovor se gubi u sandučetu agenta. Kasnija faza. |
| P4 | **Korisničke postavke notifikacija** (koje događaje e-mailom) | Agenti u velikim grupama dobijaju previše e-mailova → ignorišu sve. |
| P5 | **Indikator „agent X upravo gleda/piše"** na tiketu | Dva agenta istovremeno odgovaraju istom korisniku; realtime infrastruktura već postoji. |
| P6 | **@spominjanje kolege u internoj bilješci** (+ notifikacija) | Standardan način da se uključi kolega bez prosljeđivanja. |
| P7 | **Zakazani izvještaji e-mailom** (npr. mjesečni KPI rukovodstvu) | Nadogradnja na G6. |
| P8 | **Anonimizacija / brisanje ličnih podataka bivših zaposlenika** | Zakon o zaštiti ličnih podataka BiH; sada postoji deaktivacija, ne anonimizacija. |
| P9 | **Eksterni uptime monitoring + alarmi** (npr. Uptime Kuma na `/health`, alarm na DLQ > 0, worker heartbeat) | Metrike postoje u aplikaciji, ali niko ne dobija alarm kad nešto padne; cilj je 99,9 %. |
| P10 | **Accessibility (WCAG 2.1 AA) pregled** | Kontrast je riješen; tastatura/screen reader nisu sistematski provjereni. |

Izvan obima i dalje (kako zadatak kaže): AI klasifikacija, SLA predikcija, puni Teams konektor,
mobilna aplikacija. Također bez ITIL Problem/Change managementa i CMDB-a — ako to bude
potrebno, to je posebna faza.

## 3. Preporučeni redoslijed

1. **G1 prosljeđivanje** — jedini nedostatak koji utiče na svakodnevni rad i na sigurnosni
   model (permisija `ticket.forward.cross_ou` postoji, a ne provjerava se).
2. **G7 + P2 e-mail** (link, HTML, EN) i **G6 report packs u UI** — mali posao, vidljiv efekat.
3. **G3 anti-abuse timera**, **G5 priority override**, **G4 merge propagacija**.
4. **G2 šabloni odgovora** — najveći od preostalih (model + admin CRUD + umetanje u composer).
5. **P1 MFA za SUPER_ADMIN**, **P9 monitoring** — prije produkcije.
6. G8/G9/G10 i ostale P-stavke po dogovoru.
