# Modul 9: On-call i obavještenja

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda, grep, provjera backend guardova i e2e pokrivenosti). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **O** (on-call) i **OB** (obavještenja). Ovo se ne miješa sa RS (modul 8), KB (modul 7), R (modul 6) i S (modul 5).

Provjere izvršene u sandboxu:
- Čitanje u cijelosti: `pages/on-call-page.tsx` (539), `lib/on-call/on-call-view.ts` (200), `components/on-call/on-call-range-dialog.tsx` (134), `components/on-call/on-call-schedule-dialog.tsx` (271), `components/on-call/on-call-calendar.tsx` (79), `components/on-call/on-call-calendar-feed-card.tsx` (146), `components/on-call/on-call-header-indicator.tsx` (63), `components/on-call/on-call-reason-dialog.tsx` (57), `pages/announcements-page.tsx` (425), `components/announcements/announcements-host.tsx` (260), `components/announcements/announcement-editor-dialog.tsx` (453), `components/announcements/announcement-report-dialog.tsx` (236), `lib/announcements/announcement-view.ts` (128), `services/on-call-api.ts` (182), `services/announcements-api.ts` (229).
- Čitanje dijelova: `components/ui/confirm-dialog.tsx` (1–67), `layouts/application-shell.tsx` (85–101, mjesto montiranja `AnnouncementsHost` i `key={location.pathname}`), `lib/a11y/announcer.ts` (1–40).
- Backend: `on-call.controller.ts` (guardovi po ruti), `on-call.service.ts` (`assertTimeZone` 66–75), `announcements.controller.ts` (rute, bez dekoratora dozvola), `announcements.service.ts` (`requireManage` 146–149), `announcement-viewer.ts` (`canManageAll`, `canReadReports`).
- Pretraga: `any`, `as never`, `as unknown`, `eslint-disable`, `console` u modulu: jedan pogodak (`on-call-page.tsx` 280). Komentari sa oznakama plana (Paket, §, K2, K3): 22 pogotka.
- Upotreba globalnog announcera (`lib/a11y/announcer.ts`): koriste ga tiketi, shortcuts i route-focus, ali ne moduli 9.
- E2E: `44-on-call-schedule.spec.ts` (167 linija, 2 testa), `45-announcements-lifecycle.spec.ts` (126 linija, 1 test).
- Unit testovi: `lib/on-call/on-call-view.spec.ts` (8 testova), `lib/announcements/announcement-view.spec.ts`, `lib/a11y/announcer.spec.ts`.
- **Nije pokrenut pregledač.** Nalazi označeni „za provjeru“ treba potvrditi u pregledaču, a zone treba provjeriti sa dvije različite zone pregledača i rasporeda.
- **Nije pročitano u punom obimu:** `services/announcements-api.ts` (ostatak tipova), `components/ui/toast.tsx` (provjera `role` za obavijesti), backend `announcements.service.ts` za izvještaje (`canReadReports`, scope jedinice) i `on-call.service.ts` za provjeru da li swap prihvat/odbijanje ima servisnu provjeru učesnika (van obima ovog koraka).

---

## Modul

Modul ima dva dijela koja dijele jedan dizajn jezik, ali imaju različite rizike:

- **On-call (`/on-call`)** prikazuje ko je dežuran, nedjeljni raspored sa četiri sedmice, rotacije, zamjene (swap) i ručna preklapanja (override). Admin može da uređuje raspored, a korisnik traži zamjenu i upravlja ICS pretplatom na kalendar (`/account/notifications`). Zaglavlje prikazuje indikator „Dežuran do 08:00“ (`OnCallHeaderIndicator`).
- **Obavještenja** imaju tri površine: banner i modal koji se prikazuju u ljusci aplikacije (`AnnouncementsHost`, montiran u `application-shell.tsx` 98), arhiv korisnika (`/announcements`, tab „Moja“) i upravljanje za one koji smiju da objavljuju (tab „Upravljanje“ sa uređivačem, izvještajem o potvrdama i potvrdama brisanja/povlačenja).

Najveći rizik je u on-call dijelu: stranica radi nad jednim „izabranim“ rasporedom i ima nekoliko mjesta gdje se prikazuje stari podatak ili se radi nad pogrešnom grupom, dok se unos vremena za preklapanje tumači u zoni pregledača a kalendar prikazuje zonu rasporeda.

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/on-call-page.tsx` | Stranica: pregled, detalj grupe, sedmica, swap, override, brisanje | 539 |
| `frontend/src/pages/announcements-page.tsx` | Stranica: arhiv (`AnnouncementArchive`) i upravljanje (`ManageAnnouncements`) | 425 |
| `frontend/src/components/on-call/` (6) | Raspored, kalendar, feed kartica, indikator, razlog, opseg preklapanja | 271 + 79 + 146 + 63 + 57 + 134 |
| `frontend/src/components/announcements/` (3) | Host (banner i modal), uređivač, izvještaj o potvrdama | 260 + 453 + 236 |
| `frontend/src/lib/on-call/on-call-view.ts` | Segmenti po danima, zone, premještanje članova, mapiranje grešaka | 200 |
| `frontend/src/lib/announcements/announcement-view.ts` | Ton, uloga čitača, sessionStorage brojač modala, datum i vrijeme | 128 |
| `frontend/src/services/on-call-api.ts` | HTTP za on-call, URL kalendara | 182 |
| `frontend/src/services/announcements-api.ts` | HTTP za obavještenja, izvještaj, CSV | 229 |
| `frontend/src/lib/a11y/announcer.ts` i `components/a11y/announcer-regions.tsx` | Globalni announcer (dijeljen, ne koriste ga moduli 9) | 75 + 44 |
| `frontend/src/components/ui/confirm-dialog.tsx` | Zajednički dijalog za potvrdu (koriste ga i on-call i obavještenja) | 67 |
| `frontend/src/layouts/application-shell.tsx` | Montiranje `AnnouncementsHost`, `key={location.pathname}` | 98 |
| `frontend/src/lib/session/route-access.ts` | `canOpenOnCall` (provjera pristupa) | 87 |
| `frontend/src/app/router.tsx` | Ruta `on-call` sa `check={canOpenOnCall}` | 138 |
| `backend/src/modules/on-call/` | Kontroleri i servisi on-call (guardovi, `assertTimeZone`) | — |
| `backend/src/modules/announcements/` | Kontroler, servis, viewer, delivery | — |
| `e2e/tests/44-on-call-schedule.spec.ts`, `45-announcements-lifecycle.spec.ts` | E2E za raspored i životni ciklus obavještenja | 167 + 126 |

---

## Trenutna implementacija

**On-call stranica.** Stranica učitava pregled (`overview`) i, za izabranu grupu, detalj sa rasponom od četiri sedmice (`getOnCallGroup`). Vremenska zona kalendara je `schedule.timezone` ili `defaultTimezone` (`on-call-page.tsx` 73). Detalj se učitava kad se promijeni grupa ili raspon (efekti 108–114). Kalendar (`on-call-calendar.tsx`) dobija segmente iz `on-call-view.ts` i prikazuje ih u zoni rasporeda. Segmenti se računaju sa 12-satnim korakom, pa dan sa promjenom sata (DST) ima tačno 23 sata (test u `on-call-view.spec.ts`).

**Pravila rasporeda.** `OnCallScheduleDialog` uređuje dužinu rotacije (dan ili sedmica), sat predaje (96 opcija po 15 min), datum početka, zonu (slobodan tekst), vlasnika, članove (gore/dolje/ukloni, bez prevlačenja) i razlog. Backend validira zonu (`assertTimeZone`, `on-call.service.ts` 66–75) i vraća `invalidSchedule`.

**Preklapanje i zamjena.** `OnCallRangeDialog` unosi `datetime-local` vrijednosti u zoni pregledača (`toLocalInputValue` / `fromLocalInputValue`). Override i swap idu na backend kao ISO trenutak. Razlog je obavezan (min 3 znaka). Brisanje grupe i preklapanja koristi `OnCallReasonDialog` (razlog obavezan). Swap prihvat i odbijanje ne traže potvrdu.

**Kalendar i indikator.** `OnCallHeaderIndicator` osvježava `/on-call/me` svakih 5 min, samo dok je tab vidljiv, i prikazuje prvu aktivnu smjenu. Feed kartica (`on-call-calendar-feed-card.tsx`) kreira, rotira i opoziva ICS token. URL se prikazuje jednom (backend čuva samo hash). Rotacija i opoziv traže `ConfirmDialog`.

**Obavještenja u ljusci.** `AnnouncementsHost` poll-uje `/announcements/active` svakih 60 s (`react-query`, `staleTime` 30 s). Prikazuje jedan banner sa brojačem i strelicama za više obavještenja. MODAL obavještenje se prikazuje najviše tri puta po sesiji (`sessionStorage`, `modalShowsPerSession = 3`). Brojač se povećava pri prikazu, a ne pri zatvaranju. Komponenta se ponovo montira pri svakoj promjeni putanje (`key={location.pathname}` u ljusci), pa je „jedan modal po navigaciji“ stvarno ponašanje.

**Arhiv i upravljanje.** Arhiv je lista `<details>` elemenata sa `id="announcement-<id>"`. Deep link `?open=<id>` otvara i fokusira stavku. Tab „Upravljanje“ (samo ako `canManage`) ima tabelu, uređivač (`AnnouncementEditorDialog`) sa pregledom Markdown-a i procjenom publike (debounce 350 ms), izvještaj sa CSV-om i podsjetnikom, te potvrde za objavu, povlačenje (sa razlogom) i brisanje.

**Dozvole.** Frontend `canOpenOnCall` i `permissionKeys.onCallRead` skrivaju stranicu i indikator. Backend `on-call.controller.ts` ima `@RequirePermissions` na svakoj ruti: čitanje za `onCallRead`, pisanje rasporeda i preklapanja za `onCallManage`. Obavještenja nemaju dekoratore dozvola na kontroleru. Provjera je u servisu (`requireManage` 146–149) i u `announcementViewerOf` (`canManageAll`, `canReadReports`).

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Greška pri osvježavanju | Ako pregled već postoji, neuspjeli refresh je tih (O1) | Greška uz dugme za ponovni pokušaj, a stari podaci ostaju vidljivi |
| Izbor grupe | Stari detalj ostaje dok novi ne stigne, a akcije rade nad starom grupom (O2) | Akcije vezane za grupu iz istog odgovora, bez race-a |
| Promjena sedmice | Nema indikatora učitavanja, stari podaci ostaju (O3) | Loader ili indikator kad se mijenja sedmica |
| Zona vremena | Unos preklapanja je u zoni pregledača, kalendar i raspored u zoni rasporeda, a „dežuran do“ u zoni pregledača (O4) | Jedna zona, označena uz svaki unos i prikaz |
| Potvrda sa razlogom | Dugme „Otkaži“ je onemogućeno dok razlog nije unesen (O9, OB3) | Otkaži uvijek aktivan, potvrda onemogućena dok razlog nije unesen |
| Tabela upravljanja | Greška refresha zamjenjuje cijelu tabelu porukom bez dugmeta (OB2) | Greška u traci iznad tabele, tabela ostaje |
| Globalni announcer | Moduli 9 ne koriste `announce`, oslanjaju se na toast i `role` (O13) | Odluka: koji ishodi se najavljuju čitaču ekrana |
| Testovi | Pure funkcije su testirane (8 + spec za obavještenja). E2E pokriva samo prikaz rasporeda i jedan tok obavještenja (vidi dolje) | Testovi za swap, override, brisanje, feed token, banner, modal limit, deep link i izvještaj |
| Dupliranje | `severityKeys` u tri fajla, mapiranje `en`→`en-GB` u tri mjesta (OB8, O6) | Jedan helper za lokalizaciju i oznake ozbiljnosti |

**E2E pokrivenost.**
- `44-on-call-schedule.spec.ts`: raspored je vidljiv na pregledu, u detalju sedmice i na mobilnom prikazu. Drugi test provjerava endpoint stabla jedinica. Nema testova za swap, override, brisanje sa razlogom, feed token i indikator u zaglavlju.
- `45-announcements-lifecycle.spec.ts`: kreiranje, objava i izvještaj „0 od N“. Nema testova za banner (potvrda, odbacivanje, brojač), modal (ograničenje od tri prikaza), `?open=` deep link, CSV, podsjetnik, povlačenje sa razlogom i validaciju uređivača (trajanje, redoslijed datuma).

---

## Gap analiza

1. **Stari detalj i pogrešna grupa (O2).** `loadDetail` (`on-call-page.tsx` 95–106) nema `active` zaštitu. Catch ne briše `detail`. Pri promjeni grupe (303–306) header, dugmad za upravljanje (`canManage`) i potvrda brisanja (`confirmDelete` 142–148, koristi `detail.group.id`) rade nad prethodnom grupom dok novi odgovor ne stigne. Ovo je najvažniji nalaz modula jer akcija može da pogodi pogrešnu grupu.
2. **Tih neuspjeh osvježavanja (O1).** `loadOverview` (79–93) postavlja `loadError`, ali render (177) gleda samo `overview === null`. Ako je pregled već učitan, greška nakon zamjene ili brisanja se ne prikazuje.
3. **Zona vremena na istoj stranici (O4).** Ovo je najveći dizajnerski nalaz modula. Na jednoj stranici se koriste tri zone bez oznake:
   - kalendar i naslov rasporeda: zona rasporeda (`on-call-page.tsx` 73, `on-call-calendar.tsx` 25 i 51);
   - „dežuran do“, sljedeća smjena, swap i preklapanja: zona pregledača (`formatOnCallTime(x, t)` bez zone, linije 224, 232, 252, 326, 402, 458, 489);
   - unos preklapanja i zamjene: zona pregledača (`on-call-range-dialog.tsx` 52–56, 61–62, 107–111).
   Ako su zona pregledača i zona rasporeda različite (npr. admin u drugoj zoni, ili putovanje), preklapanje se unese u pogrešnom satu, a kalendar to prikazuje u zoni rasporeda. Backend čuva trenutak, pa greška nije vidljiva u podacima dok neko ne uporedi kalendar sa unosom. Isti obrazac kao RS7 u modulu 8.
4. **Nedosljedno ponašanje dijaloga (O9, OB3).** `OnCallReasonDialog` (42) i `ManageAnnouncements` za povlačenje (407) prosljeđuju `isPending` za validaciju razloga. `ConfirmDialog` onemogućava i „Otkaži“ kad je `isPending` true (`confirm-dialog.tsx` 50). Zato dugme „Otkaži“ nije aktivno dok je razlog kraći od tri znaka, a to je početno stanje. `ConfirmDialog` već ima prop `confirmDisabled` za ovu namjenu. Esc i klik van dijaloga i dalje rade.
5. **Tabela upravljanja nestaje pri grešci (OB2).** `ManageAnnouncements.load` (186–199) postavlja `loadError`, a render (249–255) vraća samo poruku greške. `refreshEverywhere` (201–205) zove `load` nakon objave, povlačenja, brisanja i čuvanja. Ako taj refresh padne, cijela tabela nestaje i nema dugmeta za ponovni pokušaj. Svi podaci su tada skriveni, iako je akcija uspjela.
6. **Ponovno učitavanje bez React Query-ja.** `ManageAnnouncements` drži `list` i `options` u dva stanja i učitava ih ručno, dok arhiv koristi `react-query` (109–113). Nema `cancelled` zaštite za `load` (186–199), a dva poziva mogu da se utrkuju (`useEffect` i `refreshEverywhere`).
7. **Race u izvještaju (OB1, za provjeru).** `AnnouncementReportDialog.load` (33–45) nema `active` zaštitu. Ako korisnik brzo zatvori i otvori drugi izvještaj, kasniji odgovor za prethodno obavještenje može da prepiše prikaz. Akcije (CSV 48, podsjetnik 61) koriste trenutni `announcementId`, pa se prikazani podaci i akcija mogu razlikovati.
8. **Uređivač: pristupačnost i dugi sastav.** Dugme „Pregled / Uredi“ ima `aria-pressed` dok mijenja tekst (243–245). Polje „Tekst“ nije `Field` nego `span` sa `aria-label` na textarea (237–241, 252–253). `AnnouncementEditorDialog` ima oko 330 linija u jednoj funkciji.
9. **Obavještenja nemaju zonu.** Uređivač, arhiv i tabela prikazuju `startsAt` i `endsAt` u zoni pregledača bez oznake (`toLocalInputValue` 97–101, `announcementDateTimeFormatter` 119–127, `announcements-page.tsx` 157, 310–312). Za globalno obavještenje to je prihvatljivo, ali korisnik ne vidi u kojoj zoni važi „do 18:00“.
10. **Zamjene bez potvrde.** Prihvat, odbijanje i otkazivanje zamjene (`on-call-page.tsx` 257–267) nemaju potvrdu. Prihvat je obavezujući za dežurstvo, pa je to odluka za proizvod.
11. **Globalni announcer se ne koristi.** Moduli 9 ne zovu `announce`. Obavještenje sa CRITICAL ozbiljnošću ima `role="alert"`, što je dovoljno za prvi prikaz. Promjena dežurnog nakon zamjene ili preklapanja ide samo kroz toast, a za njega nisam provjerio `role` u `toast.tsx`.

---

## Mišljenje tima i preporuka

On-call i obavještenja su bolje strukturirani nego što se na prvi pogled čini. Čiste funkcije u `on-call-view.ts` i `announcement-view.ts` rade sa zonama preko `Intl` bez hardkodiranih zona, računaju DST dane i imaju testove. Obavještenja su dobro urađena za pristupačnost: `role` zavisi od ozbiljnosti, brojač ima `aria-live`, sadržaj arhiva je `<details>`, a deep link fokusira stavku. Ograničenje od tri modala po sesiji je u sessionStorage-u sa testom.

Glavni problemi su u komponentama koje rade sa stanjem. Stranica o dežurstvu ne štiti odgovore od zastarjelih zahtjeva, a akcije se oslanjaju na „izabranu“ grupu. Zona vremena nije konzistentna na istoj stranici. E2E pokriva prikaz i jedan tok obavještenja, a ne akcije koje mijenjaju podatke.

Preporuka po redu:

1. **Detalj grupe (O2) i pregled (O1).** Jedan `active` obrazac kao u `use-docs.ts`. Detalj se briše pri promjeni grupe, a akcije uzimaju `group.id` iz istog odgovora. Greška refresha ostaje vidljiva uz stare podatke.
2. **Zona (O4).** Odluka proizvoda: zona rasporeda za sve on-call prikaze i unos, uz oznaku zone. Zatim se `formatOnCallTime` i `OnCallRangeDialog` moraju dobiti istu zonu. Ovo je odluka, ne samo ispravka.
3. **Dijalozi sa razlogom (O9, OB3).** `confirmDisabled` umjesto `isPending` za validaciju. Jedna izmjena u dva fajla.
4. **Tabela upravljanja (OB2, OB8).** Greška u traci iznad tabele. Učitavanje u `react-query` (kao arhiv) sa `invalidateQueries` nakon akcija.
5. **Zajednički helperi.** `severityKeys`, mapiranje lokala i `formatOnCallDayLabel` (koji koristi ključeve iz `changes.calendar`) u zajedničke module.
6. **Testovi.** E2E za swap (prihvat i odbijanje), override sa razlogom, brisanje grupe, feed token (kreiranje, rotacija, opoziv), banner (potvrda i odbacivanje) i ograničenje modala. Komponentski testovi za `OnCallRangeDialog` (zona) i `AnnouncementEditorDialog` (validacija datuma i trajanja).

---

## Otkriveni bugovi i neusklađenosti

| ID | Ozbiljnost | Fajl i linija | Opis |
|---|---|---|---|
| O1 | Srednja | `pages/on-call-page.tsx` 79–93, 177 | `loadOverview` postavlja `loadError`, a render gleda samo `overview === null`. Neuspjeli refresh nakon zamjene ili brisanja je tih ako je pregled već učitan. |
| O2 | Srednja | `pages/on-call-page.tsx` 95–106, 142–148, 303–306 | `loadDetail` nema `active` zaštitu, a catch ne briše `detail`. Pri promjeni grupe header i akcije (uključujući `confirmDelete` sa `detail.group.id`) rade nad prethodnom grupom. Rizik pogrešne grupe. |
| O3 | Srednja | `pages/on-call-page.tsx` 384–385, 410–418 | Promjena sedmice (`weekOffset`) nema loader kalendara. Stari podaci ostaju bez indikatora. |
| O4 | Srednja (dizajn, potvrđeno) | `components/on-call/on-call-range-dialog.tsx` 52–56, 61–62, 107–111; `pages/on-call-page.tsx` 73, 224, 232, 252, 326, 402, 458, 489 | Unos preklapanja i zamjene je u zoni pregledača, kalendar je u zoni rasporeda, a „dežuran do“ i sljedeće smjene u zoni pregledača. Pogrešan sat ako se zone razlikuju. Isti obrazac kao RS7. |
| O9 | Srednja (UX i semantika, potvrđeno) | `components/on-call/on-call-reason-dialog.tsx` 42; `components/ui/confirm-dialog.tsx` 50 | `isPending` služi za validaciju razloga, pa je „Otkaži“ onemogućen dok razlog nije unesen. `ConfirmDialog` ima `confirmDisabled` za tu namjenu. |
| OB2 | Srednja (potvrđeno) | `pages/announcements-page.tsx` 186–199, 201–205, 249–255 | Greška refresha nakon objave, povlačenja, brisanja ili čuvanja zamjenjuje cijelu tabelu porukom bez dugmeta za ponovni pokušaj. |
| OB3 | Srednja (UX i semantika, potvrđeno) | `pages/announcements-page.tsx` 407 | Isti obrazac kao O9: `isPending={busy \|\| (withdraw && reason.trim().length < 3)}` onemogućava „Otkaži“ pri povlačenju bez razloga. |
| O5 | Niska (za provjeru) | `pages/on-call-page.tsx` 73–76, 108–114 | `timeZone` zavisi od `detail` i `rangeStart`. Pri prvom učitavanju moguć je dupli zahtjev za detalj. |
| O6 | Niska | `lib/on-call/on-call-view.ts` 180, 184–190; `components/on-call/on-call-calendar.tsx` 23 | `formatOnCallClock(iso, "en-GB", zona)` provjerava `locale === "en"`, pa `en-GB` pada na bs-BA. Ispis je trenutno isti, ali logika je pogrešna. Isto u `announcement-view.ts` 120. |
| O7 | Niska (humanizacija) | `lib/on-call/on-call-view.ts` 35–37 i još 4 mjesta; 149, 159, 42 | `civilDateKey` (split + map(Number)) ponovljen pet puta. `formatOnCallWeekday`/`DayLabel` koriste ključeve `changes.calendar.*` iz drugog modula. Komentar 42 kaže „local midnight“, a vrijednost je `zonedMidnight`. |
| O8 | Niska | `pages/on-call-page.tsx` 199, 257–267, 280, 461; `components/on-call/on-call-calendar.tsx` 25 | `as never` i `as unknown as string` pri prevođenju statusa swapa (280). `Intl.DateTimeFormat` se kreira pri svakom renderu (199, calendar 25). Odbijanje i otkazivanje swapa bez potvrde (257–267). Razlog overridea samo u `title` (461). |
| O10 | Niska (UX) | `components/on-call/on-call-schedule-dialog.tsx` 151, 263 | Zona je slobodan tekst bez klijentske provjere. Backend je provjerava (`assertTimeZone`), ali greška se prikazuje tek nakon slanja. Dugme „Sačuvaj“ je onemogućeno bez objašnjenja. |
| O11 | Niska | `components/on-call/on-call-header-indicator.tsx` 30, 35–36, 54 | Greška učitavanja je tiha (indikator nestane). Nema osvježavanja kad se tab ponovo vidi (čeka se do 5 min). Indikator je skriven ispod 640 px (`hidden ... sm:flex`), pa mobilni korisnik ne vidi ko je dežuran. |
| O12 | Niska | `components/on-call/on-call-calendar-feed-card.tsx` 48, 55, 58, 73 | Kartica nema skeleton (`return null` dok se učitava, pomak rasporeda). Opoziv prikazuje grešku preko `mapApiError`, a rotacija preko `mapOnCallError` (nedosljedno). `createdAt` se postavlja iz lokalnog sata (`new Date()`), a ne iz odgovora servera. |
| O13 | Niska (a11y, za provjeru) | `pages/on-call-page.tsx` (nema poziva `announce`) | Promjena dežurnog nakon zamjene ili preklapanja ide samo kroz toast. Provjeriti da li toast ima `role="status"`. |
| OB1 | Niska (za provjeru) | `components/announcements/announcement-report-dialog.tsx` 33–45, 48, 61 | `load` nema `active` zaštitu. Zastarjeli odgovor za prethodno obavještenje može prepisati prikaz. Akcije koriste `announcementId`, pa se prikaz i akcija mogu razlikovati. |
| OB4 | Niska | `pages/announcements-page.tsx` 63–67, 88–101 | Greška `capabilities` upita je tiha: `isLoading` je false, `capabilities` je undefined, pa se prikazuje arhiv bez taba „Upravljanje“ i bez poruke. |
| OB5 | Niska (a11y) | `components/announcements/announcement-editor-dialog.tsx` 237–241, 243–245, 252–253 | `aria-pressed` na dugmetu čiji se tekst mijenja („Pregled“ / „Uredi“). Polje „Tekst“ nije povezano sa labelom (`span` + `aria-label`). |
| OB6 | Niska (krhko) | `components/announcements/announcement-editor-dialog.tsx` 205–207 | Broj dana za trajanje se parsira iz poruke servera (`duration:90`). Ako se format poruke promijeni, greška se prikazuje kao opšta. |
| OB7 | Niska (dizajn) | `pages/announcements-page.tsx` 152, 157, 310–312; `components/announcements/announcement-editor-dialog.tsx` 292, 301 | Vrijeme obavještenja je u zoni pregledača bez oznake. Za globalno obavještenje to je prihvatljivo, ali korisnik ne zna zonu. |
| OB8 | Niska (humanizacija) | `announcement-editor-dialog.tsx` 115–453 (cijela funkcija), `announcements-page.tsx` 172–425; `announcements-host.tsx` 32–36; `announcements-page.tsx` 38–42; `announcement-editor-dialog.tsx` 34–38; `announcement-report-dialog.tsx` 196–236 | Uređivač (~330 linija) i `ManageAnnouncements` (~250) su predugi. `severityKeys` je u tri fajla. Stanje `ManagedAnnouncement \| null \| undefined` (179) je nejasno. Ugniježđeni ternari u izvještaju (203–224). Planske oznake u komentarima (22 pogotka). |
| OB9 | Niska (UX) | `components/announcements/announcement-report-dialog.tsx` 166 | Dugme „Podsjeti“ je onemogućeno kad `canRemind` nije tačno (pravilo jednog podsjetnika na 24 h), a nema objašnjenja. |
| OB10 | Niska (konzistentnost) | `components/announcements/announcement-editor-dialog.tsx` 443 | „Otkaži“ u uređivaču nije onemogućen dok se čuva, pa zatvaranje ostavlja `onSaved` da se izvrši nakon zatvaranja. Raspored (`on-call-schedule-dialog.tsx` 124) to blokira. |
| OB11 | Niska (testovi) | `components/announcements/`, `pages/announcements-page.tsx`, `components/on-call/` | Nema komponentskih testova za `AnnouncementsHost`, `AnnouncementEditorDialog`, `OnCallRangeDialog` i `OnCallScheduleDialog`. E2E ne pokriva banner, modal, deep link, CSV, podsjetnik ni povlačenje. |

**Pozitivno (za zadržati):**
- Čiste funkcije za zone i DST (`on-call-view.ts`, `zonedMidnight`, `civilDateKey`), sa testovima.
- `role` zavisi od ozbiljnosti (`severityRole`), brojač ima `aria-live`, `<details>` u arhivu, deep link `?open=` fokusira stavku.
- Modal ograničen na tri prikaza po sesiji, sa mogućnošću zatvaranja (Esc), i ne blokira rad.
- `OnCallReasonDialog` i `ConfirmDialog` traže razlog za destruktivne radnje; ICS URL se prikazuje jednom, a token se čuva kao hash.
- Backend on-call guardovi su po ruti (`onCallRead` za čitanje, `onCallManage` za pisanje). Odgovor kalendara ima `Cache-Control: private, no-store`.
- Obavještenja: `fieldset disabled` za objavljeno (ciljna publika i tip se ne mijenjaju), `Progress` sa tekstualnim sažetkom, CSV kroz blob.

**Bezbjednost (informativno, nije bug):** ICS token je u query stringu (`/public/on-call/calendar.ics?token=`). To je uobičajeno za pretplate na kalendar, a backend ima `no-store`. Token ipak može da završi u proxy i access logovima. Provjeriti da li se query string loguje.

---

## Ocjena: 6/10

Obrazloženje:
- **Plus:** čiste funkcije sa testovima, dobra pristupačnost obavještenja, zaštita akcija razlogom, ograničenje modala, backend guardovi po ruti, sigurno rukovanje ICS tokenom.
- **Minus:** stari detalj i pogrešna grupa pri akcijama (O2), tih neuspjeh osvježavanja (O1, OB2), zona vremena nekonzistentna na istoj stranici (O4), dugme „Otkaži“ onemogućeno zbog pogrešne upotrebe `isPending` na dva mjesta (O9, OB3), i e2e koji ne pokriva akcije koje mijenjaju podatke.

Ocjena je u skladu sa modulima 5–8.

---

## Must-Have kandidati (modul 9)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **O2 i O1:** `active` zaštita za `loadDetail` i `loadOverview`. Detalj se briše pri promjeni grupe, a akcije uzimaju `group.id` iz istog odgovora. Greška refresha ostaje vidljiva uz stare podatke.
2. **O4:** odluka o zoni za on-call (zona rasporeda za sve prikaze i unos, uz oznaku). Zatim usklađivanje `formatOnCallTime`, `OnCallRangeDialog` i „dežuran do“.
3. **O9 i OB3:** `confirmDisabled` umjesto `isPending` za validaciju razloga u `OnCallReasonDialog` i u povlačenju obavještenja.
4. **OB2:** tabela upravljanja ostaje vidljiva pri grešci refresha. Greška u traci sa dugmetom za ponovni pokušaj. Opcionalno: učitavanje kroz `react-query` kao arhiv.
5. **O3:** loader ili indikator pri promjeni sedmice.
6. **Testovi:** e2e za swap, override, brisanje grupe, feed token i banner (potvrda, odbacivanje, ograničenje modala). Komponentski testovi za `OnCallRangeDialog` (zona) i `AnnouncementEditorDialog` (datumi i trajanje).
7. **O10:** klijentska provjera zone (IANA) uz poruku i objašnjenje onemogućenog dugmeta „Sačuvaj“.
8. **OB8 i O7:** zajednički helperi za `severityKeys`, lokalizaciju (`en-GB`/`bs-BA`) i `civilDateKey`, te razbijanje `AnnouncementEditorDialog` i `ManageAnnouncements`.

---

## Status ispravki (2026-10-13)

Urađeno (Must-Have 1, 3, 4, 5 i dio 6):
- **O1:** greška osvježavanja pregleda se prikazuje iznad sadržaja i kad je pregled već učitan (`on-call-page.tsx`).
- **O2:** detalj grupe se učitava u efektu sa `active` zaštitom; odabir grupe briše prethodni detalj (`selectGroup`), pa akcije ne mogu raditi nad staroj grupi. `reloadAll` koristi `detailRevision`.
- **O3:** pri promjeni sedmice prikazuje se status „Učitavanje“ i raspored je zatamnjen (`aria-busy`).
- **O9 i OB3:** `OnCallReasonDialog` i povlačenje obavještenja koriste `confirmDisabled` za validaciju razloga; „Otkaži“ više nije onemogućen.
- **OB2:** greška osvježavanja tabele upravljanja ostavlja tabelu vidljivom i nudi dugme „Pokušaj ponovo“ (novi ključ `announcements.manage.retry` u bs i en).

Nije urađeno:
- **O4 (zona):** čeka odluku proizvoda (zona rasporeda ili pregledača).
- O5, O6, O7, O8, O10–O13, OB1, OB4–OB11.
- **Testovi:** komponentski testovi nisu dodati, jer projekt nema jsdom ni `@testing-library/react`. To zahtijeva odluku o novim devDependency paketima.
- Provjera u pregledaču nije rađena.
