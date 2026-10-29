# W6.3 — Visibility-transition subscription revocation

**Finding:** `BA-status-page-03`  
**Implementacija:** `77c6662`, audit schema korekcija `6fedf3a`, izolacija testa `deb23bd`  
**Finalni CI:** `40760712472` — zelen

## Problem

Korisnik se mogao pretplatiti dok je incident bio `ALL_USERS`, nakon čega je operator mogao promijeniti vidljivost u `STAFF_ONLY` bez opoziva postojeće pretplate. Pri resolutionu je notification put i dalje čitao pending subscription i non-staff korisniku slao interni naslov i resolution poruku.

Dodatno, subscription endpoint je primao samo globalni boolean `isStaff`, pa service-scoped actor nije bio provjeren prema stvarnim servisima incidenta. Visibility edit, subscribe i resolve nisu dijelili isti concurrency fence.

## Implementacija

- `ALL_USERS → STAFF_ONLY` edit u istoj transakciji briše sve postojeće subscriptione incidenta prije commita nove vidljivosti. Sigurnosna politika namjerno opoziva i staff pretplate; ovlašteni staff se može ponovo eksplicitno pretplatiti nakon restrikcije.
- Broj opozvanih pretplata zapisuje se u allowlistovani audit metadata ključ `revokedSubscriptions`, bez korisničkih identiteta ili sadržaja incidenta.
- Subscribe više ne prima globalni staff boolean, nego puni resource-aware `StatusViewer` iz request principal contexta i koristi isti `withIncidentVisibility` predikat kao read putevi.
- Requester i foreign-service scoped staff dobijaju not-found za `STAFF_ONLY`; actor sa odgovarajućim service scopeom može se ponovo pretplatiti.
- Edit, subscribe i status update/resolve dijele PostgreSQL transaction-scoped advisory lock po incidentu.
- Edit nakon zaključavanja ponovo provjerava da incident nije već resolved. Time postoje samo dvije sigurne race putanje: restrikcija prvo opozove pretplate pa resolve vidi `STAFF_ONLY`, ili resolve prvo završi javni incident pa naknadni edit bude odbijen.

## Testni dokaz

- Direktni service test potvrđuje da visibility edit briše subscriptione u istoj transakciji i auditira samo njihov broj.
- Stvarni PostgreSQL scenarij potvrđuje:
  - public subscriber postoji prije promjene;
  - nakon `STAFF_ONLY` commita subscription red više ne postoji;
  - requester i foreign-service staff se ne mogu ponovo pretplatiti;
  - odgovarajući service-scoped staff može se ponovo pretplatiti;
  - resolution obavijest dobija samo ponovo autorizovani staff subscriber, dok raniji requester ne dobija interni title/message.
- CI `40758292239` otkrio je da novi audit ključ nije bio u metadata allowlisti; `6fedf3a` je zatvorio taj fail-closed ugovor.
- CI `40759481505` potvrdio je samu revocation putanju, ali je otkrio neizolovanu apsolutnu notification-count aserciju u narednom testu; `deb23bd` ju je pretvorio u delta aserciju.
- Finalni CI `40760712472` potpuno je zelen, uključujući generated-Prisma build/test, kompletni backend suite, stvarni PostgreSQL/Redis shard, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

`BA-status-page-03` je zatvoren. Visibility restrikcija atomski opoziva stare subscription capabilityje, a subscription i resolution putevi više ne mogu non-staff ili foreign-service actoru otkriti interni incident sadržaj. Registar prelazi na **606 otvorenih / 86 zatvorenih / 692 ukupno**.
