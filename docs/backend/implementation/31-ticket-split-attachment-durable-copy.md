# W5.4 — Ticket split attachment durable copy i reconciliation

## Status

Završeno. Završni implementacijski SHA je `31f831c`; puni zeleni CI dokaz je run `40231167864`.

## Zatvoreni nalaz

- `BA-tickets-04` — split copy više ne proizvodi attachment metadata zapis koji pokazuje na nepostojeći blob.

## Implementirani ugovor

- Uklonjen je sintetički `split-link/<source>/<child>` storage path.
- Copy čita stvarni parent blob kroz containment-validirani `TicketAttachmentStorage`.
- Sadržaj prolazi centralni stage → transactional intent/business metadata → promote protokol.
- Namespace i idempotency identitet su `ticket.split.attachment` i `<sourceAttachmentId>:<childTicketId>`.
- Final key je determinističan i pripada child ticket direktoriju.
- Child `TicketAttachment` nastaje u istoj transakciji kao `StorageWriteIntent`.
- Promotion se dešava tek nakon commita; promotion failure ne briše durable intent niti metadata zapis.
- Originalni parent blob ostaje fizički nezavisan i čitljiv.
- Move semantika ostaje DB premještanje istog attachment zapisa i ne pravi nepotrebnu kopiju.
- Worker-only reconciler bounded obrađuje pending i expired-lease intentove; centralni storage primitive osigurava `SKIP LOCKED`, lease, exponential backoff, max attempts i terminal failure/compensation stanje.

## PostgreSQL i disk dokaz

`backend/src/modules/tickets/split/split-attachment-storage.integration.spec.ts` koristi stvarni PostgreSQL i privremeni filesystem te dokazuje:

1. source attachment pokazuje na stvarni parent blob;
2. injectovani prvi promotion kvar ostavlja child metadata i durable pending intent;
3. child final path prije reconciliationa nije lažno čitljiv;
4. reconciler promoviše staged sadržaj na final key;
5. child download nakon reconciliationa vraća identičan sadržaj;
6. parent blob ostaje čitljiv i ne zavisi od child kopije.

## Validacija

CI `40231167864` je zelen za backend build/lint/unit, worker wiring, stvarni PostgreSQL/Redis integration suite, frontend i container/supply-chain provjere.

## Migracije

Paket ne uvodi novu migraciju. Koristi postojeći `StorageWriteIntent` schema ugovor iz migracije `20271025230000_storage_write_protocol`; ako ta ranija Val 4 migracija još nije primijenjena u ciljnom okruženju, ona i dalje mora proći kroz ručni release migrator.

## Sljedeći paket

Sljedeći paket je **Backend Val 5 / W5.5 — ticket split potpuni preflight, operation idempotency i atomic multi-child DB granica (`BA-tickets-05`)**.
