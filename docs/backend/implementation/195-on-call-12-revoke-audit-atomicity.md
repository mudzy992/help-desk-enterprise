# BA-on-call-12: revoke iCal tokena i audit zapis sada su atomarni

Status: **otvoreno**. `revokeCalendarToken` je token brisao izvan transakcije, a audit zapis (`oncall.calendar_token.revoked`) pisao naknadno zasebnim pozivom — pad procesa ili greška audita između dvije operacije ostavljali su opoziv bez audit traga.

## Izmjena

Revoke sada slijedi isti obrazac kao rotacija tokena: `deleteMany` i `appendAuditLog` izvršavaju se u jednoj Prisma transakciji, pa se ili obje operacije commitaju ili nijedna. Kad token ne postoji (count 0), audit se i dalje ne piše. Uklonjeni su tada nepotrebni `recordAuditEntry` uvoz i tip.

## Testovi i granice

Novi `on-call.service.revoke.spec.ts` (3 testa) koristi pravi `appendAuditLog` (s validacijom metadate kroz `prepareAuditEntry`): brisanje i audit idu kroz transakcijskog klijenta, vanjski klijent se ne koristi za brisanje, greška audita propagira (transakcija se u produkciji rollbacka), a bez tokena nema audit zapisa. Lokalno on-call suite: 15 suiteova / 64 testa. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
