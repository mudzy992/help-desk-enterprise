# Modul 15: `/admin/workflow` (pregled statusnog toka tiketa)

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, provjera backend guarda, provjera e2e i unit testova). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **WF** (workflow).

Provjere izvršene u sandboxu:
- **Čitanje u cijelosti:** `pages/workflow-page.tsx` (115), `components/workflow/workflow-diagram.tsx` (186), `components/workflow/workflow-transitions-table.tsx` (98), `components/workflow/workflow-parameters-card.tsx` (93), `components/workflow/workflow-actor-meta.ts` (11), `lib/workflow/layout-workflow-diagram.ts` (110), `lib/workflow/describe-workflow-guard.ts` (70), `services/workflow-api.ts` (59), `lib/tickets/ticket-constants.ts` (dio sa `allowedTicketStatusTransitions`).
- **Backend:** `backend/src/modules/tickets/workflow/ticket-workflow.controller.ts` (guard i dekorator uloga), `ticket-workflow-definition.ts` (lista prelaza, linije 33–77).
- **Testovi:** `lib/workflow/describe-workflow-guard.spec.ts`, `lib/workflow/layout-workflow-diagram.spec.ts`, `e2e/tests/15-workflow-unrouted-realtime.spec.ts` (test „status flow is read-only and admin-only“, klik na čvor filtrira tabelu), `e2e/tests/22-accessibility.spec.ts` (`/admin/workflow` u axe skenu).
- **Rutiranje:** `app/router.tsx` (~239–246, `RequireAccess` sa `canOpenAdminArea`), `lib/navigation.ts` (~119, `navigationAccessKinds.admin`).

---

## Modul

Stranica `/admin/workflow` prikazuje statusni tok tiketa ove instalacije: dijagram (faze kao kolone, statusi kao čvorovi, prelazi kao krive), tabelu prelaza sa akterima, okidačima i uslovima (guard), i karticu sa stvarnim parametrima koji ih podešavaju. Stranica je samo za čitanje (`editable: false`, naznaka „fixed notice“). Podaci dolaze sa `GET /workflow/ticket-status`.

---

## Povezani fajlovi i folderi

| Fajl | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/workflow-page.tsx` | Stranica: učitavanje, filter statusa, raspored | 115 |
| `frontend/src/components/workflow/workflow-diagram.tsx` | SVG dijagram, čvorovi kao dugmad | 186 |
| `frontend/src/components/workflow/workflow-transitions-table.tsx` | Tabela prelaza, filter, značke guardova | 98 |
| `frontend/src/components/workflow/workflow-parameters-card.tsx` | Kartica sa parametrima (dl) | 93 |
| `frontend/src/components/workflow/workflow-actor-meta.ts` | Boja po akteru (tokeni) | 11 |
| `frontend/src/lib/workflow/layout-workflow-diagram.ts` | Raspored čvorova i krive | 110 |
| `frontend/src/lib/workflow/describe-workflow-guard.ts` | Opis guarda sa živim parametrima | 70 |
| `frontend/src/services/workflow-api.ts` | Tipovi i poziv API-ja | 59 |
| `frontend/src/lib/tickets/ticket-constants.ts` | `allowedTicketStatusTransitions` (kopija grafa, vidi WF1) | 56–68 |
| `frontend/src/lib/tickets/ticket-actions.ts` | `nextTicketStatuses` (koristi kopiju) | 8 |
| `backend/src/modules/tickets/workflow/` | Izvor istine: definicija, servis, kontroler | — |
| `e2e/tests/15-workflow-unrouted-realtime.spec.ts` | E2E: read-only i samo admin | — |

---

## Trenutna implementacija

**Učitavanje.** `WorkflowPage` u jednom `useEffect` šalje dva zahtjeva: `getTicketWorkflow()` (obavezan) i `getTicketCounts()` (za brojače po statusu). Greška prvog prikazuje `ApiErrorText`, greška drugog se guta. Zastavica `active` sprječava postavljanje stanja nakon odmontiranja.

**Dijagram.** `layoutWorkflowNodes` postavlja čvorove po fazi (kolona `intake`, `work`, `done`) i redu (`orderInPhase`, tip `Record<TicketStatus, number>`, pa TypeScript traži sve statuse). `layoutWorkflowEdges` crta kvadratne krive koje se savijaju uvijek na lijevu stranu, pa se A→B i B→A ne preklapaju. Klik na čvor (ili Enter/Space) filtrira prelaze; prelazi koji ne pripadaju izabranom statusu se prigušuju (opacity 0.12).

**Tabela.** Filter `<select>` i tabela prelaza. Akteri su tačke u bojama tokena, okidači su tekst, a guardovi su značke. Opis guarda (`describeWorkflowGuard`) koristi stvarne parametre (npr. broj dana za reopen), a ako je guard isključen u instalaciji, značka dobija „isključeno“.

**Kartica parametara.** `<dl>` sa redovima (zatvaranje, obavezna polja, ponovno otvaranje, čekanje korisnika, odobrenja, arhiva, nerutirani tiketi). Ima link na podešavanja.

**Pristup.** Route: `RequireAccess` sa `canOpenAdminArea`. Navigacija: `navigationAccessKinds.admin`. Backend: `@RequireRoles(admin, superAdmin)` na `TicketWorkflowController`, uz `SessionAuthenticationGuard` i `RoleGuard`.

**Dobro urađeno.**
- Backend guard je na nivou kontrolera i uloga je eksplicitna.
- Tipovi guardova i okidača su unije (`WorkflowGuard`, `WorkflowTrigger`), a opis guarda ima šablonski tip ključa `workflow.guards.${WorkflowGuard}`, pa se greška u ključu vidi pri kompajliranju.
- Boje su iz tokena (`rgb(var(--primary))` itd.), pa radi u obje teme.
- Čvorovi dijagrama su `role="button"` sa `aria-pressed` i `aria-label`, reaguju na Enter i Space, a fokus-prsten je vidljiv (`group-focus-visible`).
- Tabela prelaza je tekstualna alternativa dijagramu, pa informacije nisu samo vizuelne.
- Kartica parametara koristi `<dl>` (semantika za parove naziv–vrijednost).
- Raspored ima `ScrollRegion` (horizontalni skrol na malim ekranima).
- Testovi: unit za `describeWorkflowGuard` i layout, e2e za read-only i filter, a11y scan u `22-accessibility`.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Izvor grafa prelaza | Backend definicija je „single source of truth“, ali frontend ima ručnu kopiju (`allowedTicketStatusTransitions`) koja se koristi za dugmad statusa na tiketu. Kopija se razlikuje od definicije (WF1). | Jedan izvor: frontend čita graf sa servera ili je generisan iz definicije. |
| Brojači statusa | Greška `getTicketCounts` se guta; dijagram ne prikazuje brojače bez objašnjenja (WF3) | Vidljiv indikator i pokušaj ponovo |
| Oznaka „isključeno“ | `playbook_steps` u režimu `warn` se prikazuje kao „isključeno“, iako je guard aktivan i samo pita (WF5) | Tri stanja: isključeno, upozorenje, blokada |
| Lokalizacija brojeva | `count.toLocaleString()` koristi jezik pregledača, ne jezik aplikacije (WF4) | `toLocaleString(i18n.language)` |
| Lokalizacija vrijednosti | Sastavljanje rečenica konkatenacijom (`${onOff(…)} · ${…}`) u kodu; vrijednost `unrouted.ownerRole` se prikazuje sirova (WF2) | Cijeli niz u prevodu, enum vrijednosti prevedene |
| Testovi komponenti | Nema komponentskih testova (pokriva ih e2e) | Test za značke guardova i kartice parametara |

---

## Gap analiza

1. **Dvije izvori istine za prelaze (WF1, visoka).** Backend `ticket-workflow-definition.ts` (koji navodi „single source of truth“) ima npr. `PENDING → PENDING_APPROVAL` (SYSTEM), `RESOLVED → IN_PROGRESS` i `CLOSED → IN_PROGRESS` (reopen, REQUESTER/STAFF), `CLOSED → ARCHIVED` (SYSTEM), `PENDING_APPROVAL → PENDING/CLOSED` (APPROVER). Frontend `allowedTicketStatusTransitions` nema `PENDING → PENDING_APPROVAL`, `PENDING_APPROVAL` je prazan, `RESOLVED` i `CLOSED` nemaju `IN_PROGRESS` (reopen se rješava posebno preko `canShowReopenAction`). Za STAFF akcije se poklapaju sa definicijom, osim reopena. Ipak, nema testa koji poredi dvije liste. Svaka nova tranzicija na backendu nije vidljiva na tiketu dok se ručno ne doda i na frontendu, a admin stranica i tiket mogu pokazivati različit tok. Popravka: frontend da čita graf iz `/workflow/ticket-status` ili da se generiše iz zajedničkog izvora, uz test parnosti.
2. **Greška brojača se guta (WF3, niska).** `.catch(() => undefined)` za `getTicketCounts`. Dijagram tada prikazuje čvorove bez brojača, bez poruke. Nema retry dugmeta ni za glavni zahtjev (samo `ApiErrorText`).
3. **Oznaka guarda u `warn` režimu (WF5, srednja).** `describeWorkflowGuard` za `playbook_steps` vraća `inactive: true` i kada je `requiredStepsOnResolve === "warn"`, pa se prikazuje „isključeno“. Komentar kaže „only `block` refuses the change; `warn` just asks“, pa je značka nekonzistentna sa tim: u `warn` režimu guard jeste aktivan (traži potvrdu). Admin može pogrešno zaključiti da je pravilo isključeno.
4. **Brojevi bez jezika aplikacije (WF4, niska).** `count.toLocaleString()` u `workflow-diagram.tsx` koristi jezik pregledača. U ostatku aplikacije datumi i brojevi prate `i18n.language`, pa se ovdje može pojaviti drugačiji format (npr. `1,234` vs `1.234`).
5. **Konkatenacija prevoda (WF2, srednja).** U `workflow-parameters-card.tsx` vrijednosti se sastavljaju u kodu: `` `${onOff(…)} · ${t(…)}: ${onOff(…)}` ``. Prevodilac ne može promijeniti redoslijed ni interpunkciju. Ispravno je da cijela rečenica bude u prevodu sa interpolacijom. Također, `unrouted.ownerRole` je sirova vrijednost (npr. „ADMIN“) bez prevoda.
6. **Duplirana logika „povezan čvor“ (WF8, niska).** `isRelated` (prelaz dodiruje izabrani status) i `dimmed` (čvor nema prelaz sa izabranim) su dvije implementacije istog pravila. Mogu se razići.
7. **Tipovi odgovora (WF7, niska).** `TicketWorkflowResponse.parameters.playbooks` je opcionalan (`playbooks?`), dok su ostali parametri `| null`. Ugovor nije ujednačen, a `describeWorkflowGuard` provjerava i `undefined` i `null`. Ime tipa `Parameters` u `describe-workflow-guard.ts` skriva globalni TypeScript tip `Parameters<T>`.
8. **Pristupačnost tabele (WF6, niska).** Zaglavlja `<th>` nemaju `scope="col"`, tabela nema `<caption>` (naslov je u kartici iznad).
9. **Prazno stanje filtera (WF9, niska).** Ako filter nema prelaza, tabela je prazna bez poruke. U trenutnoj definiciji svaki status ima bar jedan prelaz, pa je rizik mali, ali nije pokriven.
10. **Mrtav mali kod i komentari (WF10, niska).** `layoutWorkflowNodes` ima `orderInPhase[status] ?? 0` iako je mapa tipizovana kao kompletna (fallback je mrtav). Komentari sa oznakama plana: „Paket 1.7 (W1/W2/W3)“, „Package 1.7 (W1)“ u backendu, „Paket 1.4 (P5)“.

**Što je dobro:** uloge na backendu i frontendu su usklađene; tipovi za guard i okidač su unije sa šablonskim ključevima (kompajler provjerava); boje iz tokena; čvorovi su dostupni tastaturom; tabela je tekstualna alternativa; kartica parametara koristi `<dl>`; e2e i unit testovi pokrivaju glavni tok.

---

## Mišljenje tima i preporuka

Modul je dobro zamišljen i urađen kao čitljiv pregled. Glavni problem je duplikat grafa prelaza (WF1): stranica koja se zove „tok statusa“ mora da bude jedini izvor istine, a sada je ručna kopija na tiketu. Ovo je srednje ozbiljno, ali je tiho: nema greške na ekranu, samo razlika u ponašanju. Popravka je mala: frontend čita graf sa servera (endpoint već postoji), a `allowedTicketStatusTransitions` se briše ili generiše.

Preporuka redom:
1. WF1: frontend tok čita sa `/workflow/ticket-status`, a `allowedTicketStatusTransitions` postaje izvedena vrijednost. Dok to nije urađeno, dodati test parnosti sa definicijom iz backenda (ili generisanje iz zajedničkog JSON-a).
2. WF5: `warn` treba prikazati kao poseban status („upozorenje“), a ne „isključeno“.
3. WF2: cijele rečenice u prevodima; enum vrijednosti prevesti.
4. WF3, WF4: vidljiva greška brojača sa retry-em; `toLocaleString(i18n.language)`.
5. WF6, WF8, WF7, WF9, WF10: čišćenje.

---

## Bugovi i neusklađenosti

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| WF1 | Srednja | Frontend kopija grafa prelaza (`allowedTicketStatusTransitions`) se ne poklapa sa backend definicijom (reopen, SYSTEM i APPROVER prelazi); nema testa parnosti. Admin stranica i tiket mogu prikazivati različit tok. | `lib/tickets/ticket-constants.ts:56–68`, `lib/tickets/ticket-actions.ts`, `backend/.../ticket-workflow-definition.ts` |
| WF2 | Srednja | Rečenice sastavljene konkatenacijom u kodu; `unrouted.ownerRole` prikazan sirov. | `components/workflow/workflow-parameters-card.tsx` |
| WF3 | Niska | Greška `getTicketCounts` se guta; nema indikatora ni retry-a. | `pages/workflow-page.tsx` |
| WF4 | Niska | `count.toLocaleString()` bez jezika aplikacije. | `components/workflow/workflow-diagram.tsx` |
| WF5 | Srednja | `playbook_steps` u režimu `warn` prikazan kao „isključeno“. | `lib/workflow/describe-workflow-guard.ts` |
| WF6 | Niska (a11y) | `<th>` bez `scope`, tabela bez `<caption>`. | `components/workflow/workflow-transitions-table.tsx` |
| WF7 | Niska | `playbooks?` opcionalan dok ostali parametri imaju `null`; tip `Parameters` skriva globalni. | `services/workflow-api.ts`, `lib/workflow/describe-workflow-guard.ts` |
| WF8 | Niska | Dvije implementacije pravila „povezan čvor“. | `components/workflow/workflow-diagram.tsx` |
| WF9 | Niska | Prazna tabela bez poruke kad filter nema rezultata. | `components/workflow/workflow-transitions-table.tsx` |
| WF10 | Niska | Mrtav fallback `?? 0`; oznake plana u komentarima. | `lib/workflow/layout-workflow-diagram.ts`, `pages/workflow-page.tsx` |

---

## Ocjena: 7/10

Obrazloženje:
- **Plus:** čista stranica sa jasnom namjerom (samo čitanje), dobra pristupačnost dijagrama i tabele, tipovi guardova, uloge usklađene na obje strane, boje iz tokena, unit i e2e testovi, a11y skeniranje.
- **Minus:** dvostruki izvor istine za prelaze (WF1) je arhitektonski rizik; „warn“ prikazan kao „isključeno“ (WF5) može zavesti admina; sastavljanje prevoda u kodu (WF2).
- Ocjena je iznad prosjeka do sada jer je stranica mala, dobro ograničena i pokrivena testovima, a problemi su lokalizovani.

---

## Must-Have kandidati (modul 15)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **WF1:** frontend graf prelaza iz `/workflow/ticket-status` (ili generisan iz zajedničkog izvora), uz test parnosti dok se ne uradi jedno od toga.
2. **WF5:** tri stanja guarda (isključeno, upozorenje, blokada); ispraviti oznaku za `playbook_steps` u `warn` režimu.
3. **WF2:** cijele rečenice u prevodima; prevedene vrijednosti enuma (`ownerRole`).
4. **WF3:** vidljiva greška brojača i retry za glavni zahtjev.
5. **WF4, WF6, WF7, WF8, WF9, WF10:** lokalizacija brojeva, `scope="col"`, ujednačen tip parametara, jedno pravilo za povezan čvor, poruka za prazan filter, čišćenje komentara i mrtvog koda.

---

## Status ispravki (2026-10-13)

Nijedna ispravka u ovom modulu nije urađena. Pravilo iz sesije: ispravke se rade tek nakon završetka auditnog ciklusa i potvrde obima.
