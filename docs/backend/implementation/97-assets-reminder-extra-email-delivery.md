# Zatvaranje paketa — W7.11

**Paket:** W7.11 — durable dostava i deduplikacija dodatnih asset reminder adresa<br>
**Nalaz:** `BA-assets-11` (P2) — zatvoren<br>
**Kodni commit:** `4c1be0a` (implementacija), `b7d0ae6` (tipni popravak i finalni testani kod)<br>
**Finalni testani SHA:** `b7d0ae64200c8739e6dd55976828b1b63928b545`<br>
**CI:** [`41025718081`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41025718081) — zelen na finalnom testanom SHA<br>
**DB migracija:** `20271028100000_asset_reminder_extra_email_delivery` — aditivna tabela i usklađivanje secret metapodatka settinga

## Nalaz i acceptance

Prije W7.11 dodatne interne adrese slale su se direktno kroz SMTP transport. Nije postojao per-address/per-batch red za `CLAIMED`, `SENT` ili `FAILED`, pa se nakon SMTP prihvata i pada procesa prije marker upisa mogla ponoviti poruka. Neuspjeh je bio vidljiv samo u logu. Konfiguracija dodatnih primalaca dobija pun installation-wide spisak po postojećem ugovoru, zato mora biti dostupna samo kroz globalni settings pristup, auditirana i redigovana.

Acceptance je ograničen na `BA-assets-11`: trajno stanje i dedupe identitet po normalizovanoj dodatnoj adresi i batchu; oporavak `FAILED` i zastarjelog `CLAIMED`; fencing starog workera; korištenje ranijeg `SENT` zapisa da se dovrši retry marker bez ponovnog slanja. Ostatak W7.11 ne mijenja scoped korisničku dostavu, installation-wide sadržaj dodatne poruke, W7.4 threshold pravilo, schedulere niti `BA-assets-18`.

## Implementacija

- `AssetReminderEmailDelivery` je nova Prisma tabela bez user FK-a, prikladna za proizvoljne konfigurirane interne adrese. Čuva samo SHA-256 hash normalizovane adrese, stabilni batch dedupe ključ, `CLAIMED`/`SENT`/`FAILED`, broj pokušaja, UUID claim token i vremenske oznake. Unique `(recipientHash, dedupeKey)` sprječava dupli claim; status, pokušaji i kombinacija status/token imaju DB `CHECK` ograničenja. Indeks `(status, updatedAt)` podržava pregled aktivnih/zastarjelih claimova. Sirova adresa i sadržaj poruke nisu u delivery tabeli.
- `asset-reminder-email-delivery.ts` koristi atomarni unique insert i `updateMany` CAS. `FAILED` je odmah ponovo preuzimljiv; `CLAIMED` se može preuzeti nakon **10 minuta** bez updatea. Svako preuzimanje mijenja token i uvećava pokušaje. `SENT` je dedupe pogodak. Preuzimanje, označavanje `SENT` i označavanje `FAILED` provjeravaju trenutni token, pa prethodni worker ne može mijenjati noviji claim.
- Batch ključ je SHA-256 fingerprint sortiranog skupa `(kind, item id, crossed threshold, expiry date)`. Adrese se trimuju, pretvaraju u mala slova i deduplikuju prije slanja; njihov identitet u delivery tabeli je zaseban SHA-256 hash. Postojeće ograničenje dodatnih adresa na interne primaoce i puni installation-wide spisak ostaju nepromijenjeni.
- `AssetRemindersService.sendToExtras()` čita delivery stanje prije SMTP slanja. `SENT` potvrđuje marker retry bez slanja; `FAILED` ili stale `CLAIMED` dobija novi claim; aktivni claim se preskače. Uspješan SMTP pokušaj se broji tek nakon token-fenced upisa `SENT`; greška upisuje `FAILED`. Ako nema scoped primaoca, prethodni `SENT` ili novo potvrđeni `SENT` može zadovoljiti postojeće W7.4 pravilo. Dodatna adresa ne postaje zamjenski scoped kanal.
- Setting `private.assets.reminders.recipients` sada je `secret`: raw lista ostaje u postojećoj konfiguraciji jer je potrebna za slanje, ali se ne vraća kroz private-settings zbir niti se prikazuje u settings registryju/change logu. Servis koristi `getSecretForInternalUse`. `settings.write` ostaje globalni settings permission, OU-scoped grant je odbijen, a obavezni razlog i actor se bilježe; novi change-log zapisi rediguju vrijednost. Migracija ažurira `AppSetting.scope/isSecret` metapodatke postojeće opcionalne vrijednosti bez promjene samog JSON-a. Stari historijski change-log zapisi se ne prepisuju, kako se ne bi mijenjao audit trag.
- Greška dodatnog SMTP slanja se loguje generički, bez adrese, SMTP teksta ili fragmenta poruke. Delivery tabela ne čuva SMTP odgovor niti payload.
- Nije uveden exactly-once SMTP ugovor: ako SMTP prihvati poruku, a proces padne prije trajnog `SENT`, stale reclaim može poslati ponovo. To je svjesni at-least-once prozor. Claim-token fencing sprečava samo da stari worker promijeni stanje novog workera; ne može opozvati već prihvaćenu SMTP poruku.
- Nisu mijenjani scoped user e-mail/in-app tokovi, email preferences, marker CAS, BullMQ rasporedi, API rute ni `BA-assets-18` health/metrics scope.

## Direktni testni dokaz

- `backend/src/modules/assets/reminders/asset-reminder-email-delivery.spec.ts` pokriva normalizovani hash, prvi claim, `SENT` dedupe, `FAILED` retry sa uvećanim pokušajem, stale naspram aktivnog claima, unique-key race i token-fenced `SENT`/`FAILED` update.
- `backend/src/modules/assets/reminders/asset-reminder-email-delivery.integration.spec.ts` je registrovan u izolovanom PostgreSQL runneru i pokriva paralelni claim (tačno jedan vlasnik), `SENT` bez ponovnog slanja, retry nakon `FAILED`, preuzimanje claima starijeg od 10 minuta i odbijanje updatea starim tokenom. Provjerava i da red ne sadrži `toAddress` ni poruku.
- `backend/src/modules/assets/reminders/asset-reminders.service.spec.ts` pokriva normalizovane duple adrese, durable status, raniji `SENT` koji dovršava marker retry bez SMTP-a, `FAILED` nakon SMTP greške i log bez adrese/sadržaja.
- `backend/src/modules/settings/settings.change-log.spec.ts` potvrđuje da je recipient setting secret, ostaje čitljiv samo internom secret accessor-u, ne izlazi kroz `getPrivateSettings`/registry i ne pojavljuje se u novom change logu. `settings.authorization-compatibility.spec.ts` dokazuje odbijanje OU-scoped `settings.write` pristupa installation-wide konfiguraciji.
- `backend/src/common/database/database-runtime-contract.spec.ts` zaključava novi latest-schema sentinel; runner test zaključava registraciju novog PostgreSQL suitea.

## Commit, CI i testni dokaz

Finalni testani kodni SHA `b7d0ae64200c8739e6dd55976828b1b63928b545` prošao je CI [`41025718081`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41025718081):

- **Backend:** Prisma schema validate/generate, generated-artifact i wiring guardovi, build, lint, ranije compile-blocked suiteovi, SLA matrix i puni Jest suite — zeleno.
- **PostgreSQL/Redis integration:** svih 99 migracija je replayano kroz postojeći single-owner release migrator; privileges, migration history, connection budget, backup/restore i integration harness provjere su zelene; real PostgreSQL suiteovi uključuju novi W7.11 concurrency/status/reclaim shard.
- **Frontend:** lint, format, testovi, build i bundle/cold-route budžeti — zeleno.
- **Docs/CI/container:** docs guard, CI gate, container contract/model, image build, SBOM, skenovi i provenance — zeleno.
- **Preskočeno:** `E2E critical flows` i `E2E install wizard` nisu pokrenuti na push workflowu. `Enforce zero high/critical image vulnerabilities` je `skipped` jer nije bilo actionable high/critical nalaza; nije CI pad.
- **Neuspjeli pokušaj:** CI [`41025218482`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41025218482) na SHA `4c1be0af4c90d001d4adff29529c8c111a8f53ec` pao je u backend Jest i PostgreSQL integration TypeScript kompilaciji: helper je tražio puni `PrismaService`, dok integration fixture koristi direktni `PrismaClient` bez Nest lifecycle hookova. API/model/migracija nisu bili uzrok. Helper je sužen na delegate-only `Pick<PrismaService, 'assetReminderEmailDelivery'>`; naredni CI `41025718081` na `b7d0ae6` je zelen. Ovo je greška ovog paketa, ispravljena prije zatvaranja; nije preegzistentna greška.

Lokalno su prošli `node scripts/check-migration-policy.mjs` (99 migracija, destructive approval hashes važeći), `node --test scripts/check-migration-policy.test.mjs` (2/2), JavaScript `node --check` za integration runner/test i `git diff --check`. Lokalni backend Jest/Prisma/PostgreSQL testovi nisu pokrenuti jer sandbox nema instaliran `backend/node_modules` ni generisani Prisma client; puni CI je izvršio validaciju, generisanje i suiteove.

## Registar nalaza

- Zatvoren je samo `BA-assets-11` (P2).
- `BA-assets-12`–`BA-assets-19` ostaju otvoreni; posebno `BA-assets-18` health/metrics nalaz nije dio ovog paketa.
- Deklarisani zbir nakon W7.11: **578 otvorenih / 114 zatvorenih / 692 ukupno**. Machine-readable source statusi su **581 otvoren / 100 zatvorenih / 11 historijskih**; preegzistentna razlika od tri statusa prema deklarisanom agregatu ostaje dokumentovana i nije rekoncilirana izvan scopea.
- Baseline audit ocjena **4,59/10** ostaje početni snapshot i nije retroaktivno preračunata.

## Migracija, preflight, rollout i rollback

Migracija `20271028100000_asset_reminder_extra_email_delivery` je aditivna i transakcijska: označava postojeći recipient setting kao `PRIVATE/isSecret=true` bez mijenjanja JSON vrijednosti, zatim kreira praznu delivery tabelu, ograničenja i indekse. Nema delivery redova za backfill niti podataka za deduplikaciju/reconciliation. Runtime schema sentinel i test su pomjereni na ovu zadnju migraciju.

**Preflight prije release migratora:**

1. Sačuvati standardni DB backup/snapshot i potvrditi da je prethodna `20271028000000_asset_ticket_primary_invariant` uspješno primijenjena te da nema neuspjele, neriješene Prisma migracije.
2. Provjeriti da `to_regclass('"AssetReminderEmailDelivery"')` vraća `NULL`; ako tabela već postoji izvan Prisma historyja, zaustaviti release i utvrditi njeno porijeklo umjesto da se ručno briše.
3. Pregledati opcionalni setting red; njegov jedinstveni `key` smije vratiti nula ili jedan red. Migracija ne mijenja konfiguracijsku vrijednost:

```sql
SELECT "key", "scope", "isSecret"
FROM "AppSetting"
WHERE "key" = 'private.assets.reminders.recipients';
```

4. Pokrenuti postojeći single-owner `npm run db:migrate:release` kroz release migrator. Pošto su ranije migracije već uspješno primijenjene, release migrator treba izvršiti samo novu pending migraciju; **ne pokretati ponovo ranije migracije niti ručno izvršavati kopiju SQL-a**.
5. Nakon uspjeha provjeriti novu završenu migraciju, tabelu/indexe/constraint-e, da je tabela prazna te da postojeći setting red (ako postoji) ima `scope=PRIVATE` i `isSecret=true`. Tek zatim rolloutati aplikacijski build sa novim Prisma modelom i accessorom.

**Rollback i forward recovery:** ako release migracija padne, njena PostgreSQL transakcija vraća i metadata update i DDL. Nakon utvrđenog uzroka, `prisma migrate resolve --rolled-back 20271028100000_asset_reminder_extra_email_delivery` koristi se samo za taj neuspjeli pokušaj prije ponovnog release migratora. Ne označavati uspješno primijenjenu migraciju kao rolled-back i ne dropovati tabelu ručno. Nakon uspješnog applya, aplikacijski rollback može ostaviti neiskorištenu aditivnu tabelu; međutim build prije W7.11 klasifikuje recipient setting kao običan private i ne pruža isto redigovanje, zato rollback na takav build nosi izričit rizik ponovnog izlaganja konfiguracije. Preferirati forward recovery ili zadržati secret/redaction korekciju. Uklanjanje schema objekata, ako ikad bude potrebno, ide zasebnom reviewed forward-only cleanup migracijom.

## Sljedeći paket

**W7.12 — `BA-assets-12` (P2):** transactional audit ili durable post-commit outbox za asset license/contract/transfer business writeove. Nije započet; W7.11 je zatvoren tek nakon zelenog CI-ja.
