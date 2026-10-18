# Modul 11: Install Wizard v2

**Datum audita:** 2026-10-18
**Auditirani Git SHA:** `1414afa97754753a8adb049a92ae12549b14164a` (`origin/master`)
**Radna grana dokumenta:** `arena/bd31e07b-help-desk-enterprise`
**Status:** re-audit implementacije i Aurora vizuelnog sloja; kod nije mijenjan
**Oznake nalaza:** samo **IN** (Install)

> Napomena o izvoru: v2 implementacija nije prisutna u trenutnom radnom stablu na SHA `daca898`, niti u udaljenoj verziji ove radne grane na `f36e09c`. Re-audit je zato urađen direktnim čitanjem Git stabla `origin/master@1414afa`, gdje se nalaze plan, implementacija, testovi i CI guardovi. Nalazi ispod opisuju taj SHA, a ne stariji sadržaj lokalne grane.

---

## Modul (v2)

Install Wizard v2 je predautentikacijski tok kojim operator bira paket **Minimum**, **Standard** ili **Full**, kreira super administratora, podešava identitet i prijavu, strukturu, tim i servis, te prema paketu prolazi SMTP, blueprint, policy, SLA, sigurnost, dodatke i allowlistane settings sekcije. Backend registry određuje redoslijed i stanje koraka; frontend ne vodi paralelnu mašinu toka.

Ključni ugovor je „spremno za tikete“: provisioning/readiness provjerava administraciju, prijavu, OU, grupu sa aktivnim članom, aktivan servis i formu, EXACT routing, SLA, role i obavezne korake paketa. Završetak se ne oslanja samo na prikaz u UI-u — `POST /install/complete` ponavlja server-side provjeru.

Tok ima jedan čitač `GET /install/status` u `InstallSetupProvider`. Nepoznat status više nije „nije instalirano“: provider i layout prikazuju eksplicitnu grešku sa retry-em. Aktivni korak dolazi iz serverovog `nextStep`; review/back navigacija ne mijenja serverovu odluku. „Podesi kasnije“ koristi serverov `skippable`, a promjena paketa ponovno otvara odgode koje novi paket zahtijeva.

Nakon provisioning ekrana dolazi zaseban ready ekran sa sažetkom i vezom za prijavu. Odgođene stavke i sigurnosne preporuke prelaze u post-install dashboard checklistu. Ops-only rerun postoji iza `INSTALL_ALLOW_RERUN` i install tokena; nema administratorski UI.

---

## Vizuelni identitet (Aurora)

Aurora je **namjerno zaseban dizajnerski sistem instalacije**, a ne varijanta Pulse app shella. „Max full“ u ovom modulu znači jači Aurora kontrast, pristupačnost, reduced-motion ponašanje i unutrašnju konzistentnost — ne vizuelno približavanje ostatku aplikacije.

Tema je aktivna kroz `data-install-theme="aurora"` na `<html>` dok je wizard montiran. To je svjesno širi scope od wrappera: Radix sheet, dijalog i toast renderuju se kroz portal u `body` i inače ne bi naslijedili temu. Hook vraća prethodnu vrijednost pri unmountu, pa Aurora ne ostaje na `/login` niti mijenja Pulse `data-theme`/`data-accent` tok.

Aurora sloj čine:

- tamni canvas, aurora backdrop, HUD i „flight plan“ rail;
- vlastiti `--iw-*` tokeni, Space Grotesk display tipografija i staklene površine sa neprozirnom osnovom;
- `install-shim.css`, koji semantičke utility klase koraka mapira na Aurora tokene bez `!important`;
- fokus na naslov pri promjeni koraka, tekstualna stanja uz ikone, `aria-live` napredak i reduced-motion pravila;
- rail kao ograničen, skrolabilan prozor koji centrira aktivni korak, umjesto beskonačnog vertikalnog dokumenta.

`scripts/check-install-aurora.mjs` štiti tri klase regresije:

1. računa najnepovoljniji canvas piksel i WCAG AA odnos za panel, HUD i CTA, te provjerava dokumentovane brojke;
2. odbija beskonačnu geometrijsku animaciju na interaktivnom kontejneru bez `pointer-events: none`;
3. skenira install stablo i pada ako semantička Pulse utility klasa nema Aurora shim.

Na auditiranom SHA guard je uključen u frontend CI posao. Dokumentovana najniža vrijednost običnog teksta na panelu je približno **4,8:1**, a CTA tekst je iznad **10:1**. Time su direktno pokrivene regresije koje su ranije postojale: Pulse boja na `/install`, nepokriven utility i preslab kontrast na svijetlom dijelu canvasa.

---

## Povezani fajlovi

| Putanja | Uloga |
|---|---|
| `.cursor/plans/install-wizard-v2/` | Plan F0–F6, odluke, checklist, changelog i handoff |
| `frontend/src/pages/install-page.tsx` | Kompozicija statusa, shella, navigacije i odgode |
| `frontend/src/app/install-setup-provider.tsx` | Jedini čitač statusa; profile/readiness/summary kontekst |
| `frontend/src/app/install-setup-layout.tsx` | Globalni install gate i fail-closed error/retry prikaz |
| `frontend/src/components/install/install-active-step.tsx` | Jedinstveno mapiranje server koraka na ekran |
| `frontend/src/components/install/shell/` | Aurora shell, HUD, rail, header, footer i liftoff |
| `frontend/src/components/install/` | Paket, identitet, auth, struktura, tim, SMTP, blueprint, policy, SLA, sekcije, provisioning i ready ekran |
| `frontend/src/lib/install/use-install-theme.ts` | Postavlja i vraća `data-install-theme="aurora"` |
| `frontend/src/styles/install-theme.css` | Aurora tokeni, canvas, površine, motion i kontrastna dokumentacija |
| `frontend/src/styles/install-shim.css` | Scoped mapiranje semantičkih utility klasa |
| `scripts/check-install-aurora.mjs` | Kontrast, motion/actionability i Pulse-leak guard |
| `frontend/src/services/install-*.ts` | API ugovori statusa, profila, sekcija, SMTP-a i readinessa |
| `backend/src/modules/install/` | Registry, profili, readiness, blueprinti, sekcije, završetak i rerun |
| `backend/src/modules/setup-checklist/` | Post-install checklist za odgođene/preporučene stavke |
| `e2e/install-wizard/` | Poseban Playwright projekat bez shared `ensureInstall` setupa |
| `e2e/tests/51-install-wizard-minimum.spec.ts` | Minimum + završetak + prijava + stvarni routing tiketa |
| `e2e/tests/52-install-wizard-standard.spec.ts` | Standard + SMTP test + tim + blueprint + policy |
| `e2e/tests/53-install-wizard-full.spec.ts` | Full + odgoda settings sekcija + dashboard checklist |
| `.github/workflows/ci.yml` | Aurora guard i ručno dispatchani wizard E2E posao |
| `e2e/README.md`, `docs/analysis/TASKS.md` | Operativne upute i evidencija statusa; vidi IN22 |

---

## Implementacija

### Status, gate i koraci

`InstallSetupProvider` paralelno učitava status i advisory readiness. Greška readinessa degradira samo taj dio na `null`; greška statusa zatvara gate i nudi retry. Refresh zadržava postojeći ekran. `InstallPage` koristi `resolveRenderedStep`, serverova stanja za rail i zajednički footer za back/defer/continue.

Token gate otključava sadržaj tek nakon provjere. Svaki podatkovni korak koristi eksplicitna `loading | error | ready` stanja, pa se forma sa podrazumijevanim vrijednostima ne prikazuje nakon neuspjelog učitavanja. Greške ostaju uz formu ili dobijaju retry, umjesto tihog fallbacka.

### Paketi, provisioning i završetak

Backend step registry nosi `requiredIn`, `offeredIn`, `skippable`, redoslijed i markere. Profil se može prilagoditi, ali readiness ostaje autoritet za završetak. Minimum kreira funkcionalan servisni put; Standard dodaje operativni sadržaj; Full izlaže allowlistane sekcije i preporuke bez vraćanja tajni klijentu.

Provisioning ekran prikazuje provjere, može vratiti operatora na problematični korak i završava tek nakon zelenog server odgovora. Ready ekran prikazuje sažetak i sljedeće korake. Dashboard checklist nema ručno „riješeno“ stanje: stavke nestaju kada stvarno stanje postane ispravno.

### Testovi i zaštite

Inventar na auditiranom SHA sadrži **43 frontend install/setup-checklist spec fajla** i **54 backend install spec fajla**. Posebno su pinovani E2E copy i markup ugovori: jedan `h1`, redoslijed body/footer, token input, live lista, login link i tipovi dugmadi.

Playwright 51/52/53 pokriva tri pozitivna end-to-end profila. Testovi imaju precondition za svjež wizard i preskaču se sa objašnjenjem kada je instalacija već završena; CI preflight to pretvara u glasnu grešku prije pokretanja browsera. Shared E2E posao odbija 51/52/53 jer njegov global setup završava instalaciju.

Wizard CI posao je ručni `workflow_dispatch` (`install_spec=51|52|53`), traži token, a za 52/53 i SMTP varijable. Ne podiže niti resetuje vlastiti čisti stack. To je funkcionalna, ali ne i obavezna PR zaštita.

---

## Realno / željeno — samo otvoreno

| IN | Realno stanje | Željeno stanje |
|---|---|---|
| **IN14** | UI E2E 51/52/53 je implementiran i ranije evidentiran kao zelen, ali za auditirani SHA nema priloženog Lighthouse rezultata za `/install`. | Lighthouse accessibility rezultat **≥ 95**, sa datumom, URL-om/buildom i artefaktom. |
| **IN20** | SMTP ima install-scoped test, ali inbound email i LDAPS nemaju test konekcije iz wizarda. | Rate-limitovane install-scoped rute i UI akcije koje ne izlažu tajne i ne traže završenu sesiju. |
| **IN22** | `TASKS.md` još kaže da F6 „nije commitovan“, da su samo 51/52 napisana i da nisu izmjerena; `e2e/README.md` opisuje 51/52 i navodi pending owner odluku iako CI i spec 53 postoje. | Uskladiti oba dokumenta sa master implementacijom, 51/52/53 inventarom, izmjerenim statusom i svjesno odabranim CI modelom. |
| **IN23** | 51/52/53 su veliki pozitivni tokovi; nema zasebnog browser E2E scenarija za pogrešan token, status 5xx/retry, neuspješan save ili readiness odbijanje. RTL/backend testovi pokrivaju dio tih grana, ali ne browser integraciju. | Dodati mali negativni wizard E2E paket za gate fail-closed, load/save retry i blokiran completion. |
| **IN24** | Wizard E2E se pokreće samo ručnim dispatchom i zavisi od unaprijed pripremljenog svježeg stacka. CI komentar i plan i dalje traže potvrdu modela. | Vlasnički potvrditi dispatch model ili uvesti izolovan reset-stack posao; tek tada ga smatrati obaveznom regresijskom kapijom. |

---

## Gap analiza

### IN14 — Lighthouse dokaz nije dostupan

Statički a11y, RTL, kontrastni guard i E2E prolaz daju snažnu osnovu, ali ne zamjenjuju renderovano Lighthouse mjerenje. Posebno treba mjeriti početni token gate, dugački Full korak i otvoreni portal. Bez artefakta, Lighthouse podstavka ostaje otvorena.

### IN20 — dvije vanjske konekcije nisu provjerljive prije završetka

Full profil može sačuvati inbound i directory postavke, ali operator ne može potvrditi mrežu, TLS i kredencijale u istom toku. Postojeće domenske funkcije (`InboundEmailAdminService.testConnection()` i `DirectoryFullSyncService.testConnection(actorUserId)`) nisu direktno dostupne install-token kontekstu. Rješenje treba biti tanak install-scoped adapter, ne dupliranje protokola u frontendu.

### IN22 — dokumentacija proturječi repozitoriju

Ovo nije kozmetički problem: operater iz README-a neće vidjeti Full spec kao podržan, a planer iz `TASKS.md` može zaključiti da F6 nije commitovan i da E2E nije izmjeren. Handoff i audit već nose novije stanje; task lista i runbook moraju postati konzistentni izvori.

### IN23 — nedostaje negativna browser regresija

Unit i komponentni testovi potvrđuju fail-closed ponašanje, ali integracijski rizik ostaje u spoju browsera, proxyja, API greške i ponovnog slanja forme. Dovoljan je mali, determinističan skup sa kontrolisanim route interceptionom; ne treba duplicirati sva tri duga profila.

### IN24 — E2E posao nije kontinuirana kapija

Trenutni preflight je dobar: ne dozvoljava „zeleno preskakanjem“. Međutim, posao se neće pokrenuti na običnom PR-u i sam ne garantuje čistu bazu. Zbog toga postojanje CI YAML-a nije isto što i stalna E2E zaštita.

---

## Master tabela IN1–IN24

| IN | Status | Sažetak / dokaz |
|---|---|---|
| **IN1** | Zatvoren | Status greška više ne preusmjerava korisnika u wizard; eksplicitni error/retry. |
| **IN2** | Zatvoren | Token gate ostaje zaključan na mrežnu/serversku grešku. |
| **IN3** | Zatvoren | Koraci ne prikazuju formu dok stanje nije poznato; load error ima retry. |
| **IN4** | Zatvoren | Nema fallbacka na super admin nakon nepoznatog statusa; server `nextStep` je autoritet. |
| **IN5** | Zatvoren | Provider je jedini čitač `GET /install/status`. |
| **IN6** | Zatvoren | Uklonjena paralelna frontend mašina; resolver samo prikazuje server korak/review. |
| **IN7** | Prihvaćen rizik | Install token ostaje tab-scoped u `sessionStorage`; backend guard i lock ostaju sigurnosna granica. |
| **IN8** | Zatvoren | Aurora shell/HUD/flight-plan uklonili su duplirano zaglavlje i raster. |
| **IN9** | Zatvoren | Produkcijski komentari uglavnom objašnjavaju ugovor i razlog; fazna istorija je u planu/handoffu. |
| **IN10** | Prihvaćen rizik | Fallback password policy je namjeran bootstrap fallback i dokumentovan je. |
| **IN11** | Zatvoren | Relevantna polja imaju `aria-describedby`; fokus se vodi na naslov koraka. |
| **IN12** | Zatvoren | Readiness i completion provjeravaju funkcionalan put za tiket, ne samo markere forme. |
| **IN13** | Zatvoren | Frontend/backend testni inventar značajno pokriva korake, registry i završetak. |
| **IN14** | Otvoren djelimično | 51/52/53 postoje i zabilježeni su kao zeleni; nedostaje Lighthouse ≥ 95 artefakt. |
| **IN15** | Zatvoren | Paket i puna `steps.*` stanja koriste se u UI-u i railu. |
| **IN16** | Zatvoren | Paket, shell i „šta dobijaš“ copy postoje u bs/en lokalatima. |
| **IN17** | Zatvoren | Defer/undo je centralizovan u footeru i vođen serverovim `skippable`. |
| **IN18** | Zatvoren | Install settings metadata je read-only u registry UI-u; nema lažnog editora. |
| **IN19** | Zatvoren | Promjena paketa vraća odgodu zahtijevanog koraka i objašnjava ponovno otvaranje. |
| **IN20** | Otvoren | Inbound email i LDAPS nemaju test konekcije u wizardu. |
| **IN21** | Zatvoren | Ops-only rerun ima env kapiju, token, CLI/rutu i runbook. |
| **IN22** | Otvoren | `TASKS.md` i `e2e/README.md` su zastarjeli u odnosu na 51/52/53 i F6 status. |
| **IN23** | Otvoren | Nema namjenskog negativnog browser E2E paketa. |
| **IN24** | Otvoren | Wizard E2E je ručni dispatch, ne obavezna samostalna clean-stack kapija. |

---

## Roadmap do 10/10

1. **Dokazati pristupačnost:** pokrenuti Lighthouse na stvarnoj `/install` instanci za gate, reprezentativni Full korak i portal; sačuvati izvještaj i zatvoriti **IN14** samo uz rezultat ≥ 95.
2. **Učiniti provjeru pouzdanom:** dodati mali negativni E2E paket i vlasnički zaključiti CI model sa izolovanim stanjem ili formalno prihvaćenim dispatch runbookom (**IN23**, **IN24**).
3. **Zatvoriti operativne rupe:** dodati install-scoped inbound/LDAPS testove i uskladiti `TASKS.md`/`e2e/README.md` sa stvarnim F6 i 51/52/53 stanjem (**IN20**, **IN22**).

---

## Ocjena

**9,4/10**

v2 je arhitektonski i vizuelno zaokružen: server vodi tok, status je jedan i fail-closed, readiness štiti završetak, sva tri paketa imaju UI E2E, a Aurora ima zasebne tokene, scoped portale, kontrastni proračun, motion guard i Pulse-leak skener u CI-u. Ocjenu ne spušta činjenica da se razlikuje od Pulse shella — to je namjerna odluka. Do 10 nedostaju renderovani Lighthouse dokaz, inbound/LDAPS test konekcije, negativni browser tokovi, konačna CI odluka i usklađena dokumentacija.

---

## Provjere izvršene

- Pročitani planovi i evidencija: `.cursor/plans/install-wizard-v2/00_overview.md`, faze F0–F6, `CHECKLIST.md`, `HANDOFF.md` i `CHANGELOG.md` na `origin/master@1414afa`.
- Pročitani tokovi: provider, layout, page, gate, active-step, shell, theme hook, rail/footer/header i relevantni API ugovori.
- Pregledani backend install registry, readiness/completion, profil/reset, settings sekcije, blueprinti, SMTP test, rerun i setup-checklist inventar.
- Inventarisano **43 frontend** install/setup-checklist spec fajla i **54 backend** install spec fajla.
- Pregledani E2E 51/52/53, poseban Playwright setup, precondition, helperi, SMTP catcher i CI preflight/dispatch.
- Pregledani E2E markup/copy guardovi i Aurora kontrast/motion/shim guard.
- Grepom provjeren scope `data-install-theme="aurora"`, `--iw-*` sloj, Pulse utility shim i uključivanje `check-install-aurora.mjs` u `.github/workflows/ci.yml`.
- Upoređeni `e2e/README.md` i `docs/analysis/TASKS.md` sa stvarnim inventarom; potvrđen **IN22**.
- Browser i Lighthouse nisu pokrenuti u ovom re-auditu; zbog toga **IN14** ostaje otvoren.
- Nisu pokretani testovi iz lokalnog worktreeja jer ono ne sadrži auditirani v2 SHA; raniji rezultati zapisani u handoffu nisu predstavljeni kao novo mjerenje.

**Predložena commit poruka:** `docs(audit): rewrite install wizard v2 and Aurora review`
