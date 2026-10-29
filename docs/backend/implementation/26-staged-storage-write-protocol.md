# W4.6 — Staged storage write protocol

**Status:** završen 25.10.2026.  
**Implementacija:** `02aa0b4`.  
**Zeleni CI dokaz:** `40220137718`.

## 1. Kanonski protokol

`StorageWriteService` uvodi centralni tok:

1. blob se piše u izolovani `.staging/<uuid>` ključ;
2. business callback i `StorageWriteIntent` nastaju u istoj Prisma transakciji;
3. tek nakon DB commita staging blob se atomski promoviše na finalni ključ;
4. promote failure ne poništava već commitovan business state, nego ostavlja durable `PENDING_PROMOTION` intent;
5. reconciler lease-claimuje intent i idempotentno ponavlja promote;
6. iscrpljen retry prelazi u `FAILED`, nakon čega eksplicitna compensation operacija uklanja staging artefakt i označava `COMPENSATED`.

Business callback dobija intent ID, final key, SHA-256 content hash i byte size. Domenski red zato može referencirati stabilni intent/final key u istoj transakciji, ali resurs se ne smije oglašavati kao downloadable dok intent nije `READY`.

## 2. Granice i dedupe

Namespace je 3–80 znakova, operation key 8–160, storage key 3–300. Traversal, hidden final key, payload veći od 100 MiB i attempts izvan 1–100 padaju prije staginga. Unique `(namespace,key)`, `stagingKey` i `finalKey` sprečavaju duple manifeste i kolizije.

Isti operation key sa istim content hashom i final keyem rekoristi postojeći intent; drugi sadržaj/final key vraća `STORAGE_WRITE_CONFLICT`. Replayed poziv ne izvršava business callback ponovo.

## 3. Disk adapter

`DiskStagedStorageAdapter` koristi:

- contained path resolution;
- exclusive `wx` staging create;
- mode `0600`;
- file `fsync` prije zatvaranja;
- atomic filesystem rename za promote;
- idempotentni promote: missing stage + postojeći final smatra se već završenim;
- force cleanup staging ključa.

Adapter interface ostaje storage-provider neutralan; object-store implementacija mora dati ekvivalentan idempotentni promote/copy ugovor.

## 4. Crash i compensation ugovor

- **Stage failure:** nema DB/business promjene.
- **DB/business rollback:** staging se odmah uklanja.
- **Cleanup failure poslije rollbacka:** kreira se durable `storage.compensation` FAILED intent, pa orphan nije nevidljiv.
- **Crash/promote failure poslije DB commita:** persisted `PENDING_PROMOTION` ostaje za reconciler.
- **Worker crash pod claimom:** lease expiry omogućava drugom workeru preuzimanje.
- **Crash nakon storage promotea prije READY CAS-a:** idempotentni adapter prepoznaje postojeći final i reconciliation završava READY.
- **Final attempt crash/failure:** intent prelazi u operator-visible `FAILED`, ne ostaje vječno PROCESSING.

Reconciler koristi PostgreSQL `FOR UPDATE SKIP LOCKED`, owner token, 60-sekundni lease, attempts, bounded exponential backoff i terminalni status.

## 5. DB schema i release

Migracija `20271025230000_storage_write_protocol` dodaje `StorageWriteStatus` i `StorageWriteIntent`, uključujući:

- content hash i size;
- staging/final keys;
- attempts, `nextAttemptAt`, lease i owner token;
- error i ready timestamp;
- unique i claim indekse;
- DB CHECK granice za size, attempts i PROCESSING lease invariant.

Runtime schema sentinel je pomjeren na ovu migraciju.

> **Obavezna release radnja:** migraciju `20271025230000_storage_write_protocol` treba ručno pokrenuti kroz release migrator pri releaseu/redeployu. Obični runtime deploy je neće izvršiti.

## 6. Dokaz

Stvarni PostgreSQL + filesystem integration testovi potvrđuju:

1. finalni blob nastaje tek nakon commitovanog intenta;
2. business rollback uklanja staging i ne ostavlja intent/final blob;
3. promote outage vraća `PENDING_PROMOTION` uz očuvan business rezultat;
4. reconciler ponavlja promote i završava intent u `READY`;
5. persisted attempts potvrđuje stvarni recovery claim.

CI `40220137718` potvrđuje novu migraciju kroz puni replay, restricted runtime DML/DDL granicu, Prisma validate/generate, build, lint, pune PostgreSQL testove, frontend, container i supply-chain gateove.

## 7. Findings i sljedeći paket

W4.6 isporučuje platformsku osnovu, ali ne prebacuje automatski ticket/privacy/asset callere. Zato nijedan njihov finding nije umjetno zatvoren; registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno**.

Sljedeći paket je **Backend Val 4 / W4.7 — post-commit cache invalidation primitive, pri čemu cache/realtime nikad nije source of truth**.
