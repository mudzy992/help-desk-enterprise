# Akcije na tiketu po ulozi

Ekran: detalji tiketa (`/tickets/:ticketId`).

## Izvor istine

Akcije koje ekran nudi dolaze sa servera: `GET /tickets/:ticketId/actions`
(`backend/src/modules/tickets/context/resolve-ticket-allowed-actions.ts`). Server ih
računa iz **istih predikata koje provode mutirajući endpointi** (`canChangeTicketStatus`,
`canManageTicketsInScope`, članstvo u grupi, permisije), pa UI ne nudi radnju koju će
server odbiti zbog uloge, OU/servis scope-a, permisije ili grupe.

Frontend (`lib/tickets/ticket-action-matrix.ts`) koristi server odgovor. Dok on ne stigne, ili ako
se ne može učitati, koristi se rezervna procjena po ulozi i permisijama iz sesije; prije nego što je
sesija poznata ne nudi se ništa osim odgovora podnosioca.

Serverski feature-switch-evi (npr. isključen split ili remote) se ne računaju ovdje i i dalje se
prikazuju kao vlastite greške pri izvršavanju.

## Matrica

| Akcija | SUPER_ADMIN | ADMIN | AGENT | USER | Pravilo |
|---|---|---|---|---|---|
| Preuzmi | da | da* | da* | ne | *AGENT/ADMIN dodjela pokriva OJ i servis tiketa **i** korisnik je član grupe kojoj je tiket dodijeljen (SuperAdmin preskače članstvo). Tiket mora biti u grupi, bez agenta, u preuzimljivom statusu. |
| Dodijeli agentu | da | da | da | ne | permisija `ticket.bulk.assign`; agent-only korisnik mora biti član grupe tiketa |
| Promijeni status, riješi, zatvori | da | da | da | ne | uloga AGENT/ADMIN u scope-u tiketa |
| Podijeli tiket | da | da | da | ne | isto |
| Zahtjev za remote | da | da | da | ne | staff |
| Ponovo otvori | da | da | da | da | politika ponovnog otvaranja (`reopen.eligible`) |
| Javni odgovor | da | da | da | da | podnosilac (USER_REPLY) ili staff (AGENT_REPLY) |
| Interna napomena, "Čeka korisnika" | da | da | da | ne | staff |
| Prilozi (dodavanje, preuzimanje) | da | da | da | ne | permisije `ticket.attachments.*` u scope-u |
| Učesnici (dodavanje, uklanjanje) | da | da | da | ne | staff |
| Evidencija vremena | da | da | da | ne | staff |
| Odobrenja | odobravalac | odobravalac | odobravalac | odobravalac | samo određeni odobravalac |
| CSAT | — | — | — | da | samo podnosilac nakon rješenja |
| Break-glass | da | ne | ne | ne | permisija `confidential.break_glass` |
| Tab Aktivnost | puni audit | puni audit | puni audit | tok tiketa | staff vidi sve sistemske događaje i izmjene polja; USER vidi kuriranu listu javnih događaja (`GET /tickets/:id/activity`) |

"Staff" znači SuperAdmin ili AGENT/ADMIN dodjela koja pokriva OJ i servis tiketa. Arhivirani tiket
nema nijednu mutirajuću akciju.

## Ostali ticket-scoped endpointi (samo čitanje)

- `GET /tickets/:id/people` — imena osoba i grupa na tiketu. Podnosilac dobija samo osobe iza sadržaja
  koji smije vidjeti (podnosilac, agent, grupa, učesnici, autori javnih poruka); autori internih
  napomena i evidencije vremena samo staff.
- `GET /tickets/:id/candidates` (staff) — kandidati za dodjelu (članovi grupe tiketa) i za učesnike
  (aktivni korisnici OJ tiketa). Zamjenjuje admin-only direktorij korisnika.
- `GET /tickets/:id/history` (staff) — izmjene statusa, prioriteta, uticaja, hitnosti, agenta i grupe iz
  change log-a (samo dozvoljena polja, nikad snapshot tiketa).
- `GET /tickets/:id/sla-context` — profil i kalendar iza SLA tajmera, ili razlog zašto tajmeri ne postoje.

## Šta USER vidi u aktivnosti

Samo događaji iz `publicTicketSystemEventActions` (`backend/.../context/public-activity.constants.ts`):
kreiran, dodijeljen, preuzet, riješen, zatvoren, čeka korisnika (ulazak, nastavak, podsjetnik,
automatsko zatvaranje), ponovo otvoren (i novi tiket), podjela (i podtiket), CSAT, arhiviran, udaljena
podrška (zahtjev, potvrda). SLA, učesnici, evidencija vremena, odobrenja, prilozi, bulk, sigurnosni i
povjerljivi događaji ostaju interni. Automatska dodjela se bilježi kao radnja **Sistema** i imenuje
dodijeljenog agenta (`ticket_assigned:<userId>`).

## Realtime

Poruke koje nisu javne (interne napomene, sistemski događaji, odluke o odobrenju) šalju se samo u
staff sobu tiketa, nikad u sobu grupe: u sobu grupe se ulazi samo članstvom, pa član bez staff pristupa
tom tiketu ne smije primiti njihov sadržaj. Frontend dodatno odbacuje takve poruke ako gledalac nije staff
(`filterVisibleMessages`).

## Navigacija i ekrani po ulozi

| Element | SUPER_ADMIN / ADMIN / AGENT | USER |
|---|---|---|
| Sidebar: Inbox | da | ne |
| Pogledi liste tiketa | Inbox, Dodijeljeno meni, Nedodijeljeno, Podnio sam, Svi | Podnio sam, Svi (zadani: Svi) |
| Brojač Inboxa u sidebaru | da | ne (ne poziva se inbox endpoint) |
| Dashboard: Inbox, Neusmjereni, Dodijeljeno, Nedodijeljeno, Odobrenja, SLA lista, Inbox snapshot | da | ne |
| Baza znanja: uređivanje, review, objava, arhiva | uz permisiju | ne (ni uz permisiju; potrebna je i staff uloga) |
