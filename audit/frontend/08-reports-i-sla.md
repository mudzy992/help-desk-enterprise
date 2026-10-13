# Modul 8: Izvještaji i SLA

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, grep, provjera backend zaštite). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **RS** (izvještaji i SLA). Ovo se ne miješa sa R (modul 6), S (modul 5) i KB (modul 7).

Provjere izvršene u sandboxu:
- Čitanje u cijelosti: `pages/reports-page.tsx` (414), `pages/sla-page.tsx` (215), `lib/sla/use-sla-page-data.ts` (125), `lib/sla/use-sla-page-mutations.ts` (90), `lib/reports/report-window.ts` (134), `lib/reports/report-schedule-form.ts` (54), `components/reports/print/report-print.tsx` (66), `components/reports/reports-date-filter.tsx` (87, dio), `components/reports/reports-csat-panel.tsx` (dio), `components/reports/reports-bottlenecks-panel.tsx` (50–100), `components/reports/report-packs-panel.tsx` (43–130), `components/sla/sla-compliance-card.tsx` (1–60), `components/sla/sla-profile-list.tsx`, `components/sla/sla-escalation-rules-panel.tsx` (36–100), `components/reports/schedules/report-schedules-panel.tsx` (69–180).
- Čitanje dijelova: `components/reports/trends/report-trends-panel.tsx` (104–200, 296–372, 706–716), `components/reports/schedules/report-schedule-sheet.tsx` (145–160), `lib/reports/report-trends-view.ts` (1–130), `lib/reports/csat-view.ts` (25–49), `lib/reports/report-format.ts` (28–36).
- Backend: zaštita kontrolera `reports/*.controller.ts` i `sla/*.controller.ts` (klasni dekoratori `@UseGuards`, `@RequireRoles`, `@RequirePermissions`), `authorize-http-execution.ts`, `tickets/csat/tickets-csat-summary.controller.ts` (37–41), `tickets/csat/aggregate-ticket-csat.ts` (40–62).
- Frontend dozvole: `lib/session/route-access.ts` (`canOpenReports` 57–, `canOpenSla` 136–138).
- Metrike (grep, 66 fajlova, oko 9.200 linija): `useState` 163, `useEffect` 42, `as never` 10, `eslint-disable` 1, tihi `catch` 7, `setTimeout` 1, komentari sa oznakama plana 36, `window.print` 1, `aria-live`/`role=status|alert` 9.
- E2E: `12-reports-packs`, `17-reports-trends`, `18-reports-schedules`, `19-reports-print`, `07-sla`, `42-catalog-sla-routing-ux`, `22-accessibility` (dodiruje oba modula).
- Unit testovi: 15 spec fajlova u `lib/reports/` i `lib/sla/` i `services/sla-api.spec.ts`. Backend: 26 testova za reports.
- **Nije pokrenut pregledač.** Nalazi označeni „za provjeru“ treba potvrditi u pregledaču.
- **Nije pročitano u punom obimu:** `components/reports/trends/report-trends-panel.tsx` (200–296, 372–706, 716–762), `components/reports/reports-charts.tsx` (158), `components/reports/reports-metric-grid.tsx` (132), `components/reports/schedules/report-schedules-panel.tsx` (180–491), `components/reports/schedules/report-schedule-sheet.tsx` (1–145, 160–454), `components/reports/reports-bottlenecks-panel.tsx` (100–211), `components/reports/report-packs-panel.tsx` (130–281), `components/sla/priority-matrix-panel.tsx` (206), `components/sla/sla-calendars-panel.tsx` (246), `components/sla/sla-calendar-form.tsx` (239), `components/sla/sla-rule-form.tsx` (178), `components/sla/sla-escalation-rule-form.tsx` (125), `components/sla/sla-profile-detail*.tsx`, `components/sla/sla-override-rules-card.tsx`, `lib/reports/map-report-dashboard-charts.ts` (120), `lib/reports/bottleneck-view.ts` (90), `lib/sla/sla-exposure-index.ts` (49), `services/sla-api.ts` (222), `services/sla-types.ts` (156), `services/reports-api.ts` (110), `services/report-trends-api.ts` (148), `services/report-schedules-api.ts` (138), `services/report-packs-api.ts` (100), `services/report-summary-api.ts` (80). Van ovog obima: `components/dashboard/dashboard-sla-watchlist.tsx`, `components/tickets/ticket-sla-panel.tsx` (pripadaju modulima 3 i 4).

---

## Modul

Modul ima dva velika dijela:

- **Izvještaji (`/reports`)** su pet tabova (pregled, uska grla, CSAT, trendovi, paketi) i šesti tab za zakazane izvještaje za administratore. Pregled čita dashboard za odabranu organizacionu jedinicu i period. Trendovi imaju filtere u URL-u, šest grafikona, izvoz CSV/JSON i štampu. Paketi su tabele sa pregledom i izvozom. Zakazivanje šalje izvještaj e-poštom po rasporedu.
- **SLA (`/sla`)** je administracija SLA profila, kalendara radnog vremena, matrice prioriteta, pravila i pravila eskalacije. Tab usklađenosti prikazuje rezultate po organizacionoj jedinici.

Granica modula: `pages/reports-page.tsx`, `pages/sla-page.tsx`, `components/reports/` (uključujući `trends/`, `schedules/`, `print/`), `components/sla/` (22), `lib/reports/`, `lib/sla/`, `services/sla-*.ts`, `services/report-*.ts`, `services/reports-api.ts`.

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/reports-page.tsx` | Stranica izvještaja, tabovi, period, organizaciona jedinica | 414 |
| `frontend/src/pages/sla-page.tsx` | Stranica SLA, profili, kalendari, matrica, usklađenost | 215 |
| `frontend/src/components/reports/trends/report-trends-panel.tsx` | Trendovi, grafikovi, izvoz, štampa | 762 |
| `frontend/src/components/reports/schedules/` (3) | Lista zakazanih izvještaja, forma, pokretanje | 491 + 454 + ostalo |
| `frontend/src/components/reports/reports-csat-panel.tsx` | CSAT tab | 158 |
| `frontend/src/components/reports/reports-bottlenecks-panel.tsx` | Uska grla | 211 |
| `frontend/src/components/reports/report-packs-panel.tsx` | Paketi, pregled, izvoz | 281 |
| `frontend/src/components/reports/print/report-print.tsx` | Svjetla tema za štampu, zaglavlje | 66 |
| `frontend/src/components/sla/` (22) | Profili, kalendari, matrica, pravila, eskalacije, usklađenost | oko 3.300 |
| `frontend/src/lib/reports/report-window.ts` | Periodi (15d, 30d, 6m, 12m, custom) | 134 |
| `frontend/src/lib/reports/report-trends-view.ts` | Parsiranje i pisanje URL stanja trendova | 232 |
| `frontend/src/lib/reports/report-schedule-form.ts` | Validacija zakazivanja, pregled sljedećeg slanja | 54 |
| `frontend/src/lib/sla/use-sla-page-data.ts` | Učitavanje svih podataka SLA stranice | 125 |
| `frontend/src/lib/sla/use-sla-page-mutations.ts` | Snimanje i brisanje profila i pravila | 90 |
| `frontend/src/services/sla-api.ts` | HTTP za SLA | 222 |
| `frontend/src/services/report-*.ts`, `reports-api.ts` | HTTP za izvještaje, paketa, zakazivanje, trendove | 80–148 |
| `backend/src/modules/reports/` | Kontroleri i servisi izvještaja | — |
| `backend/src/modules/sla/` | Kontroleri i servisi SLA | — |
| `backend/src/modules/tickets/csat/` | CSAT agregacija (koristi tab izvještaja) | — |
| `e2e/tests/12, 17, 18, 19, 07, 42` | E2E za pakete, trendove, zakazivanje, štampu, SLA | 8 testova |

---

## Trenutna implementacija

**Pregled izvještaja.** `ReportsPage` drži organizacionu jedinicu, period i tab. Tab se čita iz URL-a (`?tab=`), a trendovi imaju sopstveno URL stanje (`parseTrendsSearch` / `toTrendsSearch`). Pregled učitava dashboard kad je tab „overview“. Ostali paneli dobijaju `from`, `to` i jedinicu kao props i sami učitavaju podatke.

**Trendovi.** `ReportTrendsPanel` gradi upit iz stanja, učitava ga u `useEffect` sa `cancelled` zaštitom i prikazuje grafikone. Parsiranje URL-a je pažljivo: vrijednosti se provjeravaju kroz liste dozvoljenih, datumi regexom, a dužina teksta je ograničena na 64 znaka.

**Zakazivanje.** Forma je u `report-schedule-sheet.tsx`. Validacija je u čistoj funkciji `validateReportScheduleForm`, sa unit testovima. Pretraga primalaca je sa debounce od 250 ms i zaštitom od zastarjelih odgovora. Lista se učitava jednom i mijenja se lokalno (`replace`).

**SLA stranica.** `useSlaPageData` učitava profile, kalendare, sažetak, usklađenost, a za izabrani profil pravila i promjene. Mutacije su u `useSlaPageMutations`, koji nakon svake promjene zove `data.load()`. Pregled eskalacija (`sla-escalation-rules-panel.tsx`) ima sopstveno učitavanje.

**Dozvole.** `canOpenReports` traži admin područje i `reportsExport` ili `auditExport`. Backend `reports.controller.ts` ima isti uslov na nivou klase (`@RequireRoles(admin, superAdmin)` i `@RequirePermissions(reportsExport, auditExport)`). SLA kontroleri imaju `@RequireRoles(admin)` na nivou klase, a pisanje dodatno traži `slaWrite`. Zakazivanje ima `reportsScheduleManage`. Frontend i backend se poklapaju.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Učitavanje SLA stranice | Svaki klik na profil ponovo učitava svih 5–6 izvora podataka i prikazuje skeleton (RS1) | Učitavaju se samo podaci koji su se promijenili |
| Greška vs. prazno | Greška organizacionih jedinica prikazuje „nema tiketa“ (RS2) | Greška se uvijek prikazuje kao greška |
| Zastarjeli podaci | Pri promjeni filtera stari podaci ostaju bez indikatora (RS4) | Indikator učitavanja ili reset kad se scope promijeni |
| Race | Pregled, uska grla, SLA učitavanje i pravila eskalacija nemaju zaštitu od zastarjelih odgovora (RS5) | Isti obrazac kao trendovi (`cancelled`) |
| CSAT | Prikazuje sveukupni CSAT bez perioda i bez filtera jedinice, bez oznake (RS3) | Period i jedinica kao na ostalim tabovima, ili jasna oznaka „sveukupno“ |
| Stanje u URL-u | Trendovi su u URL-u. Pregled, paketi, uska grla i SLA pod-prikazi nisu (RS13) | Dijeljiv link za svaki prikaz |
| Vremenska zona | Period i pregled sljedećeg slanja koriste lokalnu zonu pregledača, raspored ima sopstvenu zonu (RS7) | Jedna zona, prikazana korisniku |
| Greške u formama | Poruke grešaka nisu sve `role="alert"` i prijavljuju tip `as never` (RS11, RS14) | Ista komponenta greške svuda, tipizirani ključevi |
| Testovi | Lib sloj dobro pokriven (15 spec fajlova), e2e za trendove, zakazivanje, štampu. Nema testa za `useSlaPageData`, `ReportsPage`, `SlaPage`, eskalacije (RS17) | Hook testovi za race i učitavanje |

---

## Gap analiza

1. **SLA učitavanje na svaki klik (RS1).** `load` u `use-sla-page-data.ts` (57–100) zavisi od `selectedId` i `isCreating`. Efekat (102–104) ga poziva pri svakoj promjeni. Pošto `setSelectedId` mijenja `selectedId`, svaki klik na profil pokreće sve zahtjeve. `isLoading` se postavlja na `true`, pa `SlaAdminListColumn` (`sla-admin-selector.tsx` 111–112) zamijeni listu skeletonom. Usput, `fetchSlaCompliance` se šalje i kad je aktivan tab profila, a njegova greška obara cijeli `Promise.all`, pa ni lista profila ne prikaže podatke.
2. **Greška koja izgleda kao prazno stanje (RS2).** U `reports-page.tsx` `listOrganizationalUnitTree().catch(() => setOrganizationalUnitId(null))` (116–120) ne postavlja grešku. `reload` (160–165) za `null` samo postavi `dashboard` na `null` bez `errorKey`. Uslov na 375 (`dashboard === null || ticketCount === 0`) prikazuje „nema tiketa“. Korisnik ne zna da li su podaci nedostupni ili ih nema.
3. **CSAT bez perioda i jedinice (RS3).** `fetchTicketCsatSummary()` nema parametre (`tickets-csat-api.ts` 27–29). Backend `summarize` prima samo kontekst korisnika (`tickets-csat-summary.controller.ts` 37–41), bez vremenskog prozora. Tab CSAT nema `ReportsDateFilter` (`reports-page.tsx` 302). Prikaz je sveukupan, a podnaslov ne kaže to.
4. **Zastarjeli podaci pri promjeni filtera (RS4).** Tri mjesta prikazuju stare podatke sa novim naslovom ili filterom, bez indikatora: `report-trends-panel.tsx` (344: skeleton samo kad je `trends === null`), `sla-compliance-card.tsx` (42–50: `compliance === null` je jedini uslov za loader, a naslov obima se mijenja odmah pri promjeni jedinice) i `reports-bottlenecks-panel.tsx` (84: isto).
5. **Race bez zaštite (RS5).** Četiri mjesta nemaju `cancelled`: `reports-page.tsx` `reload` (160–187), `reports-bottlenecks-panel.tsx` `load` (54–82), `use-sla-page-data.ts` `load` (57–100) i `sla-escalation-rules-panel.tsx` (38–45). Poslednji ima i `.then` bez `.catch`, pa je greška neuhvaćena, a pri brzoj promjeni profila lista može pokazivati pravila prethodnog profila.
6. **Zakazani rad nakon kreiranja profila (RS6, za provjeru).** `saveProfile` (`use-sla-page-mutations.ts` 29–34) za novi profil zove `setSelectedId(created.id)` pa `await data.load()`. `data.load` je iz renderovanja u kojem je `isCreating` još `true`, pa se u zastarjelom zatvaranju vraća rano (`use-sla-page-data.ts` 77–81). Istovremeno efekat pokreće drugo učitavanje. Ishod zavisi od redoslijeda odgovora. Potrebno je provjeriti u pregledaču da li se pravila i promjene nakon kreiranja prikazuju odmah.
7. **Vremenska zona (RS7).** `previewNextReportRun` (`report-schedule-form.ts` 42–54) računa sljedeće slanje u lokalnoj zoni pregledača (`getDay`, `new Date(y, m, d, h, min)`), dok raspored ima `list.settings.timeZone` (`report-schedule-sheet.tsx` 216). Komentar kaže „same zone in practice“. Za Bosnu i Hercegovinu to obično radi, ali pretpostavka nije provjerena. Isto važi za trendove: period se računa u lokalnim datumima (`toDateInputValue`), a zona podataka je `trends.timeZone`, pa štampani period može da se ne poklapa sa podacima.
8. **Prazan skeleton bez izlaza (RS8).** `report-packs-panel.tsx`: kad je `organizationalUnitId === null`, efekat (55–57) se vrati bez postavljanja `list`, a uslov na 115–116 (`list === null`) prikazuje skeleton zauvijek.
9. **Brisanje eskalacije bez poruke (RS9).** `handleDelete` (70–71) vraća se bez ikakvog znaka kad je razlog prazan. Dugme u tabeli izgleda aktivno, a klik ne radi ništa.
10. **Nedosljedna pravila za brisanje.** Pravila eskalacije i kalendari traže razlog. Zakazani izvještaj (`report-schedules-panel.tsx` 164–177) se briše samo potvrdom, bez razloga. Nije jasno da li je to namjera.
11. **Testovi (RS17).** Lib sloj je dobro pokriven. Nema testova za hookove sa učitavanjem (race, reset), za `SlaPage` i `ReportsPage`. E2E za eskalacije nema.

---

## Mišljenje tima i preporuka

Modul je dobro strukturisan u sloju čistih funkcija: URL stanje trendova, validacija zakazivanja, periodi, mapiranje grešaka i dozvole su odvojeni i testirani. Backend je zaštićen na nivou kontrolera i frontend dozvole se poklapaju sa njim. Glavni problemi su u komponentama i hookovima: učitavanje se radi na način koji se ne prilagođava promjenama (RS1, RS4, RS5), greške se pretvaraju u prazna stanja (RS2, RS8), i CSAT nije usklađen sa ostalim tabovima (RS3).

Preporuka po redu:

1. **Zajednički obrazac učitavanja (RS4, RS5).** Isti obrazac kao u `use-docs.ts` (`active` flag, `loading`, `error`, `reload`), plus pravilo: pri promjeni ulaza prikazati loader ili označiti podatke kao zastarjele. Uvesti za pregled, uska grla, usklađenost, eskalacije.
2. **SLA: odvojiti učitavanje (RS1).** `load` ne smije zavisiti od `selectedId`. Pri izboru profila učitavaju se samo pravila i promjene za taj profil. Usklađenost se učitava tek kad je aktivan njen tab, a njena greška ne smije obarati listu profila.
3. **Greške umjesto praznih stanja (RS2, RS8).** Ako organizaciona jedinica ne može da se učita, prikazati grešku sa dugmetom za ponovni pokušaj.
4. **CSAT: odluka o obimu.** Ili dodati period i jedinicu na backend (`summarize` sa prozorom), ili na tabu jasno napisati „sveukupno, od početka“. Ovo je odluka proizvoda, ne samo ispravka.
5. **Vremenska zona (RS7).** Odluka: koju zonu koristi izvještaj (zona organizacije ili zona pregledača). Onda uskladiti pregled sljedećeg slanja i periode.
6. **Testovi.** Hook testovi za `useSlaPageData` (izbor profila, kreiranje, race) i e2e za eskalacije.

---

## Otkriveni bugovi i neusklađenosti

| ID | Ozbiljnost | Fajl i linija | Opis |
|---|---|---|---|
| RS1 | Srednja | `lib/sla/use-sla-page-data.ts` 57–104; `components/sla/sla-admin-selector.tsx` 111–112 | `load` zavisi od `selectedId` i `isCreating`, pa svaki izbor profila pokrene 5–6 zahtjeva i postavi `isLoading`. Lista profila se zamijeni skeletonom. **Potvrđeno čitanjem.** |
| RS2 | Srednja | `pages/reports-page.tsx` 116–120, 160–165, 375 | Greška učitavanja organizacionih jedinica ne postavlja `errorKey`. Prikazuje se „nema tiketa“. **Potvrđeno čitanjem.** |
| RS3 | Srednja | `services/tickets-csat-api.ts` 27–29; `backend/.../tickets-csat-summary.controller.ts` 37–41; `pages/reports-page.tsx` 332–333 | CSAT tab prikazuje sveukupne podatke bez perioda i jedinice. Nema filtera i nema oznake. **Potvrđeno u frontendu i backendu.** |
| RS4 | Srednja | `components/reports/trends/report-trends-panel.tsx` 344; `components/sla/sla-compliance-card.tsx` 42–50; `components/reports/reports-bottlenecks-panel.tsx` 84 | Pri promjeni filtera ili jedinice stari podaci ostaju vidljivi bez loadera. Naslov obima se mijenja odmah. **Potvrđeno čitanjem. Za provjeru u pregledaču.** |
| RS5 | Srednja | `components/sla/sla-escalation-rules-panel.tsx` 38–45; `reports-page.tsx` 160–187; `reports-bottlenecks-panel.tsx` 54–82; `use-sla-page-data.ts` 57–100 | Nema zaštite od zastarjelih odgovora. Eskalacije imaju `.then` bez `.catch`, pa je greška neuhvaćena. Pri brzoj promjeni profila može se prikazati pogrešan profil. **Potvrđeno čitanjem. Za provjeru.** |
| RS6 | Srednja (za provjeru) | `lib/sla/use-sla-page-mutations.ts` 29–34; `lib/sla/use-sla-page-data.ts` 77–81 | Nakon kreiranja profila, `data.load` iz zastarjelog zatvaranja vraća se rano, a efekat pokreće drugo učitavanje. Pravila mogu ostati prazna. **Za provjeru u pregledaču.** |
| RS7 | Niska (dizajn) | `lib/reports/report-schedule-form.ts` 42–54; `lib/reports/report-window.ts` 10–32, 123–134; `components/reports/schedules/report-schedule-sheet.tsx` 216 | Lokalna zona pregledača se koristi za preview i periode, a raspored i podaci imaju zonu organizacije. Pretpostavka „same zone in practice“ nije provjerena. |
| RS8 | Niska | `components/reports/report-packs-panel.tsx` 55–57, 115–116 | Bez organizacione jedinice, panel paketa ostaje u skeletonu zauvijek. |
| RS9 | Niska | `components/sla/sla-escalation-rules-panel.tsx` 70–71 | Brisanje bez razloga je tiho bez poruke. Razlog se šalje netrimovan (75). |
| RS10 | Niska (odluka) | `components/reports/schedules/report-schedules-panel.tsx` 164–177 | Brisanje zakazanog izvještaja nema razlog, a kalendari i eskalacije ga traže. |
| RS11 | Niska (TS) | `components/sla/sla-rule-form.tsx` 170; `sla-calendar-form.tsx` 215; `sla-profile-form.tsx` 71; `sla-page.tsx` 172; `reports-page.tsx` 232; `report-trends-panel.tsx` 298; `report-schedule-form.ts` 44 | Deset pojava `as never` za prevodne ključeve, plus neprovjereni castovi za select vrijednosti i ključeve. |
| RS12 | Niska (UX) | `pages/sla-page.tsx` 152–157 i 188 | Dugme „Novi profil“ postoji u zaglavlju i u listi (`onNew`). Dupliran CTA. |
| RS13 | Niska | `pages/reports-page.tsx` 115, 92–94; `pages/sla-page.tsx` 53–54 | Jedinica se čita iz `window.location.search` pri mountu, a ne iz routera. Period, pregled i SLA pod-prikazi nisu u URL-u, pa se ne mogu dijeliti. |
| RS14 | Niska (a11y) | `components/sla/sla-rule-form.tsx` 170; `sla-profile-form.tsx` 71; `report-packs-panel.tsx` 113 | Poruke grešaka nisu `role="alert"` (kalendarska forma jeste). Greška liste paketa ne prikazuje `requestId`. |
| RS15 | Niska (humanizacija) | `components/reports/trends/report-trends-panel.tsx` 320, 328 | Oznake „CSV“ i „JSON“ su tvrdo kodirane, nisu prevedene. |
| RS16 | Niska (drift) | `lib/reports/report-trends-view.ts` 31–33, 77 | Klijent ponavlja konstante backend-a (`trendBucketLimits`, formula za sedmice). Komentar kaže „Mirrors backend“. Ako se backend promijeni, nema testa koji to hvata. **Za provjeru.** |
| RS17 | Srednja (testovi) | `lib/sla/`, `components/sla/`, `pages/reports-page.tsx`, `pages/sla-page.tsx` | Nema testova za hookove sa učitavanjem (RS1, RS4, RS5, RS6). E2E za eskalacije nema. |
| RS18 | Niska (React) | `components/reports/report-packs-panel.tsx` 70–74; `components/reports/schedules/report-schedules-panel.tsx` 95–101 | `useEffect` koji resetuje stanje pri promjeni zavisnosti. Panel rasporeda ima `onDraftConsumed` kao inline funkciju iz roditelja, pa se efekat ponovo pokreće pri svakom renderu. |
| RS19 | Niska | `lib/reports/report-window.ts` 59–68, 113–116 | Prazan „custom“ period pada na 30 dana bez poruke, dok su datumska polja prazna. Obrnut raspon se tiho zamijeni. |
| RS20 | Niska (React) | `components/reports/trends/report-trends-panel.tsx` 160 | Jedini `eslint-disable-next-line react-hooks/exhaustive-deps` u modulu. Može se zamijeniti stabilnim ključem bez isključivanja pravila. |
| RS21 | Niska | `components/reports/schedules/report-schedules-panel.tsx` 179–180 | Greška učitavanja rasporeda nema dugme za ponovni pokušaj. |
| RS22 | Niska | `components/reports/schedules/report-schedule-sheet.tsx` 152–153 | Greška pretrage primalaca se tiho pretvara u prazan spisak. |
| RS23 | Niska (humanizacija) | `pages/sla-page.tsx` 59; `lib/sla/use-sla-page-data.ts` 29–30; `components/reports/trends/report-trends-panel.tsx` 105–109; `lib/reports/report-trends-view.ts` 12–14; `components/reports/reports-csat-panel.tsx` 17–23 | Komentari sa oznakama plana („Paket 2.5“, „Phase 2.4“, „Val 1 (M9/B3)“). Ukupno 36 pojava u modulu. |

**Pozitivno (ne mijenjati):**
- `report-trends-view.ts` (94–121): URL stanje trendova provjerava liste dozvoljenih vrijednosti, datume regexom, `from <= to` i dužinu teksta.
- `report-trends-panel.tsx` (136–161): `cancelled` zaštita i zadržani filteri kad je učitavanje palo.
- `report-print.tsx` (10–35): svjetla tema za štampu vraća prethodnu temu i čisti listenere pri unmount-u.
- `report-schedule-sheet.tsx` (147–159): pretraga primalaca sa debounce, `cancelled` i `clearTimeout`.
- `report-schedule-form.ts`: validacija je čista funkcija sa unit testovima.
- `report-packs-panel.tsx` (75–78): pregled se briše kad se promijeni paket, jedinica ili period, pa je na ekranu uvijek ono što bi se preuzelo.
- `aggregate-ticket-csat.ts` (40–62): backend pravi bucket samo kad postoji bar jedna ocjena, pa prosjek nikad nije lažna 0.
- Zaštita backend-a: svi kontroleri imaju `RoleGuard` na nivou klase, a pisanje ima posebnu dozvolu. Frontend `canOpenReports` i `canOpenSla` se poklapaju sa njom.

---

## Ocjena: 6/10

Obrazloženje:
- **Plus:** čisti sloj biblioteka sa testovima, dobro URL stanje za trendove, pažljivo parsiranje, zaštita backend-a usklađena sa frontendom, dobra štampa i paketi.
- **Minus:** SLA stranica se ponovo učitava na svaki klik (RS1), greške se prikazuju kao prazna stanja (RS2, RS8), stari podaci bez indikatora (RS4), race bez zaštite na četiri mjesta (RS5), CSAT je nejasno sveukupan (RS3), a hookovi nisu testirani (RS17).

Ocjena je u skladu sa modulima 5, 6 i 7.

---

## Must-Have kandidati (modul 8)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **RS2 i RS8:** greška organizacionih jedinica i prazan skeleton paketa prikazuju poruku sa dugmetom za ponovni pokušaj.
2. **RS5:** `cancelled` zaštita i `.catch` za eskalacije, pregled, uska grla i SLA učitavanje.
3. **RS1:** SLA `load` odvojiti od izbora profila. Učitavati samo podatke za izabrani profil, a usklađenost tek na njenom tabu.
4. **RS3:** odluka o CSAT obimu (period i jedinica, ili jasna oznaka „sveukupno“).
5. **RS4:** indikator učitavanja ili reset pri promjeni filtera u trendovima, usklađenosti i uskim grlima.
6. **RS6:** provjeriti u pregledaču tok kreiranja profila SLA. Ako je bug potvrđen, dodati hook test.
7. **RS7:** odluka koja zona važi za izvještaje i raspored (zona organizacije ili pregledača).
8. **RS17:** hook testovi za `useSlaPageData` (izbor, kreiranje, race) i e2e za eskalacije.
