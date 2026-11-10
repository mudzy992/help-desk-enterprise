# BA-inbound-email-07: DB unique zaštita Message-ID deduplikacije

Status: **otvoreno**. Message-ID deduplikacija bila je read-before-write: dvije istovremene isporuke iste poruke (npr. To+Cc) mogle su obje proći provjeru i obje završiti kao `PROCESSED`. Korisnik je izričito odobrio migraciju za ovaj nalaz.

## Mehanizam

- Nova migracija `20271031210000_inbound_email_message_id_processed_unique` dodaje parcijalni unique indeks `InboundEmail_mailboxKey_messageIdHeader_processed_key` na `("mailboxKey", "messageIdHeader") WHERE "messageIdHeader" IS NOT NULL AND status = 'PROCESSED'`, pa najviše jedan `PROCESSED` red smije postojati po Message-ID-u u pretincu. Prisma ne izražava parcijalne indekse, pa indeks namjerno ne postoji u schema-i — u `ops.prisma` stoji komentar koji to dokumentuje.
- `expectedSchemaMigration` u runtime contractu pomjerena je na novu migraciju.
- `finish()` hvata `P2002` pri prijelazu u `PROCESSED` i gubitnika pretvara u isti ishod koji bi dala prethodna provjera: `IGNORED` s razlogom `DUPLICATE` (uz log `inbound_email_duplicate_at_finish`), bez ticket polja. Postojeća read-before-write provjera ostaje kao brzi put.

## Primjena migracije (operatorski korak)

Agregacija nije pokrenuta nad ciljnom bazom. Kreiranje unique indeksa **pada ako već postoje historijski `PROCESSED` duplikati** istog `(mailboxKey, messageIdHeader)` — prije primjene provjeriti i razriješiti ih, npr.:
`SELECT "mailboxKey", "messageIdHeader", count(*) FROM "InboundEmail" WHERE "status"='PROCESSED' AND "messageIdHeader" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;`

## Ograničenja

Indeks garantuje najviše jedan `PROCESSED` zapis, ali ticket upis gubitnika može se desiti prije finish sudara ako obje isporuke prođu početnu provjeru u istom prozoru; tada gubitnikov inbound red postaje `IGNORED/DUPLICATE`, a eventualni dvostruki ticket upis ostaje ograničen postojećim ticket idempotency ključevima po inbound redu — potpuna prevencija tražila bi ključeve izvedene iz Message-ID-a, što je zaseban opseg. Indeks ne pokriva redove bez Message-ID zaglavlja. Bez generated-Prisma/PostgreSQL CI dokaza (uključujući replay migracije na disposable bazi), provjere historijskih duplikata na ciljnoj bazi i operativne potvrde nalaz se ne zatvara.
