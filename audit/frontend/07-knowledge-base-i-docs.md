# Modul 7: Baza znanja i dokumentacija

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena (čitanje koda i grep). Nijedan kod nije mijenjan. Ispravke čekaju odobrenje obima.
Oznake nalaza: **KB** (baza znanja i dokumentacija). Ovo se ne miješa sa A (modul 2), T (modul 3), D (modul 4), S (modul 5) i R (modul 6).

Provjere izvršene u sandboxu:
- Čitanje u cijelosti: `pages/docs-page.tsx` (224), `lib/docs/use-docs.ts` (138), `components/docs/docs-feedback.tsx` (63), `components/docs/docs-search.tsx` (88), `components/docs/docs-toc.tsx` (78), `components/docs/docs-sidebar.tsx` (91), `components/docs/docs-role-filter.tsx` (23), `components/docs/docs-help-button.tsx` (27), `pages/knowledge-base-page.tsx` (235), `pages/knowledge-article-detail-page.tsx` (102), `lib/knowledge-base/use-knowledge-article.ts` (57), `lib/knowledge-base/knowledge-lifecycle-actions.ts` (44), `lib/directory/use-directory.ts` (52), `lib/directory/load-directory.ts` (60), `components/knowledge-base/knowledge-article-delete-panel.tsx`, `components/knowledge-base/create-knowledge-article-sheet.tsx` (58).
- Čitanje dijelova: `components/knowledge-base/create-knowledge-article-form.tsx` (28–140), `components/knowledge-base/portal/knowledge-portal-home.tsx` (40–80), `components/knowledge-base/portal/knowledge-placement-card.tsx` (30–60), `components/knowledge-base/portal/article-from-reply-sheet.tsx` (60–115), `components/privacy/markdown-view.tsx` (50–80), `lib/privacy/simple-markdown.ts` (safeHref, safeImageSrc).
- Provjera backenda: `knowledge-base/review-knowledge-article.ts` (31), `create-knowledge-article.ts` (85), `knowledge-portal.service.ts` (~512–545), `knowledge-base-workflow.service.ts` (provjera prelaza).
- Metrike (grep): broj fajlova i `useState`; `useEffect` (31); tihi `catch` (4); `setTimeout` (3); `useMutation` (0); `window.confirm` (0); `any` (0); komentari „Paket“, „Faza“, „Val“, „M14“ (36 pojava, 21 u dokumentaciji).
- E2E: `e2e/tests/34-knowledge-portal.spec.ts` (2 testa). Za `/docs` nema nijednog e2e testa.
- Unit testovi: `lib/docs/` (4 spec fajla), `lib/knowledge-base/` (4 spec fajla). Nema testova za `use-docs.ts`, `docs-search`, `docs-toc`, `knowledge-base-page`, `knowledge-article-detail-page`.
- **Nije pokrenut pregledač.** Nalazi označeni sa „za provjeru“ treba potvrditi u pregledaču prije ispravke.
- **Nije pročitano u punom obimu:** `components/knowledge-base/portal/knowledge-categories-manager.tsx` (293), `knowledge-insights-panel.tsx` (144), `knowledge-star-rating.tsx` (173), `knowledge-portal-home.tsx` (ostatak), `knowledge-article-list.tsx` (206, samo struktura), `knowledge-article-detail-panel.tsx` (170, samo struktura), `knowledge-article-edit-form.tsx` (202, samo validacija), `create-knowledge-article-form.tsx` (1–27 i 140–239), `docs-pager.tsx`, `docs-breadcrumbs.tsx`, `docs-empty-state.tsx`, `lib/docs/docs-slug.ts`, `docs-audience.ts`, `docs-labels.ts`, `lib/knowledge-base/knowledge-portal.ts` (90), `filter-knowledge-articles.ts` (55), `map-knowledge-article-error.ts` (62), `services/knowledge-base-api.ts` (192), `services/knowledge-portal-api.ts` (182). `services/docs-api.ts` i `lib/docs/docs-local.ts` pročitani su ranije.

---

## Modul

Modul pokriva dva povezana dijela aplikacije:

- **Baza znanja (`/knowledge-base`, `/knowledge-base/:articleId`):** portal sa početnom stranicom (kategorije, popularni članci, ocjene), lista svih članaka sa filterima (pretraga, status, usluga, zastarjelo), detalj članka (sadržaj, životni ciklus: nacrt → pregled → objavljen → arhiviran, ocjena, brisanje sa razlogom), kreiranje članka, članak iz odgovora tiketa (sa automatskim uklanjanjem ličnih podataka), upravljanje kategorijama i uvid (insights) za kuratore.
- **Dokumentacija (`/docs`, `/docs/:slug`):** korisnički vodič u markdown formatu, sa lijevim navigacionim menijem, desnim sadržajem (TOC), pretragom sa isticanjem pogodaka, filterom po publici (korisnik, admin itd.), štampom, prevodom (bs/en) i kontekstualnim dugmetom „?“ u zaglavlju stranica.

Granica modula: `pages/docs-page.tsx`, `pages/knowledge-base-page.tsx`, `pages/knowledge-article-detail-page.tsx`, `components/docs/` (9), `components/knowledge-base/` (10 + `portal/` 7), `lib/docs/`, `lib/knowledge-base/`, `services/docs-api.ts`, `services/knowledge-base-api.ts`, `services/knowledge-portal-api.ts`. Zajednički dio: `lib/directory/` (koristi ga i modul 3).

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga | Linija |
|---|---|---|
| `frontend/src/pages/docs-page.tsx` | Stranica dokumentacije: navigacija, sadržaj, pretraga, filter publike | 224 |
| `frontend/src/pages/knowledge-base-page.tsx` | Portal, lista članaka, filteri, kreiranje | 235 |
| `frontend/src/pages/knowledge-article-detail-page.tsx` | Detalj članka, slanje pregleda (5 s ili 25% skrola) | 102 |
| `frontend/src/components/docs/` (9) | Sidebar, TOC, pretraga, feedback, pager, filter, dugme „?“ | 491 ukupno |
| `frontend/src/components/knowledge-base/` (10) | Lista, kreiranje, izmjena, detalj, brisanje | oko 1.900 |
| `frontend/src/components/knowledge-base/portal/` (7) | Početna, kategorije, ocjene, insights, članak iz odgovora, mjesto članka | oko 670 (bez `knowledge-categories-manager.tsx` i `knowledge-insights-panel.tsx`, koji nisu pročitani u punom obimu) |
| `frontend/src/components/privacy/markdown-view.tsx` | Prikaz markdowna kao React elemenata | 216 |
| `frontend/src/lib/privacy/simple-markdown.ts` | Parser markdowna, `safeHref`, `safeImageSrc` | 322 |
| `frontend/src/lib/docs/use-docs.ts` | Hookovi: navigacija, stranica, pretraga | 138 |
| `frontend/src/lib/docs/docs-local.ts` | `localStorage`: nedavno posjećeno, feedback (samo slugovi i da/ne) | 47 |
| `frontend/src/lib/knowledge-base/use-knowledge-article.ts` | Hook detalja članka | 57 |
| `frontend/src/lib/knowledge-base/knowledge-lifecycle-actions.ts` | Dozvoljene akcije po statusu (zrcali backend) | 44 |
| `frontend/src/lib/directory/use-directory.ts` i `load-directory.ts` | Imenik korisnika i organizacionih jedinica (6 stranica) | 52 + 60 |
| `frontend/src/services/docs-api.ts` | HTTP za navigaciju, stranicu, pretragu | 98 |
| `frontend/src/services/knowledge-base-api.ts` | HTTP za članke | 192 |
| `frontend/src/services/knowledge-portal-api.ts` | HTTP za portal, preglede, ocjene | 182 |
| `backend/src/modules/knowledge-base/` | Životni ciklus, dozvole, čišćenje ličnih podataka | — |
| `e2e/tests/34-knowledge-portal.spec.ts` | E2E za portal (2 testa) | 2 testa |
| `REVIEW_ANALIZA.md` | Dokumentovana odluka: feedback ostaje na uređaju | — |

---

## Trenutna implementacija

**Dokumentacija.** `DocsPage` koristi tri hooka iz `use-docs.ts`. `useDocsNavigation` učitava strukturu, `useDocsPage` učitava stranicu po slugu i jeziku, `useDocsSearch` radi pretragu sa debounce od 250 ms. `useDocsPage` i `useDocsSearch` imaju zaštitu od zastarjelih odgovora (`active` flag i `requestId`). Sadržaj stiže sa servera već filtriran po ulozi, a klijentski filter publike služi samo za prikaz. Markdown se renderuje kroz vlastiti parser (`simple-markdown.ts`) kao React elementi. Linkovi se propuštaju samo za `http(s)` i `mailto`, a slike samo za sigurne izvore (`safeHref`, `safeImageSrc`). Interni linkovi `/docs/...` idu kroz router. Feedback („Je li ovo pomoglo?“) i nedavno posjećene stranice čuvaju se samo u `localStorage` i ne šalju se serveru (odluka dokumentovana u `REVIEW_ANALIZA.md`).

**Baza znanja.** `KnowledgeBasePage` ima tri pogleda preko taba: portal (default), svi članci i uvid (samo kuratori). Jedini parametri u URL-u su `view` i `q`. Status, usluga i „zastarjelo“ su u lokalnom stanju. `loadArticles` se poziva na promjenu filtera i nakon kreiranja i ocjene. Detalj članka koristi `useKnowledgeArticle` i `KnowledgeArticleDetailPanel`. Pregled se šalje nakon 5 sekundi ili 25% skrola, najviše jednom po mountu. Lifecycle dugmad dolaze iz `knowledge-lifecycle-actions.ts`, a tabela je usklađena sa backendom: `review-knowledge-article.ts` dozvoljava approve iz `IN_REVIEW` i `PUBLISHED`, što je i u frontendu.

**Kreiranje i članak iz odgovora.** Forma se montira tek kad je sheet otvoren, pa podrazumijevane vrijednosti (usluga, organizaciona jedinica) uzimaju trenutne podatke. Članak iz odgovora tiketa prvo prikazuje pregled sa brojačima uklonjenih podataka (email, osoba, IP, telefon). Korisnik može da uredi tekst, a server ponovo čisti tekst pri upisu i bilježi dodatne izmjene u audit log. Članak se kreira kao `DRAFT` (`create-knowledge-article.ts` 85).

**Imenik.** `useDirectory` (koristi ga 6 stranica) poziva `loadDirectory`, koji prvo učitava stablo organizacionih jedinica, zatim za **svaku jedinicu** posebno učitava korisnike i spaja rezultate.

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Jezik dokumentacije | Navigacija ostaje na jeziku sa kojim je prvi put učitana (KB1) | Navigacija prati jezik kao i stranica |
| Race u listama | Lista članaka i detalj nemaju zaštitu od zastarjelih odgovora (KB2, KB3) | Isti obrazac kao u `useDocsPage` svuda |
| Greške | Greška kategorije se prikazuje kao „nema članaka“ (KB5); tihi `catch` u 4 mjesta | Greška se uvijek prikazuje, prazno stanje samo kad je odgovor uspješan |
| Imenik | N+1 zahtjeva po mountu, bez keša, nepotpun bez poruke (KB4) | Jedan endpoint ili keš, sa upozorenjem na djelimičan neuspjeh |
| URL stanje | `q` i `view` u URL-u, status, usluga i zastarjelo nisu | Svi filteri u URL-u, da se mogu dijeliti i vraćati Back dugmetom |
| Pristupačnost | Nema `aria-live` za broj rezultata; mobilni meni bez `aria-controls` (KB15, KB16) | Promjena rezultata se najavljuje čitaču ekrana |
| Testovi | `/docs` nema e2e; hookovi i komponente bez testova (KB17) | Smoke e2e za `/docs` i za članak; unit testovi za hookove |
| Komentari | „Faza 3 (c)“, „Val 5“, „Paket 2.9 (K1)“ u kodu (21 u dokumentaciji) | Komentar objašnjava zašto, bez oznaka plana |

---

## Gap analiza

1. **Jezik i navigacija (KB1).** Najvidljiviji bug u modulu. Nakon promjene jezika stranica sadržaja se učita na novom jeziku, ali lijevi meni ostaje na starom. Greška se vidi i pri ponovnom pokušaju učitavanja.
2. **Zastarjeli odgovori.** Dva hooka (`useKnowledgeArticle`, lista članaka na stranici baze znanja) nemaju zaštitu, a `useDocsPage` je ima. Ovo nije sigurnosni problem, ali može prikazati stari članak ili stari rezultat filtera.
3. **Greške koje izgledaju kao prazno stanje (KB5, KB6, KB14).** Korisnik ne zna da li je kategorija prazna ili je zahtjev pao.
4. **Imenik (KB4).** Svaka stranica sa `useDirectory` ponovo šalje N zahtjeva, uključujući detalj članka, koji treba samo ime vlasnika. Pri greškam na jednoj jedinici, imenik je nepotpun bez poruke, pa se imena vlasnika prikazuju kao prazna ili nepoznata.
5. **Gubitak stanja pri akciji (KB7).** Nakon promjene statusa članka cijeli panel se zamijeni skeletonom, pa se lokalno stanje panela gubi.
6. **Testovi.** Modul ima dobro pokriven `lib/` (pure funkcije), ali nema testa za stvari koje se najčešće kvare: prelazak između stranica, promjena jezika, pretraga i greške.
7. **Komentari i neusklađenost (KB9).** Komentar u kodu tvrdi da je članak iz odgovora „već objavljiv“, a kod ga kreira kao nacrt. Ovo može zbuniti onoga ko bude održavao tok objave.

---

## Mišljenje tima i preporuka

Modul je u boljem stanju od modula 5 i 6. Sigurnosni dio je dobro urađen: markdown parser ne propušta opasne linkove, sadržaj se filtrira na serveru, feedback ne sadrži identitet korisnika, a članak iz odgovora prolazi kroz pregled i dvostruko čišćenje. Problemi su uglavnom u obrascu: tri hooka rade isti posao na različite načine, greške se pretvaraju u prazna stanja, a imenik se učitava na način koji ne skalira.

Preporuka po redu:

1. **Odmah (mala ispravka, traži odobrenje):** KB1 u `use-docs.ts` (`useCallback` zavisnost `[locale]`). Ispravka je jedan red, ali ne ulazi u ovu fazu audita.
2. **Zajednički obrazac za učitavanje:** jedan mali hook (ili funkcija) sa `active` zaštitom, `loading`, `error` i `reload`, pa KB2 i KB3 koriste isti kod kao docs.
3. **Greške umjesto `[]`:** KB5, KB6, KB14 prikazuju grešku ili upozorenje, a prazno stanje samo kad je odgovor uspješan.
4. **Imenik:** server endpoint koji vraća korisnike sa putanjom jedinice, ili bar keš i prikaz djelimičnog neuspjeha. Ovo je zajednički problem sa modulom 3 i treba ga riješiti jednom.
5. **E2E:** jedan smoke test za `/docs` (otvaranje, pretraga, promjena jezika) i jedan za članak iz odgovora (pregled, brojači, objava).
6. **Pristupačnost i komentari:** `aria-live` na broj rezultata i `aria-controls` na mobilnom meniju. Brisanje oznaka plana iz komentara.

---

## Otkriveni bugovi i neusklađenosti

| ID | Ozbiljnost | Fajl i linija | Opis |
|---|---|---|---|
| KB1 | Srednja | `lib/docs/use-docs.ts` 41–56 | `reload` ima `useCallback(..., [])`, a koristi `locale`. Efekat (54–56) ima `[reload, locale]`, pa promjena jezika pokrene efekat, ali `reload` i dalje koristi početni jezik. Navigacija ostaje na starom jeziku, a i ponovni pokušaj koristi stari jezik. **Potvrđeno čitanjem koda.** |
| KB2 | Srednja | `lib/knowledge-base/use-knowledge-article.ts` 30–54 | Nema `active` zaštite. Ako korisnik brzo pređe sa jednog članka na drugi, stariji odgovor može prepisati noviji. `useDocsPage` ima zaštitu, pa je obrazac nekonzistentan. |
| KB3 | Srednja | `pages/knowledge-base-page.tsx` 77–104 | `loadArticles` nema zaštitu od zastarjelih odgovora. Brza promjena filtera može prikazati rezultate starog filtera. **Za provjeru u pregledaču.** |
| KB4 | Srednja | `lib/directory/load-directory.ts` 38–51; `use-directory.ts` 27–49 | Za svaku organizacionu jedinicu jedan zahtjev, bez keša, pri svakom mountu, na 6 stranica. `catch(() => [])` po jedinici: pad jedne jedinice daje nepotpun imenik bez poruke. Zajednički nalaz sa modulom 3 (tickets). |
| KB5 | Srednja | `components/knowledge-base/portal/knowledge-portal-home.tsx` 55–72 | Pri grešci učitavanja članaka kategorije `setArticles([])`, pa se prikazuje „nema članaka“ umjesto greške. |
| KB6 | Niska | `pages/knowledge-base-page.tsx` 89 | `listServices().catch(() => [])`: filter usluge je prazan bez poruke. |
| KB7 | Srednja (UX) | `pages/knowledge-article-detail-page.tsx` 79–80; `use-knowledge-article.ts` 38 | `reload` postavlja `isLoading` na `true`, pa se cijeli detalj panel zamijeni skeletonom nakon svake akcije (`onChanged`). Lokalno stanje i fokus se gube. **Za provjeru u pregledaču.** |
| KB8 | Niska | `pages/knowledge-article-detail-page.tsx` 41–62 | U razvoju (`StrictMode`, `main.tsx` 30) efekat se pokrene dva puta: prvi put postavi `viewedRef` i tajmer, cleanup ga obriše, drugi put se vrati zbog `viewedRef` i ne postavi ni tajmer ni listener. Pregled se u razvoju ne bilježi. U produkciji nema problema. |
| KB9 | Niska (komentar) | `components/knowledge-base/portal/article-from-reply-sheet.tsx` ~112–114; `backend/.../knowledge-portal.service.ts` ~521 | Komentari kažu da je članak „već objavljiv“ / „published article“. Kod kreira `DRAFT` (`create-knowledge-article.ts` 85). Kod je ispravan, komentar nije. |
| KB10 | Niska | `pages/knowledge-base-page.tsx` 124–125 | Brojači „za pregled“ i „zastarjelo“ računaju se nad filtriranom listom, pa se mijenjaju sa filterom. Za korisnika to može izgledati kao da članaka nema. |
| KB11 | Niska | `pages/knowledge-base-page.tsx` 56, 66–68 | `search` se sinhronizuje iz URL-a u efektu na svaku promjenu `searchParams`. URL nosi samo `q` i `view`, a status, usluga i „zastarjelo“ nisu u URL-u. |
| KB12 | Niska (humanizacija) | `components/knowledge-base/create-knowledge-article-form.tsx` 43–48 | `useEffect` za `initialTitle` stoji između deklaracija `useState`, a `title` se inicijalizuje dvaput. Radi, ali je teško čitljivo. |
| KB13 | Niska | `components/knowledge-base/create-knowledge-article-form.tsx` 65–84 | `listGroups().catch` tiho postavlja `[]`. Za superadmina nema poruke da lista grupa nije učitana. |
| KB14 | Niska | `components/knowledge-base/portal/knowledge-placement-card.tsx` 41–51 | `listKnowledgeCategories().catch(() => undefined)`: dropdown kategorije je prazan bez poruke. Vrijednost `categoryId` se inicijalizuje iz props-a jednom (34), pa se ne sinhronizuje ako se članak promijeni izvana. **Za provjeru.** |
| KB15 | Niska (a11y) | `components/docs/docs-search.tsx` 49–59, 59–85 | Broj rezultata i poruke „nema rezultata“ nisu u `aria-live` regionu. Čitač ekrana ne najavljuje promjenu. |
| KB16 | Niska (a11y) | `pages/docs-page.tsx` 126–131, 138 | Mobilno dugme ima `aria-expanded`, ali nema `aria-controls` koji pokazuje na panel navigacije. |
| KB17 | Srednja (testovi) | `e2e/`, `lib/docs/`, `components/docs/` | Nema e2e testa za `/docs`. `use-docs.ts`, `docs-search`, `docs-toc` i `knowledge-base-page` nemaju testove. E2E za bazu znanja (`34`) ima 2 testa. |
| KB18 | Niska (UX) | `pages/docs-page.tsx` 185–216; `lib/docs/use-docs.ts` 66–93 | Pri prelasku sa stranice na stranicu `page` se ne resetuje, pa stari sadržaj ostaje vidljiv dok novi ne stigne. Skeleton se pokaže samo kad je `page === null`. **Za provjeru u pregledaču.** |
| KB19 | Niska | `components/docs/docs-toc.tsx` 28–43 | Aktivni naslov se bira samo iz trenutne serije promjena (`visible[0]`), a `activeId` se ne resetuje kad se promijeni TOC. **Za provjeru.** |
| KB20 | Niska (UX, odluka) | `pages/docs-page.tsx` 208–210 | Filter publike je samo klijentski. Stranica koja ne odgovara filteru prikazuje upozorenje „skriveno filterom“, ali sadržaj ostaje vidljiv. Treba odluku: sakriti sadržaj ili samo upozoriti. |
| KB21 | Niska (humanizacija) | `pages/docs-page.tsx` 24–27, 37–39; `use-docs.ts` 15–16; `components/docs/docs-feedback.tsx` 7–10 | Komentari sa oznakama plana („Faza 3 (c)“, „Val 5“). Ukupno 36 pojava u modulu. |

**Pozitivno (ne mijenjati):**
- `lib/privacy/simple-markdown.ts`: `safeHref` i `safeImageSrc` propuštaju samo sigurne protokole. Tekst se escapuje kroz React.
- `use-docs.ts`: `useDocsPage` i `useDocsSearch` imaju zaštitu od zastarjelih odgovora i debounce sa `clearTimeout`.
- `docs-local.ts`: u `localStorage` ide samo slug i da/ne, bez sadržaja i identiteta.
- `docs-api.ts`: filter po ulozi je na serveru. Klijent ne može da otkrije skrivene stranice.
- `article-from-reply-sheet.tsx`: pregled prikazuje brojače uklonjenih podataka prije čuvanja, a server čisti tekst ponovo pri upisu.
- `knowledge-article-delete-panel.tsx`: brisanje traži razlog i potvrdu u dva koraka, bez `window.confirm`.
- `knowledge-lifecycle-actions.ts` zrcali backend prelaze (provjereno).
- `use-docs.ts` i `docs-toc.tsx`: cleanup listenera i tajmera.

---

## Ocjena: 6/10

Obrazloženje:
- **Plus:** sigurnost markdowna, filtriranje na serveru, minimalni podaci u `localStorage`, dobar proces čišćenja ličnih podataka, dvostruka potvrda za brisanje, usklađenost lifecycle akcija sa backendom.
- **Minus:** bug sa jezikom u navigaciji (KB1), tri različita obrasca za učitavanje, greške koje izgledaju kao prazno stanje (KB5, KB6, KB14), N+1 imenik (KB4), gubitak stanja pri akcijama (KB7), nema e2e za `/docs`, slabija pristupačnost.

Ocjena je ista kao za module 5 i 6 jer je sigurnosni dio dobar, ali se greške i obrasci ponavljaju.

---

## Must-Have kandidati (modul 7)

Predloženi redoslijed. Ništa od ovoga nije implementirano.

1. **KB1:** ispraviti `useDocsNavigation` (`[locale]` u `useCallback`), plus jedan e2e ili unit test koji mijenja jezik i provjerava navigaciju.
2. **KB4 i KB5:** imenik bez N+1 (endpoint ili keš), i prikaz greške umjesto praznog stanja u portal kategorijama. KB4 ide zajedno sa modulom 3.
3. **KB2 i KB3:** zajednički obrazac sa `active` zaštitom za `useKnowledgeArticle` i listu članaka.
4. **KB17:** smoke e2e za `/docs` (otvaranje, pretraga, promjena jezika) i za članak iz odgovora (pregled, brojači, objava).
5. **KB7:** `reload` bez skidanja cijelog panela (`isLoading` samo pri prvom učitavanju).
6. **KB9:** ispraviti komentare o „objavljenom“ članku da odgovaraju kodu (`DRAFT`).

---

## Status ispravki (2026-10-13)

- **KB1 ispravljen:** `useDocsNavigation` (`lib/docs/use-docs.ts`) — `reload` sada zavisi od `locale`, pa se navigacija ponovo učitava pri promjeni jezika. Dodat test `lib/docs/use-docs.spec.tsx` (promjena jezika ponovo učitava navigaciju). Test pada na staroj verziji i prolazi na ispravljenoj. Prolaze `tsc -b` i svi frontend testovi (898).
- KB2–KB21: nisu rađeni.
