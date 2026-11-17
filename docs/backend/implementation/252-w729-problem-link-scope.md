# Package closeout — W7.29

**Paket:** W7.29 — service/incident link policy i atomarni link write<br>
**Nalaz:** `BA-problems-11` (P2) — zatvoren<br>
**Kodni commit:** `bf671ac` (paket: `2fe16cb`, `fea57cd`, `bf671ac`)<br>
**Finalni testani SHA:** `bf671ac`<br>
**CI:** [`44150530683`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44150530683) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Problem je mogao nositi referencu na **bilo koji** servis i **bilo koji** status-page incident: pickeri su bili
installation-wide, a `problem.manage` nad problem-grupom se ponašao kao pravo nad tuđim domenima. Servis u `DRAFT`
statusu (katalog ga prikazuje samo adminima) mogao se odabrati, povezati i vidjeti kroz problem; `STAFF_ONLY`
incident koji pripada tuđem servisu mogao se pronaći i povezati. Uz to, link write i njegov `ProblemEvent` nisu bili
jedna cjelina: `service`/`incident` link/unlink i **asset unlink** su prvo mijenjali stanje, pa tek onda pisali
historiju, tako da je pad eventa ostavljao promjenu bez traga ili vraćao grešku klijentu nakon uspješnog upisa.

Acceptance: (1) problem smije referencirati samo servis/incident koji matični domen prikazuje tom korisniku, uz isti
„not found” odgovor kao za nepostojeći zapis (bez odavanja postojanja); (2) svaki link write i njegova historija su
jedna transakcija. Van scopea: hard `take: 200` bez `hasMore` na listama linkova (to je `BA-problems-17`, P3).

## Implementacija

- **Servisi:** `service-catalog/service-read-where.ts` prevodi katalogovu vidljivost
  (`serviceListVisibilityForPrincipal`: lifecycle + `scopedServiceIds` za servisno-scoped admina) u Prisma filter.
  `DRAFT` ostaje admin-only; servisno-scoped ADMIN dobija `DRAFT`/`DEPRECATED` samo za svoje servise.
- **Incidenti:** `status-page/status-viewer.ts` dobija `statusViewerFromAuthorizationContext`, koji gradi isti
  `StatusViewer` kao HTTP putanja (staff = `AGENT`/`ADMIN` assignment, superadmin = global, `canManage` iz
  `status.incidents.manage`). Filter ide kroz postojeći `withIncidentVisibility`: nestaff vidi samo `ALL_USERS`,
  servisno-scoped staff samo `STAFF_ONLY` incidente čiji su **svi** zahvaćeni servisi u njegovom opsegu.
- **Problems:** `problem-cross-domain-visibility.ts` spaja oba pravila iz autorizacijskog konteksta (jedan
  `loadBySubjectId`, bez novog DI providera). Koristi ga `ProblemLinksService` (`get`, `searchIncidents`,
  `linkService`, `unlinkService`, `linkIncident`, `unlinkIncident`, `forIncident`) i `ProblemsService`
  (`options().services`, `assertReferences` za `serviceId` na create/update).
- **Atomarnost:** `linkService`, `unlinkService`, `linkIncident`, `unlinkIncident` i `unlinkAsset` izvršavaju
  promjenu i `ProblemEvent` u **istoj** `$transaction`; ponovljeni link (unique `P2002`) ostaje `{ linked: 0 }` bez
  druge historije. `linkAssets`/`linkAsset` su i prije bili transakcijski (W7.22), pa sada sve veze slijede isti
  obrazac.
- **Error contract:** skriveni servis → `PROBLEM_SERVICE_NOT_FOUND`, skriveni incident → `PROBLEM_INCIDENT_NOT_FOUND`
  (isti kodovi kao za nepostojeći zapis). Nema novih ruta, nema promjene DTO-a.
- **Frontend:** edit sheet zadržava servis koji problem već nosi i kada ga katalog više ne nudi, pa čuvanje ostalih
  polja ne uklanja servis tiho. Pickeri u panelu veza automatski prate suženi `options` odgovor.

## Direktni testni dokaz

- `backend/src/modules/service-catalog/service-read-where.spec.ts` (4) — agent bez draftova, globalni admin svi
  lifecyclei, servisno-scoped admin draftovi samo za svoj servis, fail-closed prazan skup.
- `backend/src/modules/status-page/status-viewer.spec.ts` (10, +5) — kontekst → isti staff scope kao HTTP viewer,
  nestaff bez pristupa, superadmin globalno, `canManage` iz permisije.
- `backend/src/modules/problems/problem-cross-domain-visibility.spec.ts` (5) — agent/admin/scoped admin filteri,
  fail-closed bez konteksta, `STAFF_ONLY` scope, problem manager **nije** status-page staff.
- `backend/src/modules/problems/problem-links-cross-domain.spec.ts` (14) — filtriranje povezanih servisa i
  incidenata, skriveni servis/incident odbijen bez odavanja postojanja, link+event u jednoj transakciji, `P2002`
  replay bez druge historije, unlink servisa/incidenta/asseta atomarno, prazna reverse kartica za nevidljivi incident.
- `backend/src/modules/problems/problem-service-visibility.spec.ts` (4) — `options()` servisi po katalogovom pravilu,
  create/update odbija skriveni servis, čitljiv servis prolazi kroz isti filter.
- `frontend/src/components/problems/problem-form-sheet.spec.tsx` (4) — sakriveni servis ostaje odabran i šalje se
  nepromijenjen.

## CI i testni dokaz

CI run [`44150530683`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44150530683) na `bf671ac`:

- **Backend build + test:** success (generisani Prisma, build, lint, safety-net, wiring, SLA matrica, pun Jest).
- **PostgreSQL + Redis integration:** success (disposable instanca; uključuje `problem-asset-scope` i
  `problem-ticket-unlink` suiteove).
- **Frontend build + test:** success (lint, format, 455 fajlova / 1788 testova, build, bundle budget).
- **Docs guard, container + supply chain, Detect changes, CI gate:** success.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory` — push
  workflow ih ne pokreće.
- **Neuspjeli pokušaji:** `44148379072` na `fea57cd` — backend je pao na **vlastitim** greškama: self-referencing
  prisma double i neannotiran `jest.Mock` poziv u novim specifikacijama (TS7022/TS7024/TS2532/TS2493) te
  `problem-asset-scope` integration suite koji je pravio `ProblemLinksService` bez authorization loadera. Sve
  popravljeno u `bf671ac` prije zelenog runa.

Dodatne lokalne provjere: ciljani backend Jest (`problems` + `service-catalog` + `status-page`) = 35 suiteova /
265 testova; `wiring:check` (99 kontrolera, 631 ruta) i `check-migration-policy` (118 migracija) prolaze; frontend
puni `npm test` 455/1788, `tsc -b`, `eslint .`, `prettier --check` i `npm run build` prolaze. Puni backend Jest nije
izvršiv u sandboxu (heap limit) i `prisma generate` je blokiran (nema mreže ka `binaries.prisma.sh`), pa je Prisma
client u sandboxu samo stub — oslonac za generisani klijent je CI.

## Registar nalaza

- Zatvoreni: `BA-problems-11`.
- Ostaju otvoreni: `BA-problems-12`–`19` i svi P1 nalazi modula (`BA-changes-02`–`07`,
  `BA-knowledge-base-01`–`04`, `BA-reports-01/02`, `BA-search-01`, vlasnik `WS-F`).
- Kontrolni zbir: source/plan **442** otvorenih / **252** zatvorenih / **694** ukupno (P1 174 = 101/73); ovaj
  registar **452/242**; Val 7 **31/109** (78 otvorenih: 13 P1 / 45 P2 / 20 P3); modul `problems` **11/19**
  (8 otvorenih: 0 P1 / 5 P2 / 3 P3).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene; nema novih ruta ni DTO polja. Deploy je čisto kodni. Promjena ponašanja je
namjerna i vidljiva: problem koji referencira `DRAFT` servis ili `STAFF_ONLY` incident tuđeg servisa više ne prikazuje
tu stavku korisniku koji je u matičnom domenu ne smije čitati (link ostaje u bazi, sakriven). Rollback: vraćanje
prethodnog releasea; nema podataka za čišćenje jer paket ne mijenja šemu. Ako je potreban povratak starog ponašanja
za vrijeme incidenta, dovoljno je vratiti `problem-cross-domain-visibility` pozive — nema migracije koju treba
poništavati.

## Sljedeći paket

**W7.30 — `BA-problems-12` (P2):** claim i general update moraju imati kanonski **globalni** audit red (ne samo
grupni/event zapis), sa istim actor/scope dokazom kao ostali moduli. Nije započet prije zelenog gatea za ovaj paket.
