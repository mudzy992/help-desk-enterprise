# BA-inbound-email-05: test konekcije bez preuzimanja raw poruka

Status: **otvoreno**. Admin test konekcije zvao je `session.list(10)`, što za Graph i IMAP znači preuzimanje do deset punih raw poruka (svaka do 35 MB) u API proces samo da bi se izbrojalo `items.length`.

## Mehanizam

- Mailbox port ima novu metodu `listIds(limit)` koja vraća samo provider ID-jeve, najstarije prvo: Graph koristi isti upit sa `$select=id` bez `/$value` preuzimanja tijela; IMAP radi samo `SEARCH` po UID-ovima bez `fetchOne`/source čitanja.
- `InboundEmailAdminService.testConnection` koristi `listIds(10)` i vraća isti odgovor (`inboxCount` = broj ID-jeva, najviše 10). Obrada poruka i dalje koristi neizmijenjeni `list`.
- Test dokazuje da test konekcije ne poziva `list`, a konektorska greška i dalje daje samo stabilni `CONNECTION_FAILED` kod bez detalja.

## Ograničenja

`inboxCount` je i dalje ograničen na uzorak od 10 (nije ukupan broj u pretincu), kao i prije. `listIds` za IMAP radi `SEARCH` nad cijelim pretincem prije rezanja na limit, pa trošak upita raste s veličinom pretinca iako se sadržaj ne preuzima. Nema migracije. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara. Deployment nije rađen.
