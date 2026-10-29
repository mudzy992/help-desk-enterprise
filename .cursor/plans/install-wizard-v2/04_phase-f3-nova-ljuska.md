# F3 — Nova ljuska wizarda (podijeljen ekran, izbor paketa, motion, kartice funkcija)

> Zavisi od: F1 (profil, skip, readiness ugovor), F0.8 (zapisan izuzetak u Constitution-u) · Procjena: velika (4–5 dana) · Paralelno sa F2.

## Cilj

„Wow“ prvi utisak koji ostaje u granicama izuzetka D2: brend pano s živim sadržajem, izbor paketa kao kartice za poređenje, funkcionalne animacije i ikone. Ljuska ne mijenja logiku koraka; koraci su zamjenjivi blokovi iz registryja.

## Postojeće stanje (provjereno)
- `frontend/src/pages/install-page.tsx`: `WIZARD_STEP_ORDER`, traka napretka s `pulse-gradient`, korak kroz `onSaved` callbackove.
- `frontend/src/components/ui/wizard-stepper.tsx`: podržava `icon` prop.
- `frontend/src/index.css`: postojeći keyframes `page-in`, `fade-in`, `pop-in`, `dot-pulse`, `bar-grow`, `draw-ring` (linije 422–493), `.pulse-gradient` (linija 576) i blok `@media (prefers-reduced-motion: reduce)` (linija 585).
- `lucide-react` je već dependency (`frontend/package.json`); nova motion biblioteka **nije** potrebna.
- `.cursor/rules/frontend-ui-ux.mdc` (linija 63): `.pulse-gradient` već dozvoljen za login/install.

## Layout
- **Desktop (≥1024 px):** dvije kolone 5/7.
  - Lijevo, brend pano (`.pulse-gradient`): logo i naziv organizacije (živo iz koraka Identitet), vertikalna traka koraka s ikonama i stanjima (završeno, trenutno, preskočeno, zaključano), panel „Šta dobijaš“ koji se mijenja po koraku (2–4 stavke s ikonama).
  - Desno: naslov koraka, opis, sadržaj, footer (Nazad, Podesi kasnije, Nastavi).
- **Tablet / mobile:** pano postaje kompaktno zaglavlje (logo + „Korak 3 od 9“ + tanka traka); „Šta dobijaš“ ide u sheet (pravilo: drawer/sheet umjesto modala na mobilnom).
- Teme: ljuska radi u Pulse (default) i classic (`data-theme="classic"`), light i dark, i sva tri accenta (indigo/teal/rose); bez hardkodovanih boja, samo tokeni iz `.cursor/docs/theme.md`.

## Korak „Izbor paketa“ (**novo**)
- Tri kartice: Minimum, Standard (oznaka „Preporučeno“), Full. Svaka ima ikonu, procjenu vremena, 4–6 ključnih stavki s ikonama i link „Prikaži sve“ (sheet s punom tabelom iz `GET /install/profile`).
- Ispod kartica „Prilagodi“: lista stavki izabranog paketa s prekidačima (ručno dotjerivanje, D1); obavezne stavke su zaključane s objašnjenjem.
- Promjena paketa nakon seeda: samo nadogradnja (pravilo iz F1).

## Kartice funkcija (zajednička komponenta)
- **Novo:** `components/install/install-feature-card.tsx`: ikona, naslov, rečenica vrijednosti, oznake zavisnosti („Treba SMTP“, „Treba direktorij“), prekidač ili „Uključeno u paket“.
- Koristi se u: izboru paketa, dodacima (F4), Full stavkama (F5), završnom ekranu (F6).

## Motion (u granicama izuzetka)
| Gdje | Efekat | Trajanje | Reduced motion |
|---|---|---|---|
| Prelaz koraka | fade + pomak 8 px (`page-in`) | ~200 ms | bez animacije |
| Traka koraka | popunjavanje (`bar-grow`) | ~250 ms | trenutno |
| Završen korak | kvačica `draw-ring` | ~250 ms | statična ikona |
| Kartica paketa (izbor) | `pop-in` na oznaci | ~150 ms | bez animacije |
| Provisioning (F6) | stavke se redom označavaju | prati backend | lista bez animacije |

Zabranjeno i u izuzetku: floating blobs, bounce, paralaksa, dekorativne pozadinske animacije, glassmorphism.

## Novi fajlovi (svi **novo**, ≤200 linija)
- `frontend/src/components/install/shell/install-wizard-shell.tsx` (layout i slotovi)
- `shell/install-brand-panel.tsx`, `shell/install-step-rail.tsx`, `shell/install-what-you-get-panel.tsx`, `shell/install-mobile-header.tsx`
- `shell/install-step-footer.tsx` (Nazad / Podesi kasnije / Nastavi; „kasnije“ samo ako je korak `skippable`)
- `components/install/install-profile-step.tsx`, `install-profile-card.tsx`, `install-profile-customize.tsx`
- `components/install/install-feature-card.tsx`
- `frontend/src/lib/install/install-step-presentation.ts` (mapa `stepKey` → ikona, i18n ključ naslova, stavke „Šta dobijaš“)
- `frontend/src/lib/install/use-install-step-transition.ts` (fokus na naslov, reduced motion)
- CSS: male klase u `index.css` samo ako postojeći keyframes ne pokrivaju potrebu.
- `pages/install-page.tsx` postaje kompozicija ljuske + aktivni korak iz registryja (cilj <120 linija).

## Visual QA
- Dodati install ljusku u `pages/visual-qa-primitives-page.tsx` (ili zasebnu QA sekciju u `components/visual-qa/`) za sve kombinacije tema × light/dark × accent.

## i18n (bs, en) — novo
`install.shell.stepOf`, `install.shell.back`, `install.shell.continue`, `install.shell.later`, `install.shell.whatYouGet`, `install.profile.recommended`, `install.profile.estimate`, `install.profile.showAll`, `install.profile.customize`, `install.profile.locked`, `install.whatYouGet.<stepKey>.<n>`.

## Testovi
- RTL: ljuska (rail stanja, fokus na naslov pri prelazu, `aria-live` napretka), izbor paketa (izbor, prilagodba, zaključane stavke), feature kartica (zavisnost isključuje prekidač).
- Reduced motion: test da se klase animacije ne primjenjuju kad je `matchMedia('(prefers-reduced-motion: reduce)')` true.
- Postojeći `install-setup-layout.spec.tsx` prolazi.

## Kriteriji prihvatanja
- Ljuska radi u svim kombinacijama tema; nema hardkodovanih boja.
- Na mobilnom nema modala; „Šta dobijaš“ je sheet.
- Sve animacije ≤250 ms i isključene uz reduced motion.
- Nijedan fajl >200 linija; `install-page.tsx` je samo kompozicija.
- Lighthouse a11y za `/install` ≥ 95 (ručna provjera).

## Commit prijedlozi
- `feat(install-ui): split-screen wizard shell with step rail`
- `feat(install-ui): package picker with customize`
- `feat(install-ui): feature card and functional motion`
