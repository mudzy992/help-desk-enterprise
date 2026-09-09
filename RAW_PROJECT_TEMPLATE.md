# RAW PROJECT TEMPLATE (copy/paste)

Ovaj template koristiš kada agentu šalješ “raw zadatak” za novi projekat. Popuni sekcije i zalijepi u chat.

---

## 1) Project identity

- **Project name**:
- **Short description** (1–2 rečenice):
- **Target users / roles**:
- **Core features** (bullet):
- **Non-goals** (šta ne radimo sada):

---

## 2) UX / Design (Apple-linear, clean)

- **Public web style**:
  - one-page (default) / multipage
- **Design keywords** (3–6 riječi): Apple-linear, minimal, clean, …
- **Color scheme (5–6 boja)**:
  - primary:
  - background:
  - text:
  - accent:
  - success:
  - danger:
- **Color usage map** (kratko: gdje ide koja boja; npr. primary=CTA, accent=links/badges, danger=errors)
- **Typography** (ako ima preference; inače default Inter):
- **Mobile UX rule**: drawer/sheet umjesto dialoga na mobilnom gdje je moguće (obavezno).

---

## 3) Tech stack (standard)

- **Backend**: NestJS + Prisma + MySQL/MariaDB
- **Frontend**: React (Vite) + Tailwind + Radix/shadcn-style + TanStack Query + Zustand
- **Mobile**: Expo (React Native) + i18n + theme (light/dark/system)

Ako projekat odstupa od standarda, navedi tačno:

- **Exceptions**:

---

## 4) Database (obavezno sve)

- **DB vendor**: MySQL/MariaDB
- **HOST**:
- **PORT**:
- **DB_NAME**:
- **USER**:
- **PASS**:
- **Notes** (prod/dev razlike, read replicas, …):

---

## 5) Deploy / Traefik (obavezno sve)

- **Domain (TRAEFIK_HOST)**:
- **Stack slug (TRAEFIK_STACK)**: (kratko, npr. `simtracker`, `bsv2`)
- **External network (TRAEFIK_NETWORK)**: (npr. `web`)
- **EntryPoint**: (default `websecure`)
- **TLS**: true/false (default true)
- **Backend path prefix**: (default `/backend`)
- **Uploads host dir**: `/mnt/shared-app-files/<project_name>`

---

## 6) Settings contract (obavezno)

Za ovaj projekat želim:

- **Settings registry** od starta (public/private + types + validation + secret handling)
- **UI pravila**:
  - boolean → switch
  - number → number input
  - string → text input
  - svaki key ima opis “za šta je”
- **Public settings**: branding/copy/contact/maintenance (minimum)
- **Private settings**: system/admin config (minimum)

Navedi prve settings ključeve koje želiš (min 10):

- public:
  - …
- private:
  - …

---

## 7) Realtime (Socket.IO) — opt-in (ali obavezno kad treba)

Za ovaj projekat realtime treba za (označi):

- reservations
- notifications
- settings
- other:

Eventi koje očekujem (bullet):

- …

---

## 8) Notifications baseline

Obavezno od starta:

- **In-app notifications** (list, unread state, mark-as-read)

Po potrebi (odmah ili kasnije):

- **Email**: da/ne (ako da: SMTP parametri ili “stub + feature flag”)

---

## 9) Matrices (source-of-truth) — obavezno

Navedeni feature-i moraju dobiti matrice:

- `feature_slug_1`:
- `feature_slug_2`:
- `feature_slug_3`:

Za svaki feature: `.cursor/docs/matrices/<feature_slug>/MATRIX.md` + `CHANGELOG.md`.

---

## 10) Quality rules (obavezno)

- **Code hygiene**:
  - cilj 100–150 linija po fajlu (ekstrahuj u helpers/utils kad preraste)
  - dead code se briše odmah pri promjeni logike
- **Token efficiency**:
  - min reads (1–3 fajla + usko pretraživanje)
  - mali diffovi, bez rewrite bez plana

---

## 11) Plan-first execution

Tražim od agenta:

- prvo Plan mode (faze, rizici, test plan)
- ako plan ima >3 faze → `.cursor/plans/<slug>/` + `HANDOFF.md`
- implementacija fazno, bez velikih rewrite-ova
- dokumentovanje odluka (matrice + changelog)

---

## 12) Acceptance criteria (šta znači “gotovo”)

- Backend:
  - …
- Frontend:
  - …
- Mobile:
  - …
- Settings:
  - …
- Realtime/Notifications:
  - …
- Docs/Matrices:
  - …