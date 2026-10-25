# W4.7 — Durable post-commit cache invalidation

**Status:** završen 25.10.2026.  
**Implementacija:** `bf57489`.  
**Zeleni CI dokaz:** `40221177051`.

## 1. Transactional invalidation intent

`CacheInvalidationService.schedule(transaction, {namespace,key,revision})` zapisuje invalidation događaj kroz centralni transactional outbox. Business mutation, authoritative revision bump i invalidation intent moraju koristiti isti callerov `Prisma.TransactionClient`; rollback zato uklanja i intent, a commit garantuje durable post-commit delivery.

Događaj koristi topic `cache.invalidate.<namespace>`, canonical payload i dedupe ključ izveden iz revisiona i SHA-256 hasha cache keya. Namespace, key i revision su bounded. Revision je pozitivan PostgreSQL `Int` kompatibilan broj.

Primitive namjerno ne poziva cache/realtime provider unutar business transakcije. Provider outage poslije commita ne vraća lažnu mutation grešku klijentu; outbox ostaje `PENDING` sa attempts/backoff/lease/dead-letter ugovorom iz W4.2.

## 2. Cross-replica delivery

`dispatchOne(namespace, invalidate)` claimuje durable outbox poruku i prosljeđuje stabilni message ID, key i revision provideru. Bilo koja replika može obraditi događaj. Provider mora koristiti message ID/revision za idempotentnu delete/publish operaciju.

Invalidation failure vraća poruku u retry stanje. Time mutation success nije vezan za trenutnu dostupnost Redis/pub-sub/realtime sloja.

## 3. Cache nikad nije source of truth

`readThrough` prije cache hita obavezno čita authoritative revision iz baze. Cache entry se koristi samo ako njegov revision tačno odgovara DB revisionu. Missing ili stale cache pokreće `loadAuthoritativeSnapshot`, koji mora vratiti value i revision iz jednog konzistentnog DB snapshota.

Posljedice:

- izgubljen, zakasnio ili neuspješan invalidation ne može učiniti stari cache autoritativnim;
- pre-commit cache refill može zapisati staru vrijednost, ali je naredni read odbija zbog DB revision mismatcha;
- cache outage utiče na performanse, ne na correctness;
- realtime signal je UX optimizacija, ne potvrda commita niti source of truth.

Caller mora bumpovati authoritative revision u istoj transakciji sa business promjenom. Sama invalidation poruka bez revision bumpa nije dovoljan correctness ugovor.

## 4. Error i granice

- nevalidan namespace/key vraća `CACHE_INVALIDATION_INPUT_INVALID`;
- revision izvan 1–2.147.483.647 vraća `CACHE_INVALIDATION_REVISION_INVALID`;
- payload parser fail-closed provjerava expected namespace, bounded key i revision prije provider poziva;
- provider exception ostaje u outbox retry/DLQ toku i ne curi u već završenu business mutaciju.

## 5. Dokaz

Unit testovi potvrđuju:

1. cache revision 7 se ne koristi kada DB authority kaže revision 8;
2. matching cache se koristi tek nakon authoritative revision read-a;
3. nevalidan authority revision pada prije cache trusta.

Stvarni PostgreSQL testovi potvrđuju:

1. rollback business transakcije uklanja invalidation intent;
2. commitovani intent druga servisna replika uspješno claimuje i obrađuje;
3. callback prima tačan key/revision i stabilni outbox ID;
4. provider outage ostavlja durable `PENDING` retry sa povećanim attemptom, bez promjene commitovanog mutation ishoda.

CI `40221177051` potvrđuje backend build/lint/pune testove, stvarni PostgreSQL migration replay/integration suite, frontend, container i supply-chain gateove.

## 6. Migracije, findings i Val 4 closeout

W4.7 nema novu DB migraciju; koristi W4.2 outbox. Platformski paket ne prebacuje automatski postojeće settings/config/status/policy mutation handlere, pa nijedan domenski finding nije umjetno zatvoren. Registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno**.

Sa W4.7 je završen cijeli **Backend Val 4**:

- W4.1 persisted idempotency;
- W4.2 transactional outbox;
- W4.3 optimistic `If-Match`/CAS;
- W4.4 advisory/row lock;
- W4.5 bounded bulk commands;
- W4.6 staged storage writes;
- W4.7 durable version-aware cache invalidation.

## 7. Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.1 — tickets transactional command boundary za message/event/audit/outbox tok, izgrađen na Val 4 primitivama**.
