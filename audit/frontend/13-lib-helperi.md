# Modul 13: `lib/` helperi

**Datum audita:** 2026-10-18
**Auditirani Git SHA:** `c7f717f46626cc8f887521be8f6072553420b987` (`origin/master`)
**Status:** v2 re-audit završen; kod nije mijenjan
**Oznake nalaza:** samo **LB**

> `lib/` je prevelik za pouzdano čitanje svakog fajla. Zaključci su zasnovani na potpunom inventaru i grep metrikama, ciljnom čitanju kritičnih tokova i izvršenju cijelog `src/lib` Vitest paketa. `lib/install/` je uključen u brojke, ali Install Wizard, Aurora i install E2E nisu predmet ovog audita.

---

## Modul

`frontend/src/lib/` danas sadrži četiri praktična sloja:

1. **čiste helpere i view-modele** — formatiranje, mapiranje API odgovora, validacija, query modeli;
2. **React hookove** — dohvat podataka, mutacije, realtime invalidacije i kompozicija ekrana;
3. **module-level storeove** — sesija, branding, timer, a11y announcer i realtime generation;
4. **query infrastrukturu** — zajednički `QueryClient`, fabrike ključeva i query opcije.

To nije strogo „pure helper“ folder: 75 `use-*` produkcijskih fajlova i 223 fajla sa importom iz `@/services` potvrđuju da `lib/` služi kao feature/application sloj. Zato „max full“ ne zahtijeva masovno preseljenje svih hookova u jednom sprintu; zahtijeva jasne granice, reset korisničkog stanja, centralne query ključeve, testove kritičnih hookova i odsustvo obrnutih zavisnosti prema komponentama.

---

## Povezani folderi

Inventar obuhvata `.ts` i `.tsx`, bez `*.spec.*` u koloni produkcije.

| Folder | Produkcijski fajlovi | Uloga |
|---|---:|---|
| `tickets/` | 78 | Liste/detalji tiketa, hookovi, prikaz i greške |
| `services/` | 24 | Katalog, forme i onboarding |
| `(root)` | 21 | Zajednički map/build/format helperi |
| `install/` | 21 | Install helperi uključeni samo u metrike |
| `realtime/`, `settings/`, `directory/` | 15 / 15 / 13 | Socket, postavke i imenik |
| `sla/`, `config-versions/`, `reports/`, `queue/` | 10 / 9 / 8 / 7 | Domenski view-modeli i hookovi |
| `session/`, `assets/`, `dashboard/` | 7 / 6 / 6 | Sesija, asseti i dashboard kompozicija |
| `docs/`, `knowledge-base/`, `templates/`, `time-tracking/`, `users/` | po 6 | Ostali feature helperi |
| `a11y/`, `auth/`, `groups/`, `shortcuts/`, `webauthn/` | 5 / 4 / 4 / 4 / 4 | Zajednička infrastruktura |
| Ostali podfolderi | 1–3 po folderu | Manji domenski slojevi |
| **Ukupno** | **346 produkcijskih + 205 spec fajlova** | **25.140 produkcijskih linija** |

Ključni fajlovi: `query/query-client.ts`, `query/query-keys.ts`, `session/use-session.ts`, `session/use-session-sync.spec.tsx`, `tickets/use-ticket-list.ts`, `tickets/use-sidebar-ticket-counts.ts`, `dashboard/use-dashboard-summary.ts`, `webauthn/passkey-ceremony.ts`, `charts/chart-summary.ts`, `auth/entra-redirect.ts` i `audit/audit-log-i18n.ts`.

---

## Trenutna implementacija

### Metrike

| Metrika | Re-audit 2026-10-18 |
|---|---:|
| Produkcijski fajlovi / linije | 346 / 25.140 |
| Spec fajlovi | 205 |
| `use-*` produkcijski fajlovi | 75; 20 imaju istoimeni spec |
| `map-*-error.ts` | 33 |
| Fajlovi / pojave importa `@/services` | 223 / 302 |
| Fajlovi / pojave importa `@/components` | 7 / 10 nakon implementacije tipnih granica |
| Importi `@/pages` ili `@/app` | 0 |
| Module-level `let` | 10 u 6 fajlova |
| `as never` / `as unknown as` | 2 / 1, sve u `charts/chart-summary.ts` |
| Sanctioned `console.*` | 2 u `app/client-logger.ts` |
| Prazni `catch {}` | 0 |
| Fazni/review komentari | 198 pojavljivanja u 99 fajlova |
| `new Intl.DateTimeFormat` | 16 poziva |
| Sirovi inline `queryKey: ["…"]` u produkcijskom `src/` | 0 nakon centralizacije; preostali array spreadovi proširuju postojeće fabrike |

### Session i query — promjena od starog audita

**LB1 je implementiran.** `clearUserScopedCache()` poziva `helpdeskQueryClient.clear()`, a koriste ga sva tri završetka sesije: eksplicitni `signOut`, `expireSession` i cross-tab storage logout. `use-session-sync.spec.tsx` dokazuje da ručna i cross-tab odjava uklanjaju query podatke. Stari sidebar singleton keš više ne postoji: `useSidebarTicketCounts` koristi zajedničke React Query opcije i mapira rezultat čistom funkcijom.

Query client zadržava dokumentovane default vrijednosti (`staleTime` 30 s, `gcTime` 5 min, jedan retry, bez focus refetcha). `query-keys.ts` je porastao na 67 linija i pokriva session, dashboard, ticket list/count/detail, catalog, settings, SLA i notifikacije. `currentSession(subjectId)` je user-scoped; većina ključeva nije, ali potpuni cache reset na svakoj odjavi zatvara potvrđeni cross-user leak.

### Kritični hookovi

- `use-ticket-list.ts` sada ima 484 linije i istoimeni spec sa 3 testa; koristi fabrike ključeva osim jedne prefix invalidacije `['tickets','counts']`.
- `use-sidebar-ticket-counts.ts` je tanak React Query adapter i ima 2 testa; stari TTL/in-flight singleton je uklonjen.
- `use-dashboard-summary.ts` ima 308 linija, fazni fetch i centralne query ključeve, ali nema istoimeni hook spec. Čisti pomoćni dijelovi (`compose-dashboard-summary`, volume loader, invalidacija) jesu testirani.

### TypeScript i sigurnost

`passkey-ceremony.ts` više nema dvostruke castove: prima `PublicKeyCredential*OptionsJSON` tipove direktno i ima 5 testova. Stari `ticket-text.ts` bypass više ne postoji. Preostali bypass je `chart-summary.ts`: runtime i18n ključ prolazi kroz dva `as never` i završni `as unknown as string` uprkos `TFunction` tipu.

`safeReturnPath` i dalje odbija protokol-relativne, login/callback, backslash i kontrolne putanje; ima 7 testova. Nema praznih catch blokova. Dva `console` poziva su svjesno centralizovana i lint-dokumentovana u `client-logger.ts`, umjesto rasuta kroz module.

---

## Definicija „max full“

- **LB1:** svaki put završetka sesije briše user-scoped cache i test dokazuje ručnu/cross-tab odjavu;
- **LB3:** `lib/` nema import iz `components`, uz lint granicu koja sprječava povratak;
- **LB8:** query ključevi i invalidacije koriste centralne domenske fabrike; nema novih sirovih ključeva;
- **LB5:** `use-ticket-list`, `use-sidebar-ticket-counts` i `use-dashboard-summary` imaju ciljane hook testove;
- **LB6:** nema `as never`/`as unknown as` i18n/WebAuthn prečica;
- **LB7:** mapiranje grešaka i datum formateri imaju zajedničke primitive, migrirane postepeno;
- LB4 se radi postepeno po domenu — masovna selidba svih hookova nije uslov za 10/10.

---

## Realno / željeno — samo otvoreno

| LB | Realno stanje | Željeno stanje |
|---|---|---|
| **LB2** | 10 module-level `let` varijabli u 6 fajlova; reset nije ujednačen. | Storeovi imaju reset/test isolation; vrijeme je ubrizgano gdje utiče na rezultat. |
| **LB3** | 7 lib fajlova imaju 10 importa iz components; zajednički `BadgeTone`, `HorizontalBarItem` i `GroupDrawerTab` premješteni su u neutralni `lib/ui/presentation-types.ts`, dok runtime hookovi i feature DTO tipovi ostaju. | Nula lib→components importa, zajednički tipovi u neutralnom sloju i lint zabrana. |
| **LB4** | 75 hookova i 223 service-dependent fajla u `lib/`. | Dokumentovana postepena feature/hooks granica, bez big-bang migracije. |
| **LB5** | Ticket list i sidebar imaju spec; dashboard hook nema direktan spec. | Tri kritična hooka imaju happy/error/filter ili cache ugovor. |
| **LB6** | WebAuthn i ticket-text su popravljeni; chart-summary ima 3 TS bypassa. | Tipizovan prevodni helper bez `as never`/`as unknown as`. |
| **LB7** | 33 error mappera i 16 konstrukcija date formattera. | Generički mapper i zajednički datetime API, migrirani pilotom. |
| **LB8** | Centralni registar pokriva sve ranije sirove literal ključeve; preostali `queryKey: [...factory(), version]` izrazi namjerno proširuju postojeće domenske fabrike. | Fabrike i invalidacije dijele isti ključ; lint/test sprječava nove inline ključeve. |
| **LB9** | 198 faznih/review oznaka u 99 fajlova. | Komentari objašnjavaju invariant i razlog, ne istoriju projekta. |
| **LB10** | Audit label registry ostaje 468-linijski TS sloj; pokrivenost lokalata nije zasebno pinovana uz njega. | Automatska bs/en provjera svih generisanih audit label ključeva. |
| **LB11** | Najveći fajlovi imaju 484, 410, 345, 328 i 308 linija. | Kritični hookovi/orchestratori razdvojeni oko projektne granice od 200 linija. |

---

## Gap analiza

### LB1 — zatvoren: cache se briše na svim izlazima

Stari visoki nalaz više nije tačan. Ručna odjava, expiry/401 i cross-tab logout pozivaju isti reset, testovi pune QueryClient pa dokazuju da podatak nestaje. Sidebar nema zaseban module cache. Browser sa dvije stvarne prijave nije reproduciran u ovom auditu, ali implementacijski i testni ugovor je direktan.

### LB2 — module singletoni

Ostaje 10 `let` varijabli u `announcer`, `document-title`, `entra-redirect`, `branding-store`, `settings-realtime-store` i `active-timer-store`. Dio ima reset ili konfiguracijski key; nalaz zato više nije uniformno „sve bez reseta“. Prioritet su test isolation i reset na identity promjeni, ne zabrana svakog module singletona.

### LB3 — obrnuta zavisnost je veća

Neutralni presentation contract smanjio je nalaz sa 20 na 7 fajlova. Preostale su stvarne UI zavisnosti (`useToast`, `Checkbox`) te feature tipovi iz tickets/templates/groups/install. Prvi mali korak je neutralni `lib/ui/tone.ts`; završetak zahtijeva izvlačenje React orkestratora iz `lib/` ili dependency inversion, zatim ESLint zabranu.

### LB4 — informativna arhitektura, ne jednokratna migracija

75 hookova potvrđuje da naziv `lib` više ne znači „pure“. Masovno premještanje bi proizvelo veliki import churn bez korisničke vrijednosti. Novi kod treba ići u feature/hooks sloj, a postojeći se pomjera samo uz funkcionalnu izmjenu ili cijepanje velikog fajla.

### LB5 — kritični testovi djelimično isporučeni

`use-ticket-list` i sidebar više nisu bez testa. Direktno je nepokriven `use-dashboard-summary`, gdje fazni Promise tok, silent invalidacija i lookup fallback nose najveći preostali hook rizik.

### LB6 — ostao samo chart i18n wrapper

WebAuthn više ne koristi `as unknown as`, a stari ticket wrapper je uklonjen. `chart-summary` i dalje zaobilazi i18next overload tri puta u jednom izrazu. Ovo treba rješavati zajedno sa modulom 14 kroz jedan tipizovan dynamic-key helper, ne novim lokalnim castom.

### LB7 — duplikati rastu

Broj `map-*-error` fajlova porastao je na 33; date formatter konstrukcije su i dalje rasute. Pilot treba obuhvatiti 2–3 mapera sa identičnim `ApiError.code` obrascem i jedan neutralni datetime modul. Masovna zamjena nije opravdana bez snapshot testova.

### LB8 — sirovi ključevi centralizovani (zatvoren)

`queryKeys` sada nosi problem, asset lookup/users/candidate i admin-security fabrike/prefikse, a ticket count invalidacija koristi postojeći prefiks. U produkcijskom `src/` nema sirovog `queryKey: ["…"]`; preostali array spreadovi dodaju version/search segment već postojećoj fabrici i nisu paralelni izvor ključa.

### LB9–LB11 — dug održavanja

Komentari su blago smanjeni, ali veliki orchestratori su narasli. `audit-log-i18n.ts` je i dalje 468 linija; najveći su `use-ticket-list` 484, `simple-markdown` 410, `asset-view` 345, `describe-ticket-activity` 328 i `use-dashboard-summary` 308. Cijepanje treba pratiti domensku odgovornost, ne proizvoljan broj linija.

---

## Master tabela LB1–LB11

| LB | Status | Dokaz |
|---|---|---|
| **LB1** | **Zatvoren** | Jedan `clearUserScopedCache()` za signOut, expiry i storage logout; QueryClient testovi; sidebar singleton uklonjen. |
| **LB2** | Djelimično | 10 module-level `let` u 6 fajlova; neki storeovi imaju reset/key, drugi ne. |
| **LB3** | Djelimično | Presentation tipovi su neutralizovani; ostaje 7 fajlova / 10 runtime ili feature-type importa. |
| **LB4** | Prihvaćen rizik / postepeno | 75 hookova; big-bang migracija nije cilj „max full“. |
| **LB5** | Djelimično | Ticket-list i sidebar hook imaju spec; dashboard hook nema. |
| **LB6** | Djelimično | WebAuthn i ticket-text zatvoreni; chart-summary ima preostala 3 casta. |
| **LB7** | Otvoren | 33 mapera; 16 `new Intl.DateTimeFormat` poziva. |
| **LB8** | **Zatvoren** | Svi sirovi literal ključevi prebačeni su u centralne fabrike; ostaju samo proširenja postojećih fabričkih ključeva. |
| **LB9** | Otvoren | 198 istorijskih/faznih oznaka u komentarima. |
| **LB10** | Otvoren | Nema zasebnog generator/coverage testa za audit label registry. |
| **LB11** | Otvoren | Pet reprezentativnih fajlova je 308–484 linije. |

---

## Roadmap do 10/10

### P0 — sigurnost i dokaz

1. LB1 je kodom zatvoren; dodati browser scenarij sa dvije stvarne sesije samo ako se radi auth E2E, bez ponovnog refaktora.
2. Dodati direktan `use-dashboard-summary` hook test za happy path, grešku i silent invalidaciju (**LB5**).

### P1 — granice i query disciplina

3. Premjestiti `BadgeTone` i chart item tipove u neutralni `lib/ui` sloj, zatim ukloniti preostale UI runtime importe iz `lib/` i uključiti lint zabranu (**LB3**).
4. Održavati zatvoreni LB8 pravilom da novi query i invalidacija uvijek koriste centralnu ili domensku fabriku.
5. Ukloniti chart i18n castove zajedničkim tipizovanim helperom usklađenim s modulom 14 (**LB6**).

### P2 — održavanje

6. Pilotirati generički error mapper na 2–3 mapera i neutralni datetime API na 1–2 potrošača (**LB7**).
7. Pri izmjeni storea dodati reset/test isolation; hookove i velike fajlove cijepati po odgovornosti, ne masovno (**LB2**, **LB4**, **LB11**).
8. Dodati provjeru audit label ključeva i uklanjati fazne komentare samo u dirnutim fajlovima (**LB9**, **LB10**).

---

## Ocjena

**8,0/10**

Najozbiljniji stari rizik je zatvoren: session reset je centralizovan, testiran i sidebar više nema paralelni cache. Testni inventar je narastao na 205 fajlova / 850 testova, a dva od tri kritična hooka sada imaju direktne specove. Ocjenu i dalje drže preostale runtime lib→components zavisnosti, nepokriven dashboard orchestrator, rast error mappera, chart TypeScript bypass i veliki fajlovi; query-key disciplina i neutralni presentation tipovi su značajno napredovali.

---

## Provjere izvršene

- [x] Inventar svih `.ts/.tsx`: **346 produkcijskih**, **205 spec**, **25.140 produkcijskih linija**.
- [x] Izmjereno 75 `use-*`, 33 `map-*-error`, 223 service-import fajla i 20 component-import fajlova.
- [x] Grepani module-level `let`, `as never`, `as unknown as`, `console`, prazni catch, fazni komentari, `Intl.DateTimeFormat` i inline `queryKey`.
- [x] Pročitani `use-session.ts`, session sync test, query client/keys, `use-sidebar-ticket-counts`, `use-ticket-list` i `use-dashboard-summary` ključni tokovi.
- [x] Pročitani `passkey-ceremony`, `chart-summary`, reprezentativni error mapper i `entra-redirect.safeReturnPath`.
- [x] Potvrđeni svi `helpdeskQueryClient.clear/removeQueries` i pozivi `signOut`/`expireSession`/storage handlera.
- [x] Inventarisani istoimeni hook specovi: 20/75; posebno potvrđeni ticket-list i sidebar, te odsutan dashboard hook spec.
- [x] `cd frontend && npx vitest run src/lib`: **205/205 fajlova, 850/850 testova prošlo**.
- [x] `cd frontend && npx tsc -b`: prošao bez greške.
- [ ] Browser reprodukcija sa dvije sesije nije rađena; LB1 je zatvoren implementacijom i jsdom cache testom.

## Status implementacije (2026-10-18)

- **LB3 djelimično:** `BadgeTone`, `HorizontalBarItem` i `GroupDrawerTab` sada žive u `lib/ui/presentation-types.ts`; lib→components je smanjen sa 20 na 7 fajlova. Preostali runtime hookovi/Checkbox i feature DTO tipovi traže premještanje React orkestratora, pa nisu maskirani lint izuzetkom.
- **LB8 zatvoren:** problem, asset i admin-security ključevi/invalidacije koriste centralne fabrike; ticket-count invalidacija koristi postojeći prefiks. Grep više ne nalazi sirovi produkcijski `queryKey: ["…"]`.
- **LB1 ostaje zatvoren:** session/query implementacija nije mijenjana. **LB6** ostaje djelimičan jer pokušaj sužavanja i18next funkcijskog potpisa izaziva TypeScript overload problem; nije uveden novi cast niti lokalna prečica.

## Status re-audita (2026-10-18)

Stara tvrdnja „293 fajla / 171 spec / ništa implementirano“ više nije tačna. LB1 je zatvoren, LB5/LB6/LB8 su djelimično napredovali, a dokument je prepisan prema trenutnom masteru.

**Predložena commit poruka:** `docs(audit): rewrite lib helpers module 13 review`
