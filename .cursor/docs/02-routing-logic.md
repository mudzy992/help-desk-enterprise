# Routing logika (kritično — čitaj prije diranja TicketRoutingService)

## MVP (basic mapping)
```
Ticket = (originUnitId + serviceId)
→ lookup u RoutingRule tabeli (unitId + serviceId → groupId)
→ ako nema pravila: fallback na parent OU (traži pravilo gore u hijerarhiji)
→ ako i dalje nema: dodijeli SuperAdmin/default IT grupi + flag za manuelni review
```

## Pravila pripadnosti korisnika
- Korisnik pripada OU na osnovu AD atributa (`company`, `department`) — mapiranje se radi u UserModule prilikom sync-a, ne u TicketModule.
- Tiket se inicijalno vezuje za `originUnit` korisnika koji ga kreira (ne za OU agenta).

## Dodjela (assignment) u MVP-u
Manuelna — admin/agent preuzima tiket iz svoje grupe. Least Busy / Round Robin automatska dodjela je Faza 2 (vidi `00-mvp-scope.md`).

## Faza 2+ (rule-based engine — NE implementirati u MVP-u)
```
IF (OU + Service + Priority) THEN (Group + SLA + Priority override)
```
Ovo zahtijeva novi RoutingRule model sa uslovima — ne proširivati postojeći RoutingRule dok se Faza 2 eksplicitno ne pokrene.
