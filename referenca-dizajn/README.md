# [ARHIVIRANO] referenca-dizajn — stara dark-first referenca

> **Ovaj prototip više nije kanonski.** Služio je kao vizuelna referenca dok je EP-HelpDesk bio
> dark-first aplikacija. Aktivni identitet je danas **Pulse** (svijetli kao primarni, tamni mod
> ravnopravan, tri brend palete), a živi prototip je **[`demo/`](../demo/)**.

## Šta važi danas

| Sloj | Gdje je sada |
|---|---|
| Izgled (boje, radius, sjene, palete, kontrast) | [`demo/`](../demo/) + `.cursor/docs/theme.md` (izvor istine: `frontend/src/index.css`, `frontend/tailwind.config.ts`) |
| UX / interakcija / layout po ekranu | [`Master UI-UX Design Constitution.md`](../Master%20UI-UX%20Design%20Constitution.md) |
| Kod koji se ne dira | `frontend/` — jedini izvor istine za implementaciju |

## Zašto je arhiviran

- Opisivao je isključivo tamnu temu i fiksne hex vrijednosti — svaka izmjena u Pulse-u (svijetli mod,
  `data-accent` palete, radius i sjena kao tokeni po temi) bila je u sukobu s njim.
- Zadržavanje dva „kanonska" izvora izgleda je gore od jednog: `frontend-reference-alignment-plan.md`
  je eksplicitno tvrdio da je ovaj folder dokaz izgleda, što više nije tačno (taj zapis je ažuriran).

## Šta smiješ koristiti iz ovog foldera

- **Istorijski kontekst** — kako su izgledali shell, gustoća i per-ekranski rasporedi prije migracije.
- **Funkcionalne obrasce** koji su i danas validni (npr. mjere sidebara/topbara, grid detalja tiketa),
  ali **samo preko** `theme.md` i ustava — ne kao izvor boje, radiusa ni sjene.

Ne koristiti: hexove, radius skalu, sjene, gradijente ni paletu iz `referenca-dizajn/src/index.css`.

## Tehnički status

Folder je ostavljen **netaknut** (26 fajlova) i dalje se može pokrenuti lokalno (`npm install && npm run dev`),
ali nije dio build-a, testova ni CI-ja. Originalni sadržaj je i u git istoriji.
