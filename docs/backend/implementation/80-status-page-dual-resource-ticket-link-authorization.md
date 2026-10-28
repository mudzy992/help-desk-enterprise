# W6.7 — Dual-resource authorization za status incident/ticket linkove

**Finding:** `BA-status-page-07`  
**Implementacija:** `aa92ed9`  
**Finalni CI:** `40775040580` — zelen

## Problem

`linkTicket` i `unlinkTicket` su provjeravali samo da actor ima staff pristup ticketu. Actor koji je znao foreign incident ID zato je mogao povezati svoj ticket sa `STAFF_ONLY` ili incidentom drugog servisa, promijeniti incident counter i upisati naslov incidenta u ticket system event. Ticket authorization samostalno nije dovoljan za cross-domain relaciju.

## Implementacija

- Link i unlink sada prije učitavanja incident sadržaja zahtijevaju resource-scoped `status.incidents.manage` odluku za **svaki** servis incidenta.
- Incident granica koristi postojeći centralni `AuthorizationService.authorizeResource`, identično edit/update/resolve-preview putanjama.
- Foreign incident se prikriva kanonskim `INCIDENT_NOT_FOUND` odgovorom prije ticket authorizationa, incident title read-a, link write-a, audit zapisa ili system eventa.
- Nakon incident dozvole i dalje obavezno prolazi postojeći centralni staff ticket-access policy. Nijedna od dvije dozvole ne zamjenjuje drugu.
- Pozitivni link i unlink tokovi ostaju transakcijski i zadržavaju postojeće idempotency, audit i ticket system-event ugovore.
- Controller dokumentacija sada eksplicitno opisuje dual-resource granicu.

## Testni dokaz

- Direktni unit matrix za link i unlink potvrđuje da foreign incident vraća 404 prije `assertStaffTicket`, relation write-a i system eventa.
- Dodatni unit test potvrđuje da actor sa incident manage dozvolom, ali bez ticket staff pristupa, ne može kreirati link niti event.
- Stvarni PostgreSQL cross-service scenario koristi VPN-scoped administratora: pokušaji linka i unlinka mail incidenta vraćaju 404, broj linkova ostaje isti i nema novog ticket system eventa.
- Isti PostgreSQL scenario potvrđuje pozitivnu kontrolu: isti actor može linkati i unlinkati VPN incident i ticket kada obje resource odluke prolaze.
- Lokalni lint je prošao bez grešaka; lokalni ciljani Jest nije mogao tipizirati service zbog nedostajućeg generisanog Prisma clienta u worktreeu, pa je CI sa svježim `db:generate` autoritativni dokaz.
- Finalni CI `40775040580` potpuno je zelen: backend build/lint/kompletni testovi, stvarni PostgreSQL/Redis shard, frontend, docs, wiring, container/supply-chain i završni gate.

## Migracije i release

Paket ne mijenja bazni model i nema novu DB migraciju niti ručnu release DB radnju.

## Ishod

`BA-status-page-07` je zatvoren. Cross-domain incident/ticket link sada nastaje ili nestaje samo kada actor istovremeno smije upravljati incidentom i raditi nad ticketom; foreign incident title, counter i event više se ne mogu mijenjati kroz ticket-only pristup. Registar prelazi na **602 otvorena / 90 zatvorenih / 692 ukupno**.
