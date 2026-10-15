# Modul 6: Assets, problems i changes

Datum zatvaranja: 2026-10-15
Val: **6.1.6**
Status: **zatvoren**

## Trenutna implementacija (nakon vala 6.1.6)

- Assets, problems i changes koriste zajednički capability gate koji razlikuje loading, setup, disabled, forbidden, query error sa retry akcijom i ready stanje.
- Zajednički resolver stanja liste garantuje da se API greška i prazno stanje ne prikazuju istovremeno.
- Assets filteri su u URL-u i prolaze kroz tip-guard parsere; promjena filtera čisti bulk izbor.
- Licence i ugovori koriste standardni `ConfirmDialog` sa `intent="danger"`; tri kritična delete toka koriste zajednički mutation lifecycle.
- Tri registra koriste zajedničke debounce, capability, list-state i mutation helpere bez jedne monolitne stranice.
- Problem query keys su objedinjeni, detalji se invalidiraju ciljano, starost se osvježava periodično i pri fokusu, a status sheet više ne zavisi od identiteta transition niza.
- Realtime nije dodat: postojeći React Query refresh/focus i version-conflict model ostaju namjerna granica ovog vala.

## Konačni status nalaza R1–R20

| Nalaz | Status | Zaključak |
|---|---|---|
| R1 | Urađeno | Odvojeni disabled, forbidden, setup i capability error+retry tokovi za sva tri registra. |
| R2 | Urađeno | Shared list-state resolver daje prioritet grešci nad empty stanjem; pokriven testom. |
| R3 | Urađeno | Promjena bilo kojeg assets filtera čisti izbor; unit i E2E izvor testa dodani. |
| R4 | Urađeno | Licence i contracts koriste danger `ConfirmDialog`; uklonjen `window.confirm`. |
| R5 | Urađeno | `useEntityMutation` uveden i primijenjen na delete asset/licence/contract tokove. Preostale ručne mutacije nisu dio kritične migracije ovog vala. |
| R6 | Urađeno | Shared capability gate i list-state infrastruktura koriste sva tri registra; zadržane su domenske tabele i filteri u manjim lokalnim sklopovima umjesto monolita. |
| R7 | Urađeno | Assets search/type/status/unit/location/source/warranty/unassigned filteri su u URL-u, sa parser specovima. |
| R8 | Urađeno | `useDebouncedValue` dijele sva tri registra; postojeća normalizacija i 300 ms ponašanje ostali su isti. |
| R9 | Prihvaćen rizik (2026-10-15) | Velike katalog/form komponente nisu mehanički razlomljene jer bi val bez vlasničke odluke o form biblioteci povećao regresioni rizik. Odbijena alternativa: uvođenje `react-hook-form` ili široki split bez posebnog funkcionalnog testa. |
| R10 | Urađeno | Reset status sheeta zavisi od stabilnog statusa/prvog transition ključa; eslint-disable je uklonjen. |
| R11 | Urađeno | `nowMs` se osvježava svake minute i pri browser fokusu. |
| R12 | Urađeno | Greške options/catalog queryja prikazuju se uz registre umjesto tihog trajno-disabled create dugmeta. |
| R13 | Urađeno | Assets URL enum vrijednosti prolaze tip-guard parser; postojeći problem/change parseri ostaju domen-specifični. |
| R14 | Prihvaćen rizik (2026-10-15) | Postojeći `AssetMoveSubject.assetIds` eksplicitno nosi bulk ID-eve, a fallback `id` ostaje radi single-asset kompatibilnosti. Odbijena alternativa: breaking discriminated-union migracija svih sheet call siteova bez funkcionalne koristi u ovom valu. |
| R15 | Prihvaćen rizik (2026-10-15) | Preostali index ključevi predstavljaju statične/agregirane ili uređivačke redove bez stabilnog server ID-a. Odbijena alternativa: sadržajni ključevi koji mogu kolidirati i gubiti input stanje. |
| R16 | Urađeno | `problemQueryKeys` je jedina grupa ključeva; svi call siteovi migrirani. |
| R17 | Urađeno | Asset/problem detail refresh invalidira detalj, pogođene podresurse i list prefiks, ne cijeli modul. |
| R18 | Prihvaćen rizik (2026-10-15) | Istorijski Paket/§ komentari ostaju bez runtime uticaja; masovno brisanje komentara je odbijeno kao review-noise bez korisničke vrijednosti. |
| R19 | Urađeno | Dodani testovi capability matrice, error-vs-empty, URL parsera, selection reseta i danger ConfirmDialog toka. |
| R20 | Prihvaćen rizik (2026-10-15) | E2E izvori prošireni za capability network error i skriveni bulk izbor, ali nisu izvršeni; licence delete je pokriven unit ConfirmDialog tokom. Odbijeno je lažno označavanje neizvršenog browser toka kao zelenog. |

## Završne provjere

- `npm run lint`: prošao, 0 grešaka; postojeća upozorenja su evidentirana (nakon R10 nema novog suppression komentara).
- `npm run format:check`: prošao.
- `npx tsc -b`: prošao kroz build.
- `npm test`: **233 fajla / 974 testa**, sve prošlo.
- `npm run build`: prošao; ostaje postojeće Vite upozorenje za velike chunkove.
- Fokusirani testovi: capability gate, list-state, assets URL parser, selection reset i ConfirmDialog prošli.
- E2E/browser: **nisu izvršeni** u ovom zatvaranju; `23` i `24` izvori su prošireni. Licence-delete browser scenario nije dodat zbog zavisnosti od seeded licence podataka; danger flow je unit-testiran.
- Realtime: istraživanjem zaključeno da nije potreban u valu 6.1.6; verzionisanje, ciljane invalidacije i focus refresh pokrivaju prihvaćeni model konzistentnosti.

## Polazno stanje (arhiva)

Sljedeći sadržaj je originalni audit od 2026-10-13 i čuva se kao arhiva; formulacije „trenutno“ ispod odnose se na stanje prije vala 6.1.6.

## Modul

**Assets (CMDB), problems i changes** su tri modula za upravljanje uslugama. Obuhvataju:
- **Sredstva (assets):** registar sa filterima i masovnim akcijama (dodjela, vraćanje), detalj sredstva (pregled, relacije, transferi, licence, ugovori, istorija, uticaj), „Moja oprema“, katalog tipova i lokacija, uvoz i izvoz, sinhronizacija sa direktorijem.
- **Problemi:** registar sa filterima i stranicama kursora, detalj (status, analiza, veze sa tiketima, članci baze znanja, rješavanje povezanih tiketa), kreiranje.
- **Promjene (change management):** registar sa tabovima (registar, kalendar, šabloni), detalj (uslovi, konflikti sa drugim promjenama, odobrenja glasanjem, istorija), kreiranje i izmjena sa provjerom konflikata u vremenu.

Granica modula: `pages/assets-page.tsx`, `pages/asset-detail-page.tsx`, `pages/my-assets-page.tsx`, `pages/problems-page.tsx`, `pages/problem-detail-page.tsx`, `pages/changes-page.tsx`, `pages/change-detail-page.tsx`, `components/assets/` (16), `components/problems/` (12), `components/changes/` (10), `lib/assets/`, `lib/problems/`, `lib/changes/`, `services/assets-api.ts`, `services/problems-api.ts`, `services/changes-api.ts`, `services/asset-transfers-api.ts`. Rute: `/assets`, `/assets/:assetId`, `/my-assets`, `/problems`, `/problems/:problemId`, `/changes`, `/changes/:changeId`.

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/assets-page.tsx` | Registar sredstava, tabovi (register, overview, transfers, licenses, contracts, import, catalog) | 536 |
| `frontend/src/pages/asset-detail-page.tsx` | Detalj sredstva, tabovi, brisanje (ConfirmDialog) | 499 |
| `frontend/src/pages/my-assets-page.tsx` | „Moja oprema“ za prijavljenog korisnika | 152 |
| `frontend/src/pages/problems-page.tsx` | Registar problema (filteri u URL-u) | 358 |
| `frontend/src/pages/problem-detail-page.tsx` | Detalj problema | 298 |
| `frontend/src/pages/changes-page.tsx` | Registar promjena (filteri u URL-u, tabovi) | 421 |
| `frontend/src/pages/change-detail-page.tsx` | Detalj promjene, konflikti, odobrenja | 396 |
| `frontend/src/components/assets/` (16) | Paneli, sheetovi, katalog, licence, ugovori, uvoz, transferi | ukupno oko 5.000 |
| `frontend/src/components/problems/` (12) | Analiza, veze, status, dijalozi za povezivanje, rješavanje tiketa | ukupno oko 2.000 |
| `frontend/src/components/changes/` (10) | Forma, akcije, odobrenja, kalendar, konflikti, šabloni | ukupno oko 2.300 |
| `frontend/src/lib/assets/` (7 uključujući spec) | `asset-view.ts` (mapiranje grešaka, statusi, garancija), bulk plan, transferi | 310 + ostalo |
| `frontend/src/lib/problems/problem-view.ts` | Mapiranje grešaka, statusi, starost | 213 |
| `frontend/src/lib/changes/` | `change-view.ts` (greške, konflikti, akcije), `change-calendar.ts` | 293 + ostalo |
| `frontend/src/services/assets-api.ts` | HTTP i `assetQueryKeys` | 901 |
| `frontend/src/services/problems-api.ts` | HTTP i `problemQueryKeys`, `problemDetailKeys` | 465 |
| `frontend/src/services/changes-api.ts` | HTTP i `changeQueryKeys` | 445 |
| `frontend/src/services/asset-transfers-api.ts` | Transferi sredstava | |
| `frontend/src/components/ui/confirm-dialog.tsx` | Standardni dijalog za potvrdu (koristi se u 4 mjesta) | |
| `e2e/tests/23`–`28` (assets), `29`–`30` (problems), `31`–`32` (changes) | E2E tokovi | 10 fajlova, 23 testa |

---

## Trenutna implementacija

**Struktura stranica.** Svaka lista ima istu logiku: prvo se učita mogućnost (`capabilities`) za modul, zatim se provjeri da li je modul uključen, da li postoji `setupRequired`, da li korisnik može čitati, i tek onda se prikaže sadržaj. Ovo je u sva tri modula (`assets-page.tsx:83–106`, `problems-page.tsx:138–169`, `changes-page.tsx:157–185`).

**Filteri.** Registar problema i promjena čuva filtere u URL-u (`problems-page.tsx:60–69`, `changes-page.tsx:78–80`). Registar sredstava čuva ih u lokalnom stanju (`assets-page.tsx:153–161`). Pretraga se odlaže za 300 ms u sva tri (`assets-page.tsx:169–172`, `problems-page.tsx:73–76`, `changes-page.tsx:91–94`).

**Liste.** Tabela sa `caption` (sr-only), `aria-live` brojačem, „Učitaj više“ (kursor), `EmptyState` sa razlikom između „nema rezultata“ i „nema podataka“ (`assets-page.tsx:404–409`). Greška se mapira kroz `mapAssetError`, pa `mapApiError` (`assets-page.tsx:370–374`).

**Masovne akcije.** Registar sredstava ima odabir više stavki (`assets-page.tsx:165`). Plan se računa iz odabira (`bulk-move`), a akcije su dodjela i vraćanje (`:376–400`, `:503–520`).

**Mutacije.** Većina mutacija je ručna: `busy` stanje, `try/catch`, `toast` i zatim `invalidateQueries` (21 fajl). `useMutation` je u 6 fajlova.

**Verzije i konflikti.** Promjene, problemi i sredstva šalju `version` pri izmjeni i glasanju (`changes-api.ts:245`, `:346`). Konflikt verzije ima poseban ključ greške (`CHANGE_VERSION_CONFLICT`, `PROBLEM_VERSION_CONFLICT`, `ASSET_VERSION_CONFLICT`). Forma promjene provjerava konflikte u vremenu, sa debounce-om (`change-form-sheet.tsx:152–163`).

**Odobrenja promjena.** Odbijanje glasa traži komentar (`change-approvals-panel.tsx:51–54`). Odobravanje se šalje odmah.

**Brisanje.** Brisanje sredstva koristi `ConfirmDialog` (`asset-detail-page.tsx:263–278`). Brisanje licence i ugovora koristi `window.confirm` (`asset-licenses-panel.tsx:577`, `asset-contracts-panel.tsx:489`).

**Osvježavanje detalja.** Detalj problema i promjene osvježava se invalidacijom prefiksa (`problemQueryKeys.all`, `changeQueryKeys.all`). Nema realtime osvježavanja u ovim modulima (`grep realtime`: 0 pogodaka).

**Testovi.** 7 spec fajlova, svi za helpere (`asset-view`, `asset-bulk-move`, `asset-transfer-view`, `change-view`, `change-calendar`, `problem-view`, `problem-resolve-tickets-section`). E2E: 10 fajlova i 23 testa (registar, transferi, pristup, uvoz i izvoz, katalog, problemi, promjene, zakazivanje).

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Greške učitavanja | Pad mreže ili 500 na mogućnostima prikazuje „modul je isključen“ (assets, problems, changes). Samo „Moja oprema“ razlikuje greške (`my-assets-page.tsx:41–50`) | Tri stanja: isključeno, nema pristupa, greška sa dugmetom „pokušaj ponovo“ |
| Greška i prazno stanje | Ispod greške se prikazuje i „nema sredstava/problema/promjena“ | Ili greška, ili prazno stanje |
| Odabir u registru sredstava | Ostaje pri promjeni filtera. Masovna akcija radi nad skrivenim stavkama | Odabir se čisti pri promjeni filtera, ili se jasno prikazuje koliko je stavki van prikaza |
| Filteri | Sredstva: lokalno stanje (nije u URL-u). Problemi i promjene: URL | Isto za sve tri liste (URL) |
| Brisanje | Jedno mjesto sa `ConfirmDialog`, dva sa `window.confirm` | Jedan dijalog za sve |
| Mutacije | 6 fajlova `useMutation`, 21 ručno | Jedan obrazac (`useMutation` sa zajedničkim `onError` i invalidacijom) |
| Liste | Tri gotovo ista sklopa (oko 300 linija po stranici) | Zajednička ljuska liste: mogućnosti, filteri, tabela, kursor, greška, prazno stanje |
| Osvježavanje | Samo ručno i nakon vlastitih akcija. Konflikt verzije se prikazuje tek pri snimanju | Kao u tiketima: realtime ili bar osvježavanje pri fokusu, uz baner „podaci su promijenjeni“ |
| Testovi | Helperi pokriveni. Stranice, paneli i sheetovi nemaju unit testove. E2E tokovi dobri | Testovi za stanja mogućnosti i za matricu prava |

---

## Gap analiza

1. **Pogrešna poruka pri grešci.** Korisnik koji ima pad mreže vidi „modul nije uključen“. To može da navede admina da pomisli da je modul ugašen, a ne da je server nedostupan. Uzrok je spajanje `error` i `!enabled` u jedan `if` (`assets-page.tsx:91`, `problems-page.tsx:154`, `changes-page.tsx:173`).
2. **Greška i prazno stanje istovremeno.** Kad lista padne, prikazuje se greška i ispod nje „nema sredstava“. Za korisnika to izgleda kao da podataka nema.
3. **Skriveni odabir.** Odabir u registru sredstava se čuva kad se filter promijeni. Traka pokazuje „N odabrano“, ali stavke nisu vidljive. Masovna dodjela ili vraćanje može da zahvati stavke koje korisnik ne vidi.
4. **Dva stila dijaloga za brisanje.** `window.confirm` nije u skladu sa ostatkom aplikacije, ne može se stilizovati i u testovima traži poseban rad.
5. **Filteri nisu u URL-u za sredstva.** Ne može se poslati link na filtrirani registar, niti vratiti nazad sa istim filterima. Ovo je isti problem kao D1 u modulu 4.
6. **Duplikacija.** Tri liste imaju isti skelet, četiri lokalna debounce hooka i osam ručnih `setTimeout` tajmera. Svaka ispravka mora da se radi tri puta.
7. **Ručne mutacije.** Većina mutacija ponavlja `busy/try/catch/toast/invalidate`. Greške se ne mapiraju uvijek jednako.
8. **Velike komponente.** `asset-catalog-manager.tsx` (693 linija, 29 stanja), `change-form-sheet.tsx` (454 linija, 26 stanja u jednoj funkciji), `asset-licenses-panel.tsx` (593, 25 stanja). Nema biblioteke za forme. Stanje se vodi ručno.
9. **Osvježavanje.** Dva korisnika mogu raditi nad zastarjelim podacima bez upozorenja. Verzija hvata konflikt tek pri snimanju.

---

## Mišljenje tima i preporuka

*Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima.*

Ovaj modul je tehnički solidan. Verzioniranje i konflikti su dobro urađeni, odbijanje glasa traži komentar, a e2e pokrivenost tokova je dobra (23 testa). Glavni problemi su u **korisničkom iskustvu grešaka** i u **dupliciranju** između tri liste. Prvo treba popraviti poruke (R1, R2), jer su najvidljivije, a zatim skriveni odabir (R3), koji je najrizičniji. Dupliranje treba riješiti tek poslije testova, da se ne bi ponovo pojavili isti bugovi.

Preporuka za redoslijed:
1. **R1 i R2:** razdvojiti „isključeno“, „nema pristupa“ i „greška“, po uzoru na `my-assets-page.tsx`. Greška ne smije biti praćena praznim stanjem.
2. **R3:** odabir se čisti pri promjeni filtera, ili se prikazuje koliko je stavki odabrano van prikaza. Dodati test.
3. **R4:** zamijeniti dva `window.confirm` sa `ConfirmDialog`.
4. **R7:** filteri registra sredstava u URL-u, kao kod problema i promjena.
5. **R20:** testovi za stanja mogućnosti i za tok brisanja, prije refaktora.
6. **R6, R8, R5:** zajednička ljuska liste i zajednički hook za debounce i mutacije. Tek poslije testova iz tačke 5.
7. **R9:** podijeliti velike komponente, prvo `asset-catalog-manager.tsx` i `change-form-sheet.tsx`.

Refaktor se ne radi bez potvrde obima.

---

## Otkriveni bugovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Predložena popravka |
|---|---|---|---|---|
| R1 | Srednja | `pages/assets-page.tsx:91`; `pages/problems-page.tsx:154`; `pages/changes-page.tsx:173` | `error` i `!enabled` su u istom uslovu. Greška učitavanja se prikazuje kao „modul je isključen“, bez dugmeta za ponovni pokušaj. `my-assets-page.tsx:41–50` to već razlikuje. | Tri stanja: `enabled === false` (isključeno), `canRead === false` (nema pristupa), `error` (greška + „pokušaj ponovo“). |
| R2 | Srednja | `pages/assets-page.tsx:370–409`; `pages/problems-page.tsx:260–273`; `pages/changes-page.tsx:328–336` | Kad lista padne, prikazuje se greška i ispod nje `EmptyState` („nema sredstava“, „nema problema“). | `items.length === 0` samo kad nema greške. |
| R3 | Srednja (za provjeru) | `pages/assets-page.tsx:165, 203, 225, 376–400` | Odabir se ne čisti pri promjeni filtera. `bulkPlan` se računa iz svih odabranih (`[...selected.values()]`). Stavke van prikaza se mogu dodijeliti ili vratiti. | Čistiti odabir pri promjeni filtera, ili prikazati „N odabrano, M van prikaza“. |
| R4 | Srednja | `components/assets/asset-licenses-panel.tsx:577`; `components/assets/asset-contracts-panel.tsx:489` | Brisanje koristi nativni `window.confirm`. Ostatak aplikacije koristi `ConfirmDialog` (`asset-detail-page.tsx:263`). | `ConfirmDialog` sa `intent="danger"`, kao kod sredstva. |
| R5 | Srednja | 21 fajl sa `setBusy`/`setSaving`/`setPending` (npr. `components/changes/change-form-sheet.tsx`, `components/assets/asset-action-sheets.tsx`) | Mutacije se rade ručno u 21 fajlu, a `useMutation` se koristi u 6. Greške i osvježavanje se rade različito (`refresh()`, `invalidateQueries` sa `all`, ručni `load`). | Jedan obrazac: `useMutation` sa zajedničkim `onError` (mapiranje greške) i invalidacijom po ključu. |
| R6 | Srednja | `pages/assets-page.tsx`, `pages/problems-page.tsx`, `pages/changes-page.tsx` | Tri liste dijele skelet (mogućnosti, filteri, tabela, kursor, greška, prazno stanje). Oko 300 linija po stranici se ponavlja. | Zajednička ljuska `EntityListPage` sa konfiguracijom (kolone, filteri, ključevi). |
| R7 | Srednja | `pages/assets-page.tsx:153–161` | Filteri registra sredstava su u lokalnom stanju. Problemi i promjene koriste URL (`problems-page.tsx:60–69`, `changes-page.tsx:78–80`). Link na filtrirani registar nije moguć. Ista klasa problema kao D1 u modulu 4. | Filteri u URL-u, kao u problemima. |
| R8 | Niska | `components/assets/asset-contracts-panel.tsx:46`; `asset-licenses-panel.tsx:50`; `components/changes/change-link-pickers.tsx`; `components/problems/problem-links-panel.tsx`; `pages/assets-page.tsx:170`; `pages/problems-page.tsx:74`; `pages/changes-page.tsx:93`; `components/assets/asset-action-sheets.tsx:173`; `components/assets/asset-relations-panel.tsx:228`; `components/assets/asset-signatory-sheet.tsx:41` | Debounce je napisan 4 puta kao lokalni hook i 8 puta kao ručni `setTimeout`. Ponašanje se razlikuje (neki traže minimalnu dužinu, neki ne). | Zajednički `useDebouncedValue` u `lib/`. |
| R9 | Srednja | `components/assets/asset-catalog-manager.tsx` (693); `components/changes/change-form-sheet.tsx` (454); `components/assets/asset-licenses-panel.tsx` (593); `components/assets/asset-contracts-panel.tsx` (505) | Velike komponente sa 21–29 `useState` poziva. Forme su ručne, a biblioteka za forme (`react-hook-form`) nije u projektu. | Podijeliti po sekcijama; za forme razmotriti zajedničku odluku o biblioteci (traži odobrenje). |
| R10 | Niska (za provjeru) | `components/problems/problem-status-sheet.tsx:49–58` | Efekat resetuje unos (razlog, poruka) kad se promijeni `targets` (`problem.allowedTransitions`). Novi niz se dobija pri svakom osvježavanju podataka. ESLint pravilo je isključeno komentarom (`:57`). Trenutno nema realtime osvježavanja, pa je rizik mali. | Zavisnost od stabilnog ključa (npr. `problem.status`), a ne od niza. Ukloniti `eslint-disable`. |
| R11 | Niska | `pages/problems-page.tsx:70` | `nowMs` se uzima pri mountu, pa se „starost problema“ ne ažurira dok stranica stoji otvorena. | Ažurirati pri fokusu ili periodično. |
| R12 | Niska | `pages/assets-page.tsx:174–175, 286`; `pages/problems-page.tsx:129` | Dugme „Novi“ je onemogućeno dok katalog ili opcije nisu učitani. Ako učitavanje ne uspije, dugme ostaje onemogućeno bez poruke. | Prikazati grešku uz dugme. |
| R13 | Niska | `pages/assets-page.tsx:62–63, 79, 310, 352`; `pages/problems-page.tsx:64` | Parsiranje URL-a i vrijednosti selecta sa `as` konverzijom. Prioritet problema koristi tipove prioriteta tiketa (`ticketPriorityValues`), pa je domen povezan. | Tip-garda kao u `parse-admin-tab.ts` (modul 5). Zajednički tip prioriteta ili odvojen za probleme. |
| R14 | Niska | `pages/assets-page.tsx:508, 515` | Masovni sheet prima oblik za jedno sredstvo sa `id: bulkPlan.ids[0]`. Lako je pogriješiti pri korišćenju. | Odvojiti prop za masovnu akciju (`assetIds`). |
| R15 | Niska | `components/assets/asset-overview-panel.tsx:195–197`; `components/assets/asset-transfer-section.tsx:90`; `components/problems/problem-analysis-panel.tsx:105, 152` | `key={index}` za redove. Za statične liste je prihvatljivo, ali je nedosljedno sa ostatkom koda. | `key` iz podataka gdje postoji. |
| R16 | Niska | `services/problems-api.ts:114–122, 247–258` | Dvije grupe ključeva za isti modul: `problemQueryKeys` (`all: ["problems"]`) i `problemDetailKeys` (lista, mogućnosti, detalj). Radi zbog prefiksa, ali je zbunjujuće. | Jedna grupa ključeva po modulu. |
| R17 | Niska | `pages/problem-detail-page.tsx:48`; `pages/asset-detail-page.tsx:74–76` | Osvježavanje invalidira cijeli modul (`["problems"]`, `["assets"]`), uključujući liste i katalog. Radi, ali je preširoko. | Invalidirati samo detalj i listu koja je pogođena. |
| R18 | Niska | `components/problems/`, `components/changes/`, `components/assets/` | Oko 43 fajla sa oznakama „Paket …“ ili „§“ u komentarima, 57 pojavljivanja u ovom modulu. Isti problem kao S12 u modulu 5. | Prebaciti u commit poruke ili dokumentaciju. |
| R19 | Srednja | `components/assets`, `components/problems`, `components/changes` (sve komponente osim helpera) | Nema unit testova za stranice, panele i sheetove. Testovi su samo za helpere (7 fajlova). | Testovi za stanja mogućnosti (isključeno, nema pristupa, greška, prazno), za matricu prava i za tok brisanja. |
| R20 | Srednja | `e2e/tests/23`–`32` | E2E pokriva tokove (23 testa), ali ne pokriva greške učitavanja, skriveni odabir, ni brisanje licence i ugovora. | Dodati e2e za: pad mreže na mogućnostima, odabir pa promjena filtera, brisanje licence. |

**Pozitivno (ne ulazi u bodove):** verzioniranje sa `version` i poseban ključ greške za konflikt; odbijanje glasa traži komentar; `ConfirmDialog` za brisanje sredstva; `aria-live` na brojaču; `caption` sr-only na svim tabelama; razlika između „nema rezultata“ i „nema podataka“; „Moja oprema“ dobro razlikuje greške; provjera konflikata u vremenu u formi promjene (debounce i pregled); e2e pokrivenost tokova; mapiranje grešaka u ključeve prijevoda.

---

## Ocjena: 6/10

**Obrazloženje:** Modul je tehnički solidan. Verzioniranje, konflikti, provjere u formama i e2e tokovi su dobro urađeni. Nema kritičnih bugova. Bodovi se oduzimaju zbog poruka pri grešci (R1, R2), skrivenog odabira (R3), dva različita dijaloga za brisanje (R4), duplikacije tri liste (R6, R8) i nedostatka unit testova za stranice (R19). Velike komponente i ručne mutacije (R5, R9) su održavajući problem, ali ne i ispravnost. Ocjena je viša od modula 5 jer nema kritične funkcije bez potvrde.

---

## Must-Have (za ovaj modul)

1. **R1 i R2:** tri stanja (isključeno, nema pristupa, greška sa „pokušaj ponovo“), bez praznog stanja uz grešku. Test za svako stanje.
2. **R3:** odabir se čisti pri promjeni filtera, ili se jasno prikazuje broj stavki van prikaza. Provjera u pregledaču prije ispravke.
3. **R4:** zamijeniti `window.confirm` sa `ConfirmDialog` (licence i ugovori).
4. **R7:** filteri registra sredstava u URL-u, kao kod problema i promjena.
5. **R19 i R20:** testovi za stanja mogućnosti i tok brisanja, i e2e za pad mreže i skriveni odabir. Prije bilo kakvog refaktora.
6. **R6, R8, R5:** zajednička ljuska liste i zajednički debounce hook, tek nakon tačke 5.

---

## Lista za ručnu provjeru u pregledaču

- **R1:** u DevTools → Network blokirati zahtjev za mogućnosti sredstava (`/assets/capabilities`) i otvoriti `/assets`. Očekivano: poruka „modul je isključen“ (potvrđuje R1). Isto za `/problems` (`/problems/capabilities`) i `/changes`.
- **R2:** blokirati zahtjev za listu (`/assets?…`) pri otvorenom registru. Provjeriti da li se ispod greške prikazuje „nema sredstava“.
- **R3:** na `/assets` označiti dva sredstva na prvoj stranici, promijeniti filter statusa, pa provjeriti da li traka i dalje pokazuje „2 odabrano“ i da li „Dodijeli“ radi nad njima.
- **R4:** na `/assets/:id` → Licence (ili Ugovori) → obrisati stavku. Uporediti izgled dijaloga sa brisanjem sredstva.
- **R7:** na `/assets` promijeniti filter tipa, pa kopirati URL i otvoriti ga u novom tabu. Očekivano: filter nije sačuvan.
- **R10:** nije lako reprodukovati, jer se osvježavanje podataka ne može pokrenuti dok je modalni dijalog otvoren. Potvrđeno samo čitanjem koda. Provjera: u DevTools-u (Network) usporiti zahtjev za detalj problema, pa dok je dijalog otvoren, u drugom tabu promijeniti status istog problema, i provjeriti da li se unos u prvom tabu obriše pri osvježavanju.
- **R12:** blokirati `/assets/options` i provjeriti da li je dugme „Novi“ onemogućeno bez poruke.
