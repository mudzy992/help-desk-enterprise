# W5.37 — Poison-isolated SLA scan/backfill batch obrada

**Finding:** `BA-sla-07`  
**Implementacija:** `69f63ac`, `2265870`, `3935807`  
**CI:** `40564945465` — zelen

## Problem

Scan i backfill petlje su sekvencijalno pozivale SLA state machine bez per-ticket granice greške. Jedan corrupt kalendar/state ili drugi deterministički kvar prekidao je cijeli BullMQ ciklus; retry je zatim ponavljao već obrađene redove, dok zdravi redovi iza poison zapisa nisu napredovali.

## Implementacija

Svaki ticket se sada obrađuje u vlastitom `try/catch` okviru u scan i backfill petlji. Kvar jednog reda se zapisuje kao durable `SlaScanFailure`, emituje strukturirani `sla_scan_item_failed` zapis i obrada nastavlja sa sljedećim ticketom.

Failure zapis čuva ticket, fazu (`scan`/`backfill`), broj pokušaja, sanitizovanu posljednju grešku, first/last failure vrijeme, `nextAttemptAt` i `quarantinedAt`:

- prvi i drugi kvar dobijaju eksponencijalni retry delay;
- treći uzastopni kvar trajno karantiniše ticket;
- uspješna obrada briše prethodni transient failure zapis;
- scan/backfill DB query unaprijed izostavlja ticket čiji retry još nije dospio ili je karantiran, pa poison red ne troši batch slot i ne blokira zdrave redove.

`SlaScanFailure` je ownership metadata ticketa i briše se kaskadno sa ticketom. Taj namjerni lifecycle ugovor je evidentiran u destructive-migration approval manifestu. Schema readiness sentinel je pomjeren na novu migraciju, pa runtime neće postati ready na staroj šemi.

## Dokaz

- Fokusirani failure-state test dokazuje transient backoff i quarantine na trećem kvaru.
- Scan test ubrizgava deterministički kvar u prvi od tri due statea i dokazuje da preostala dva zdrava statea završavaju breach obradu u istom ciklusu.
- Generated Prisma build potvrđuje relation/query ugovor.
- PostgreSQL CI shard replaya sve migracije, potvrđuje migration history i restricted runtime role.
- Finalni CI `40564945465` je potpuno zelen.

Prvi CI `40563649775` je ispravno zaustavljen migration policy gateom jer schema readiness sentinel i explicit cascade approval još nisu bili ažurirani. Commitovi `2265870` i `3935807` zatvorili su oba release-safety ugovora prije zelenog finalnog CI-ja.

## Migracija i release

Paket uvodi migraciju **`20271027180000_sla_scan_failure_quarantine`**. Ona kreira `SlaScanFailure`, unique ticket ownership, retry/quarantine indeks i FK lifecycle.

**Migraciju je obavezno ručno izvršiti release migratorom pri releaseu/redeployu prije pokretanja nove aplikacijske verzije.**

## Ishod

Poison SLA state ili backfill ticket više ne prekida healthy batch niti se beskonačno vraća na vrh reda. `BA-sla-07` je zatvoren; registar prelazi na **619 otvorenih / 73 zatvorena / 692 ukupno**.
