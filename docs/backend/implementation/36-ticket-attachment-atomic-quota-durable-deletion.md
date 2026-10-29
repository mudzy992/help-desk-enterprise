# W5.9 — Attachment atomska kvota i durable deletion lifecycle

**Finding:** `BA-tickets-09`  
**Implementacija:** `6e07b13`, korekcija testnog harnessa `ad4e930`  
**CI dokaz:** `40316223173` — zelen

## Problem

Upload je provjeravao broj attachmenta prije transakcije, pa su konkurentni zahtjevi mogli svi proći kvotu. Delete je prvo brisao blob, a zatim DB metadata, zbog čega je DB kvar ostavljao metadata koji pokazuje na missing blob.

## Implementirani ugovor

- upload u transakciji zaključava parent ticket sa PostgreSQL `FOR UPDATE`, ponovo broji attachment zapise i tek tada kreira metadata, change log i event;
- blob pripremljen prije transakcije kompenzaciono se briše ako atomska provjera kvote ili bilo koji DB korak ne uspije;
- delete u istoj DB transakciji kreira durable `StorageWriteIntent`, briše metadata i evidentira change/event;
- fizički storage remove počinje tek poslije commita, pa metadata nikada ne ostaje usmjeren na već obrisan blob;
- worker reconciler koristi lease, `FOR UPDATE SKIP LOCKED`, bounded batch, eksponencijalni backoff, maksimalan broj pokušaja i terminalni `FAILED` status; uspjeh prelazi u `READY`;
- storage remove je idempotentan, pa je crash poslije fizičkog brisanja, a prije status updatea, sigurno ponovljiv.

## Direktni dokaz

`attachment-lifecycle.integration.spec.ts` na stvarnom PostgreSQL-u dokazuje:

1. dva paralelna quota claim zahtjeva uz limit jedan daju tačno jedan uspjeh i jedan reject;
2. delete metadata i durable intent commitaju prije fizičkog storage koraka;
3. injektovani prvi storage remove kvar zadržava blob i pending intent;
4. reconciler retry briše blob i završava intent kao `READY`.

CI `40316223173` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**. Koristi postojeću `StorageWriteIntent` shemu i zaseban namespace `ticket.attachment.delete`.

## Ishod

`BA-tickets-09` je zatvoren. Registar prelazi na **647 otvorenih / 45 zatvorenih / 692 ukupno**.
