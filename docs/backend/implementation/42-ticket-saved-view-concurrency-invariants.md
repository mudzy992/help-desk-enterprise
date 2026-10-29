# W5.15 — Saved-view concurrency invarijante

**Finding:** `BA-tickets-15`  
**Implementacija i dokaz:** `f87da63`  
**CI:** `40336570823` — zelen

## Problem

Saved-view create je radio odvojeni count, duplicate-name check, default reset i insert. Paralelni zahtjevi istog korisnika mogli su preći `maxPerUser` ili ostaviti više default pogleda. Update je imao isti read/clear/update race.

## Implementirani ugovor

- create i update sada koriste jednu PostgreSQL transakciju po operaciji;
- transaction-scoped advisory lock serijalizuje sve invariant-sensitive operacije po useru, bez međusobnog blokiranja različitih korisnika;
- count i create su pod istim lockom, pa `maxPerUser` više nije read-then-write race;
- default clear i create/update su pod istim lockom i commit/rollback granicom;
- postojeći DB unique `(userId, name)` ostaje konačni name invariant, a Prisma `P2002` se mapira na domenski `SAVED_VIEW_NAME_TAKEN`;
- nova partial unique DB granica garantuje najviše jedan `isDefault = true` red po korisniku čak i izvan aplikacijskog puta;
- migracija deterministički zadržava najnoviji legacy default (`updatedAt DESC, id DESC`) i ostale resetuje prije kreiranja indeksa;
- in-memory test harness zadržava isti transakcijski API, dok je produkcijska correctness granica PostgreSQL lock + constraint.

## Direktni dokaz

`saved-view-concurrency.integration.spec.ts` na stvarnom PostgreSQL-u paralelno pokreće 20 create zahtjeva uz limit tri i potvrđuje tačno tri uspjeha i tri persisted reda. Zatim paralelno postavlja sva tri reda kao default i potvrđuje da su sve operacije uspješne, ali da završno postoji tačno jedan default.

Puni CI `40336570823` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija — obavezna release radnja

Paket uvodi novu migraciju:

`20271026130000_saved_view_concurrency_invariants`

**Migraciju je obavezno ručno pokrenuti standardnim release migratorom pri releaseu/redeployu prije pokretanja nove verzije aplikacije.** Runtime migration sentinel je ažuriran na ovu migraciju.

## Ishod

`BA-tickets-15` je zatvoren. Registar prelazi na **641 otvoren / 51 zatvoren / 692 ukupno**.
