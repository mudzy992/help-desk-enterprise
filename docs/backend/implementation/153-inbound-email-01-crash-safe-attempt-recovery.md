# Paket 153 — W6.38 / `BA-inbound-email-01` crash-safe attempt recovery

**Paket:** W6.38 — durable inbound-email attempts<br>
**Nalaz:** `BA-inbound-email-01` (P1) — zatvoren na finding nivou<br>
**Kodni commit:** [`4349140`](https://github.com/mudzy992/help-desk-enterprise/commit/4349140f4e1a420546bc82a2cc2094ab540e3009)<br>
**Finalni testani SHA:** [`23f8d08`](https://github.com/mudzy992/help-desk-enterprise/commit/23f8d084b077132bd6fd62ed47755c979e75547a)<br>
**CI:** [`42495558412`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42495558412) — zelen<br>
**Migracija:** `20271031200000_inbound_email_crash_safe_recovery`; replayovana samo na disposable CI bazi, bez target-DB pristupa

## Nalaz i acceptance

Prije ove korekcije svaki postojeći `PROCESSING` red mogao se odmah tretirati kao prekinut i premjestiti u `rejected`. Crash prije ticket upisa tako je mogao izgubiti legitimnu poruku, dok bi replay poslije ticket upisa mogao napraviti duplikat.

Acceptance za ovaj finding-level closeout:

1. Svaki novi pokušaj ima durable fazu i ograničeni owner lease; nakon lease expiryja samo jedan worker može preuzeti pokušaj, a stari owner ne može finalizirati.
2. Replay nakon neizvjesnog ishoda ticket mutacije prvo pronalazi prethodno zapisani ticket/message rezultat ili ponavlja mutaciju pomoću stabilnih unique idempotency ključeva.
3. Tehnički kvar ostavlja poruku retryable u inboxu; trajni DB ishod se upisuje prije mailbox movea, pa se move može dovršiti pri narednom pollu.
4. Pre-W6.38 redovi bez phase/lease dokaza ne replayaju se naslijepo i ne premještaju automatski u `rejected`; ostaju u inboxu uz upozorenje i zahtijevaju operator reconciliation.

Ovaj paket zatvara **samo** `BA-inbound-email-01`. Ne zatvara sender-trust nalaz `BA-inbound-email-02`, scoped-admin disclosure `BA-inbound-email-03`, inbound P2/P3 nalaze, mailbox-provider E2E, ostale Val 6 P1 nalaze ili BA-15 acceptance.

## Implementacija

- `InboundEmail` bilježi `processingPhase`, `processingOwnerToken` i `processingLeaseExpiresAt`. Conditional claim, heartbeat i owner/lease fencing sprečavaju paralelni ili zastarjeli worker da prepiše konačan ishod.
- Faze prije i tokom ticket mutacije omogućavaju da se retry razlikuje od početka novog pokušaja. `readPersistedResult` rekonstruira postojeći ticket/message rezultat prije replaya.
- `Ticket.sourceInboundEmailId` je unique; reply/reopen message-i i attachmenti koriste stabilne idempotency ključeve. DB unique invariants zatvaraju response-loss prozore u kojima je write commitovan, ali worker nije dobio potvrdu.
- Konačni inbound status se upisuje prije premještanja poruke. Ako mailbox move ne uspije nakon commita, naredni poll dovršava samo move.
- Legacy redovi bez sigurnog replay dokaza ostaju zadržani za ručnu reconciliation odluku. Target baza nije pregledana, pa se ne tvrdi da takvih redova nema.

## Direktni testni dokaz

- `backend/src/modules/inbound-email/inbound-email-recovery.spec.ts` — simulira izgubljen odgovor nakon trajnog ticket-message writea; retry pronalazi isti idempotency rezultat, ne stvara drugi message i završava mailbox move. Također potvrđuje da legacy `PROCESSING`/`FAILED` red bez phase/lease dokaza nije automatski promijenjen niti premješten.
- `backend/src/modules/inbound-email/inbound-email-recovery.integration.spec.ts` — nad stvarnim PostgreSQL-om potvrđuje reclaim expired `PROCESSING` lease-a, odbijanje stale/expired owner finalizacije, samo jednog pobjednika claima i unique zaštitu za source ticket, reply i attachment.
- `backend/scripts/run-isolated-integration.mjs` registruje navedeni recovery integration spec; CI migration replay je izvršen samo na disposable bazi.

## CI i testni dokaz

CI run [`42495558412`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42495558412) na SHA `23f8d084b077132bd6fd62ed47755c979e75547a` završio je **success**, uključujući CI gate:

- **Backend:** generated-Prisma build, lint i puni Jest prošli; time je izvršen i `inbound-email-recovery.spec.ts`.
- **PostgreSQL/Redis integration:** prošla, uključujući registrovani inbound recovery integration spec i disposable migration replay.
- **Frontend:** build i testovi prošli.
- **Docs/container:** Docs guard i container/supply-chain job prošli.
- **Skipped:** E2E critical flows, E2E install wizard i read-only inventory bili su `skipped`, ne `passed`; conditional korak „zero high/critical image vulnerabilities” također je `skipped`. Ovaj paket ne tvrdi E2E ili inventory sign-off niti nezavisni vulnerability enforcement.
- **Raniji pokušaj:** CI [`42494655150`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42494655150) na prethodnom SHA-u pao je na nepovezanom ticket-test mock/Prisma `upsert` payload mismatchu. Mock je ispravljen u `23f8d08`; finalni CI `42495558412` je zelen.

U ovom dokumentacijskom closeoutu nisu lokalno ponovo pokretani application testovi, migration ni E2E. Ne navodi se lokalni testni uspjeh; acceptance dokaz je finalni automatski CI iznad.

## Registar nalaza

- Zatvoren: `BA-inbound-email-01` (P1), na finding nivou.
- Ostaju otvoreni P1 u Valu 6: `BA-inbound-email-02/03`, `BA-on-call-01/02/03` i `BA-announcements-01/02/03/04`.
- `BA-inbound-email-04`–`10` (P2) i `BA-inbound-email-11`–`13` (P3) ostaju otvoreni i nisu obuhvaćeni ovim paketom.
- Val 6: **42/109 zatvorenih, 67 otvorenih (9 P1 / 41 P2 / 17 P3)**.
- Izvorne audit-tabele/generisani plan: **519 otvorenih / 173 zatvorena**. Redovi globalnog registra: **529 otvorenih / 163 zatvorena**. Deset ranije evidentiranih razlika statusa ostaje netaknuto.
- Val 6 nije završen; BA-15 full critical-flow acceptance ostaje zasebno pending.

## Migracija, rollout i rollback

Migracija `20271031200000_inbound_email_crash_safe_recovery` je već dio testanog koda. CI ju je replayovao samo nad disposable PostgreSQL bazom. Target baza nije korištena niti je njeno migration stanje provjereno; ciljnu migraciju/redeploy pokreće korisnik. Nema novog migration fajla u ovom closeoutu, PR-a, mergea ili deploymenta. Ne rollbackati additive schema nakon što novi procesi mogu zapisati idempotency podatke; eventualni rollback zahtijeva zasebnu provjeru kompatibilnosti i nije izvršen.

## Sljedeći paket

**W6 P1 — `BA-inbound-email-02`:** ograničiti sender-auth odluku na receiver-trusted `authserv-id`/header chain i dodati negativni forged/untrusted-header dokaz. Nije započet ovim closeoutom. P2/P3, BA-15 i ručni puni E2E ostaju izvan trenutnog scopea.
