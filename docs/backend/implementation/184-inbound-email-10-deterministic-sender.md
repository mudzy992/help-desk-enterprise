# BA-inbound-email-10: deterministički pošiljalac uz case-insensitive duplikate

Status: **otvoreno**. Kumulativni CI `42805826360` za commit `806ccdd` prošao je uspješno (generated Prisma + stvarni PostgreSQL). Jedinstvenost e-maila u PostgreSQL-u je case-sensitive, pa `Ana@x` i `ana@x` mogu biti dva različita korisnika; dolazna obrada ih je tražila neosjetljivim `findFirst` bez sortiranja, što daje nedeterminističnog actora.

## Mehanizam

- `findSenderByEmail` port sada radi `findMany` s neosjetljivim poređenjem, stabilnim sortiranjem (`createdAt` asc, `id` asc) i limitom 2.
- Tačno jedan pogodak vraća tog korisnika; nijedan vraća `null` (postojeći `UNKNOWN_SENDER` tok).
- Dva ili više pogodaka: obrada se odbija kao da pošiljalac nije razriješen, uz log `inbound_email_sender_ambiguous matches=… resolution=refused` — sistem ne pogađa čiji identitet da koristi za upis na tiket.

## Ograničenja

Dvosmislena adresa se tretira kao nepoznat pošiljalac, pa legitimni korisnik s duplikatom ne može pisati e-mailom dok se duplikat administrativno ne ukloni; poruka ostaje odbijena s razlogom `UNKNOWN_SENDER`, bez zasebnog admin signala osim worker loga. Korijenski uzrok (case-insensitive jedinstvenost e-maila na nivou baze) traži migraciju i ovdje se ne rješava. Kumulativni CI `42805826360` za `806ccdd` prošao je uspješno; bez operativne potvrde nalaz se ne zatvara. Deployment nije rađen.
