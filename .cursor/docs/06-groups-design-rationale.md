# Grupe (handler groups) — obrazloženje dizajna

Ekran: `/admin?tab=groups` (`frontend/src/pages/groups-page.tsx`, `frontend/src/components/groups/*`).

## Odluka

`referenca-dizajn` **nema samostalan mockup ekrana „Grupe"**. Grupa se u referenci pojavljuje samo kao lookup podatak:

- bedž grupe uz OU u tabeli korisnika (`referenca-dizajn/src/pages/Admin.tsx`, kolona „OU / Grupa"),
- odredište (target group) u routing pravilima (`referenca-dizajn/src/pages/Routing.tsx`, bedž `tone="primary"` s nazivom grupe).

Zato se ekran Grupe **ne nagađa kao 1:1 kopija** nepostojećeg mockupa, nego se namjerno izvodi iz tih srodnih obrazaca i iz `Master UI-UX Design Constitution.md` + `.cursor/docs/theme.md`. Ovo pitanje se ne otvara ponovo pri budućim izmjenama, osim ako se u `demo/` (aktivni prototip; `referenca-dizajn/` je arhiviran) doda stvaran ekran Grupe.

## Šta se preuzima i odakle

| Element | Izvor obrasca | Implementacija |
|---|---|---|
| Kartica grupe (naziv, OU putanja, broj članova) | Kartice iz `Routing.tsx` + pregled iz `Admin.tsx` | `group-card.tsx` (`Card`, `border-border`, `hover:border-[#31405C]`, aktivna kartica `bg-elevated/40`) |
| Oznaka fallback grupe | Naglašeni „rupa u pokriću" iz `Routing.tsx` | `border-l-[3px] border-l-warning` + `Badge tone="warning"` |
| Zaglavlje sekcije s filterom po OJ | `CardHeader` obrazac iz Admin ekrana | `groups-page.tsx` (`CardHeader` + `controlCompactClassName` select) |
| Lista članova i dodavanje člana | Tabela korisnika iz `Admin.tsx` | `group-members-section.tsx` (`bg-muted/30`, `text-[12px]`), uz RBAC OU-scope kandidata |
| Poruke o pokriću (korisnik bez grupe, RBAC bez članstva) | Semantički tonovi iz Constitution-a (warning/info) | `user-role-group-coverage-notice.tsx`, `ticket-inbox-no-group-notice.tsx` |

## Checklist (isti kao za ostale ticket ekrane)

- **Razmaci:** spacing scale iz Constitution-a; kartice `px-4 py-3.5`, sekcije `gap-2`/`gap-4`, bez proizvoljnih vrijednosti izvan skale.
- **Tipografija:** Inter, veličine iz Constitution §23 (`text-[13.5px]` naslov kartice, `text-[11px]` meta, `text-[12px]` tijelo).
- **Boje:** semantic tokeni (`foreground`, `muted-foreground`, `border`, `elevated`, `warning`, `danger`); neutrali čine većinu površine, akcentni tonovi samo za stanje (fallback, upozorenje).
- **Radius i motion:** isti radius kao ostale kartice (`Card`), samo `transition-colors`; bez dekorativnih animacija.

## Napomena o poravnanju

Vizuelni QA „jedan pored drugog" nije rađen u ovom prolazu (UI nije pokretan). Ovaj dokument bilježi **odluku i pravila**, ne rezultat renderovanja. Ako vizuelni QA nađe odstupanje na ovom ekranu, ispravlja se u Tailwind klasama, bez strukturnih promjena.
