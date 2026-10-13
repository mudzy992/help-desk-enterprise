# Modul 13: `lib/` helperi

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (metrike, grep i čitanje ključnih fajlova). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **LB** (lib).

**Metod i ograničenje.** Modul ima 293 fajla izvan testova (~20 500 linija) i 171 spec fajl. Nije svaki fajl pročitan. Nalazi su zasnovani na:
- metrikama (skripte i grep po cijelom `frontend/src/lib`),
- čitanju ključnih fajlova: `lib/query/query-client.ts` (cijelo), `lib/session/use-session.ts` (`signOut`, kraj), `lib/tickets/use-sidebar-ticket-counts.ts` (cijelo), `lib/auth/entra-redirect.ts` (zaglavlje i `safeReturnPath`), `lib/a11y/announcer.ts` (sat), `lib/audit/audit-log-i18n.ts` (zaglavlje i ključevi), `lib/format-relative-time.ts` (potpis),
- potvrdi u `components/ui/toast.tsx` i `app/app.tsx` (provider stablo),
- pretrazi `queryClient.clear|removeQueries|resetQueries` u cijelom `src` (nema poziva izvan `config-versions` i `announcer`).

Ocjena se ne oslanja na pojedinačno čitanje svih 293 fajla.

---

## Modul

`lib/` je sloj pomoćnih funkcija, stanja i hookova: mapiranje grešaka, formatiranje datuma i brojeva, view-modeli za komponente, hookovi za podatke, store-ovi (toast, branding, timer), query klijent, sesija, a11y, tema, install helperi. Po namjeni, `lib/` bi trebao biti sloj čistih funkcija bez React-a i bez mrežnih poziva, a hookovi i stanje bi trebalo da budu odvojeni.

---

## Povezani fajlovi i folderi

| Folder | Broj fajlova (bez spec) | Uloga |
|---|---|---|
| `lib/tickets/` | 61 | Tiketi: view, hookovi, mapiranje grešaka, prikaz |
| `lib/services/` | 24 | Katalog servisa, onboarding, mapiranje |
| `lib/realtime/` | 15 | Socket i događaji |
| `lib/settings/` | 15 | Postavke |
| `lib/directory/` | 13 | Imenik korisnika |
| `lib/sla/`, `lib/reports/`, `lib/config-versions/`, `lib/queue/` | 10, 8, 9, 7 | Domenski view i hookovi |
| `lib/session/`, `lib/auth/`, `lib/webauthn/` | 6, 4, 4 | Sesija, prijava, passkey |
| `lib/query/` | 2 | Query klijent i ključevi |
| `lib/a11y/`, `lib/theme/`, `lib/branding/`, `lib/app/` | 5, 3, 3, 1 | Zajednički helperi |
| `lib/install/`, `lib/*install*` | 1 + ~12 | Install (modul 11) |
| `lib/*-error.ts`, `lib/map-*.ts` | 28 | Mapiranje grešaka |

Važni fajlovi: `lib/query/query-client.ts`, `lib/query/query-keys.ts` (62), `lib/session/use-session.ts`, `lib/tickets/use-sidebar-ticket-counts.ts`, `lib/tickets/use-ticket-list.ts` (438), `lib/dashboard/use-dashboard-summary.ts` (263), `lib/time-tracking/active-timer-store.ts`, `lib/branding/branding-store.ts`, `lib/a11y/announcer.ts`, `lib/auth/entra-redirect.ts`, `lib/audit/audit-log-i18n.ts` (472), `lib/navigation.ts` (277).

---

## Trenutna implementacija

**Metrike.**

| Metrika | Vrijednost |
|---|---|
| Fajlovi (bez spec) | 293, ~20 500 linija |
| Spec fajlovi | 171 |
| Hookovi `use-*.ts` | 55 (3 sa spec fajlom sa istim nazivom) |
| `map-*` fajlovi za greške | 28 (26 koristi `instanceof ApiError`) |
| Fajlovi sa value importom iz `@/services` | 103 |
| Fajlovi sa importom iz `@/components`, `@/pages` ili `@/app` | 16 |
| Modulo-nivo `let` (singleton stanje) | 12 (u 7 fajlova) |
| `as never` / `as unknown as` | 2 + 4 (u 4 fajla) |
| `any` (stvarno, u kodu) | 0 (osim riječi `any` u vrijednostima) |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | 0 |
| `console.*` | 0 |
| Prazni `catch {}` blokovi | 0 |
| Pojave „Paket / Faza / Review 20xx / Constitution / §“ u komentarima | 210 |
| `Intl.DateTimeFormat` | 19 poziva u 10 fajlova |
| `Date.now()` / `new Date()` | 16 / 12 |

**Query sloj.** `helpdeskQueryClient` je singleton (`lib/query/query-client.ts`), koristi se u `app/app.tsx`. Defaulti: `staleTime` 30 s, `gcTime` 5 min, `retry` 1, `refetchOnWindowFocus` false. Komentari u fajlu su jasni. 91 `useQuery` poziv u 63 fajla. Ključevi nisu centralizovani: `query-keys.ts` ima 62 linije, a 18 mjesta koristi inline `queryKey: [...]` (npr. `["admin", "security", "rate-limits"]`).

**Odjava.** `signOut` u `lib/session/use-session.ts` (linija ~195) poziva `logoutSession()` bez čekanja, briše sačuvanu sesiju, emituje promjenu sesije i odjavljuje Entra. Ne čisti query keš. Pozivi `signOut` su u `require-auth.tsx`, `session-controls.tsx` i `helpdesk-socket-host.tsx`. Nema `window.location.reload()` nakon odjave (provjereno grep-om).

**Sidebar brojači.** `lib/tickets/use-sidebar-ticket-counts.ts` drži modulo-nivo keš (`cachedTicketCounts`, TTL 30 s) i `inFlightTicketCounts`. Keš nije vezan za korisnika i nema funkciju za reset.

**Aktivni tajmer.** `lib/time-tracking/active-timer-store.ts` ima modulo-nivo `state` i `inFlight`, i funkciju `resetActiveTimer`. Poziva se u `active-timer-host.tsx` pri promjeni `accessToken` (dobro).

**Dobro urađeno.** `safeReturnPath` u `entra-redirect.ts` odbija apsolutne i protokol-relativne putanje i `/login` / callback (zaštita od open redirect). `lib/a11y/announcer.ts` ubrizgava sat (`clock`), što olakšava testove. `format-relative-time.ts` prima `now` kao parametar. Nema `console.*`, nema `@ts-ignore`, nema praznih `catch` blokova.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Podaci nakon odjave | Query keš i sidebar keš ostaju u memoriji (LB1) | Odjava briše sve podatke vezane za korisnika |
| Modulo stanje | 12 singleton varijabli u 7 fajlova, većina bez reseta, teški za testove (LB2) | Stanje u store-u sa resetom ili u hooku |
| Zavisnost lib → ui/domen | 6 view helpera uvozi `BadgeTone` iz `components/ui` (LB3) | `lib` ne zavisi od `components` |
| Sloj hookova | 55 hookova u `lib/` (LB4) | Hookovi u `hooks/` ili u feature folderu |
| Testovi hookova | 3 od 55 sa spec fajlom; `use-ticket-list` (438) i `use-sidebar-ticket-counts` bez testa (LB5) | Kritični hookovi pokriveni |
| TS bypass | `as unknown as` za WebAuthn opcije; `as never` u dva wrapper-a `t()` (LB6) | Runtime parsiranje ili tipizovan `TFunction` |
| Mapiranje grešaka | 28 fajlova sa istim obrascem (LB7) | Jedan generički mapper + mapa ključeva |
| Datumi | 19 `Intl.DateTimeFormat` poziva u 10 fajlova (LB7) | Jedan modul formatera |
| Query ključevi | 18 inline ključeva, nema registra (LB8) | Jedan registar, ključevi vezani za korisnika |
| Komentari | 210 oznaka plana i revizija (LB9) | Komentar objašnjava zašto |

---

## Gap analiza

1. **Podaci iz prethodne sesije ostaju u memoriji (LB1, visoka).** Odjava (`signOut`) ne poziva `helpdeskQueryClient.clear()` ni `removeQueries()`. Nijedan ključ upita nije vezan za korisnika. Sidebar keš (`use-sidebar-ticket-counts.ts`) nije resetovan. Posljedica za zajednički računar: korisnik B se prijavi u istom tabu i do 5 minuta vidi keš korisnika A za iste ključeve (npr. liste tiketa). Ako refetch padne (npr. 403 zbog manjih prava), TanStack Query po defaultu zadržava posljednje podatke, pa stari podaci ostaju na ekranu. Sidebar brojači A ostaju do isteka TTL-a (30 s). Ovo je potvrđeno čitanjem koda, a ponašanje u pregledaču nije reprodukovano. Popravka je mala: u `signOut` pozvati `helpdeskQueryClient.clear()` i reset sidebar keša; po potrebi i `resetActiveTimer` (već postoji preko `accessToken`).
2. **Singleton stanje u modulima (LB2, srednja).** `tickets/use-sidebar-ticket-counts` (2 `let`), `time-tracking/active-timer-store` (`state`, `inFlight`), `branding/branding-store` (3), `settings-realtime-store` (`generation`), `a11y/announcer` (`sequence`, `clock`), `a11y/document-title` (`productName`), `auth/entra-redirect` (`cached` MSAL instanca). Većina nema funkciju za reset, pa testovi zavise jedan od drugog i redoslijeda. Keširanje MSAL instance treba vezati za konfiguraciju (postoji `key`, što je dobro).
3. **Obrnut smjer zavisnosti (LB3, srednja).** Šest fajlova (`changes/change-view`, `config-versions/config-version-display`, `ops/ops-health-view`, `privacy/privacy-view`, `problems/problem-view`, `queue/integration-job-badge-tone`) uvozi tip `BadgeTone` iz `components/ui/badge`. `lib/reports/csat-view.ts` uvozi `HorizontalBarItem` iz `components/charts/h-bars`. `lib/groups/use-groups-panel-actions.ts` uvozi `GroupDrawerTab` iz `components/groups/group-detail-drawer`. Tipovi koji su zajednički treba da žive u `lib/` (npr. `lib/ui/tone.ts`), a komponente ih importuju odatle. Ukupno 16 fajlova u `lib` importuje iz `components`, `pages` ili `app`.
4. **`lib/` nije sloj čistih funkcija (LB4, srednja).** 55 hookova `use-*.ts` i 103 fajla sa value importom iz `@/services` žive u `lib/`. `use-ticket-list.ts` (438 linija) i `use-dashboard-summary.ts` (263 linije) su veliki hookovi koji miješaju dohvat, filtere i transformaciju. Preporuka: izdvojiti hookove u `hooks/` (ili u feature folder), a `lib/` ostaviti za čiste funkcije.
5. **Pokrivenost hookova (LB5, srednja).** Od 55 hookova, 3 imaju spec sa istim nazivom. Nisu pokriveni `use-ticket-list` (438 linija, filteri i paginacija), `use-sidebar-ticket-counts` (TTL, deduplikacija u letu), `use-dashboard-summary`. Ovo su mjesta gdje su greške najskuplje.
6. **Zaobilaženje TypeScript-a (LB6, srednja).** `webauthn/passkey-ceremony.ts` (linije 91, 107): `options as unknown as PublicKeyCredential…OptionsJSON`. Server šalje JSON, a tip se samo potvrđuje bez provjere. Bolje je parsirati (npr. zod ili ručni guard) pa tek onda tipizovati. `charts/chart-summary.ts` (41) i `tickets/ticket-text.ts` (8): `t(key as never, (options ?? {}) as never) as unknown as string` — dva nezavisna `translate` wrapper-a sa istim trikom (isto kao SV15 u modulu 10). Tip `TFunction` iz `i18next` rješava ovo na jednom mjestu.
7. **Duplirani obrasci (LB7, srednja).**
   - 28 `map-*-error.ts` fajlova: 26 ima `instanceof ApiError` i mapira `error.code` na ključ prevoda. Razlikuju se samo po listi kodova. Jedan generički mapper sa mapom ključeva smanjio bi ~28 fajlova na konfiguraciju.
   - 19 poziva `Intl.DateTimeFormat` u 10 fajlova i 4 `toLocale*`: različiti formateri za iste datume. Jedan modul sa `formatDate`, `formatDateTime`, `formatTime` bi bio dovoljan.
   - `Date.now()` (16) i `new Date()` (12) se direktno pozivaju u helperima, pa testovi zavise od realnog vremena. `announcer.ts` i `format-relative-time.ts` pokazuju dobar obrazac (ubrizgan sat), koji nije raširen.
8. **Ključevi upita (LB8, srednja).** Vidi gap 1. Bez centralnog registra, `invalidateQueries({ queryKey: [...] })` može promašiti ključ bez greške. Ključevi nisu vezani za korisnika, što je uzrok LB1.
9. **Dokumentacija kroz komentare (LB9, niska).** 210 komentara sa oznakama plana i revizija („Paket 1.4 (A1)“, „Faza 3.3 (plan §3.3)“, „Review 2026-09-25 (S1)“, „Constitution §32“). Za `lib/query/query-client.ts` komentari su korisni, ali oznake plana ne objašnjavaju kod.
10. **Prevodi u TypeScript fajlu (LB10, niska).** `lib/audit/audit-log-i18n.ts` (472 linije) drži mapu ključeva za audit akcije i polja, sa prevodima preko `t(...)`. Namjerno je odvojeno, ali duplira prevodni sloj (modul 14). Treba provjeriti da li se ključevi `admin.ops.auditLog.labels.*` svi nalaze u `i18n` JSON fajlovima.
11. **Veliki fajlovi (LB11, niska).** `lib/audit/audit-log-i18n.ts` (472), `lib/tickets/use-ticket-list.ts` (438), `lib/privacy/simple-markdown.ts` (322; sopstveni markdown parser, vidjeti modul 7), `lib/assets/asset-view.ts` (310), `lib/tickets/describe-ticket-activity.ts` (308).

**Što je dobro:** nema `any`, `@ts-ignore`, `console.*` i praznih `catch` blokova. `safeReturnPath` je dobra zaštita od open redirecta. Ubrizgavanje sata u `announcer.ts` i `format-relative-time.ts`. Konfiguracija query klijenta je dokumentovana. Pomoćne funkcije za sidebar brojače (`count-sidebar-ticket-badges.ts`) imaju spec.

---

## Mišljenje tima i preporuka

`lib/` je u dobrom stanju po higijeni koda (nema `any`, nema tihih grešaka, nema `console`), ali ima tri strukturalna problema. Prvi je bezbjednosni: odjava ne briše podatke korisnika (LB1). To je najvažnija popravka u ovom modulu i ne zahtijeva velike promjene. Drugi je arhitektonski: `lib/` mješa čiste funkcije, hookove, stanje i zavisnosti prema UI-ju (LB3, LB4). Treći je obrazac: 28 mapera i 10 fajlova sa datumima se ponavljaju (LB7).

Preporuka redom:
1. LB1: `signOut` čisti query keš i sidebar keš; ključevi upita vezani za korisnika (`['user', userId, ...]` ili reset na promjenu `subjectId`).
2. LB8: jedan registar `queryKey` fabrika u `lib/query/query-keys.ts`.
3. LB3: zajednički tipovi (`Tone`, `HorizontalBarItem`, `GroupDrawerTab`) u `lib/`, a komponente ih importuju; ne obrnuto.
4. LB4: hookovi u `hooks/` ili feature folderu; `lib/` bez React-a.
5. LB7: generički `mapApiError` sa mapom kodova; jedan modul za datume.
6. LB5: testovi za `use-ticket-list`, `use-sidebar-ticket-counts`, `use-dashboard-summary`.
7. LB6: ukloniti `as never` i `as unknown as` (zajedno sa modulom 10 i 14).

---

## Bugovi i neusklađenosti

| ID | Ozbiljnost | Nalaz | Lokacija |
|---|---|---|---|
| LB1 | Visoka | Odjava ne čisti query keš ni sidebar keš; ključevi nisu vezani za korisnika. Podaci prethodnog korisnika ostaju u memoriji do 5 min (gcTime) i ostaju na ekranu ako refetch padne. Potvrđeno čitanjem, nije reprodukovano u pregledaču. | `lib/session/use-session.ts` (`signOut`), `lib/query/query-client.ts`, `lib/tickets/use-sidebar-ticket-counts.ts` |
| LB2 | Srednja | 12 modulo-nivo `let` varijabli u 7 fajlova, većina bez reseta; teško testirati; MSAL instanca keširana u modulu. | `use-sidebar-ticket-counts.ts`, `active-timer-store.ts`, `branding-store.ts`, `settings-realtime-store.ts`, `announcer.ts`, `document-title.ts`, `entra-redirect.ts` |
| LB3 | Srednja | `lib` uvozi tipove iz `components` (`BadgeTone`, `HorizontalBarItem`, `GroupDrawerTab`) u 8 fajlova. | `changes/change-view.ts`, `config-versions/config-version-display.ts`, `ops/ops-health-view.ts`, `privacy/privacy-view.ts`, `problems/problem-view.ts`, `queue/integration-job-badge-tone.ts`, `reports/csat-view.ts`, `groups/use-groups-panel-actions.ts` |
| LB4 | Srednja | 55 hookova u `lib/`; 103 fajla sa value importom iz `services`. | `lib/**/use-*.ts` |
| LB5 | Srednja | Kritični hookovi bez testova. | `lib/tickets/use-ticket-list.ts`, `lib/tickets/use-sidebar-ticket-counts.ts`, `lib/dashboard/use-dashboard-summary.ts` |
| LB6 | Srednja | `as unknown as` za WebAuthn opcije bez runtime provjere; `as never` u dva wrapper-a `t()`. | `webauthn/passkey-ceremony.ts:91,107`, `charts/chart-summary.ts:41`, `tickets/ticket-text.ts:8` |
| LB7 | Srednja | 28 `map-*-error` fajlova sa istim obrascem; 19 `Intl.DateTimeFormat` poziva u 10 fajlova; direktni `Date.now()`. | `lib/**/map-*-error.ts`, `lib/**` (datumi) |
| LB8 | Srednja | 18 inline `queryKey: [...]`, 62-linijski `query-keys.ts` bez registra. | `lib/query/query-keys.ts` i pozivi u `components/` |
| LB9 | Niska | 210 komentara sa oznakama plana i revizija. | `lib/**` |
| LB10 | Niska | Prevodi audit akcija u TS fajlu; treba provjeriti pokrivenost JSON-a. | `lib/audit/audit-log-i18n.ts` |
| LB11 | Niska | Veliki fajlovi (472, 438, 322, 310, 308 linija). | vidi tabelu u gap analizi |

---

## Ocjena: 6/10

Obrazloženje:
- **Plus:** nema `any`, `@ts-ignore`, `console.*` ni praznih `catch` blokova; dobra zaštita od open redirecta; dokumentovan query klijent; ubrizgan sat u dijelovima koda; 171 spec fajl.
- **Minus:** LB1 je bezbjednosno pitanje na nivou cijele aplikacije; `lib/` mješa čiste funkcije, hookove i stanje; zavisnosti prema `components` idu u pogrešnom smjeru; mnogo ponavljanja (mapiranje grešaka, datumi); kritični hookovi bez testova.

---

## Must-Have kandidati (modul 13)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **LB1:** `signOut` čisti query keš i sidebar keš; test da korisnik B ne vidi podatke korisnika A nakon odjave (u jsdom ili e2e sa dvije sesije).
2. **LB8:** centralni registar query ključeva, po mogućnosti vezan za korisnika.
3. **LB3:** zajednički tipovi u `lib/`; zabrana importa iz `components` u `lib/` (ESLint `no-restricted-imports`).
4. **LB6:** zamijeniti `as never` i `as unknown as` (`TFunction`, runtime guard za WebAuthn opcije).
5. **LB5:** testovi za `use-ticket-list`, `use-sidebar-ticket-counts`, `use-dashboard-summary`.
6. **LB7:** generički `mapApiError` i jedan modul za datume.
7. **LB2:** reset funkcije za singleton stanje i ubrizgan sat u preostale helpere.
8. **LB4:** hookovi u `hooks/` (postepeno, po domenu).
9. **LB9, LB10, LB11:** čišćenje komentara, provjera i18n pokrivenosti audit labela, razbijanje velikih fajlova.

---

## Status ispravki (2026-10-13)

Nijedna ispravka u ovom modulu nije urađena. Pravilo iz sesije: ispravke se rade tek nakon završetka auditnog ciklusa i potvrde obima.
