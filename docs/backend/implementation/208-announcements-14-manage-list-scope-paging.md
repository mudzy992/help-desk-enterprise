# BA-announcements-14: manage lista — cap se primjenjuje nakon scope filtera

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (U1 = N/A, U2 = DA) uz CI `43119874165` success; vidi audit 28 §35. Manage lista je uzimala globalno najnovijih 200 najava pa tek onda primjenjivala scope filter: menadžer/agent ograničen na vlastite organizacione jedinice mogao je dobiti nepotpunu (ili praznu) vlastitu listu čim je u sistemu postojalo više od 200 novijih najava izvan njegovog opsega — bez ikakve oznake da lista nije potpuna.

## Izmjena

Bez migracije. `AnnouncementsService.list()` sada straniči kandidate (najnoviji prvo, `id` kao tie-break) i scope autorizaciju primjenjuje **po stranici**, skupljajući dok se ne napuni pozivačeva kvota od 200 vlastitih najava. Skeniranje je ograničeno novim limitom `manageListScanMax` (5.000 kandidata). Odgovor nosi `truncated` i `listLimit`: kad kvota ili scan granica stanu, a kandidata ima još izvan pregledanog prozora, lista je eksplicitno označena kao skraćena; frontend (`Najave`) tada prikazuje napomenu „Prikazano je najnovijih N najava iz vašeg opsega…" (obrazac BA-on-call-11). Za globalnog menadžera ponašanje je nepromijenjeno (njegova kvota se napuni prvom stranicom).

## Testovi i granice

Backend: novi `announcements.list.spec.ts` — scoped menadžer nalazi svoje 3 najave iza 250 tuđih (više stranica skeniranja, `truncated=false`), a vlastita kvota od 200 od 205 vlastitih vraća 200 uz `truncated=true`. Postojeći authorization spec prolazi nepromijenjen. Lokalno: backend announcements suite (osim preegzistirajućeg stub-limited delivery test) + ESLint; frontend announcements testovi + `tsc` + Prettier. CI na pushu je autoritet.

## Operativna potvrda (U1–U2)

Preduslov: redeploy svježeg builda (API + frontend). Za U1 treba korisnik čiji je opseg upravljanja najavama ograničen na jednu organizacionu jedinicu (npr. uloga s dozvolom za najave samo za tu OU kroz Administracija → Permisije/dodjele).

| ID | Koraci | Očekivano |
| --- | --- | --- |
| U1 | Prijavi se kao opsegom ograničen menadžer najava i otvori **Najave**. | Vidi najave iz svog opsega čak i ako u sistemu ima mnogo novijih najava drugih jedinica; lista nije prazna/skraćena bez objašnjenja. |
| U2 | Prijavi se kao globalni admin i otvori **Najave**. | Lista radi kao dosad; napomena o skraćenju vidi se samo ako najava u opsegu ima više od 200. |

Odgovor: `U1: DA/NE/N/A, U2: DA/NE` + opis odstupanja ako ih ima. Ako nema opsegom ograničenog menadžera za test, U1 može biti N/A — backend jedinični test pokriva paginaciju. CI `43119874165` (success) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio U1 = N/A, U2 = DA — nalaz je zatvoren, vidi audit 28 §35.
