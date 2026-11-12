# Paket 214 — BA-notifications-14: dokazna matrica kritičnih scenarija

**Status:** implementirano (dokazni paket, bez promjene koda); čeka se CI dokaz i operativna potvrda AA1.
**Nalaz:** audit 17 §3.14 (P3) — kritični recovery/scope/concurrency scenariji nemaju E2E dokaz: ticket event → durable inbox/email nakon restarta, group membership revocation, digest access revocation, preference DB failure, concurrent dedupe, mark-all race, quiet/on-call kombinacija i pagination historija.

## Matrica dokaza

Matrica ispod prikuplja raspoložive dokaze na različitim slojevima. Unit i integration testovi ne predstavljaju E2E dokaz svih navedenih scenarija; browser E2E 36 pokriva samo zaseban dio toka. Nalaz ostaje otvoren do traženog dokaza.

| Scenario | Test | Sloj |
| --- | --- | --- |
| Ticket event → durable inbox nakon restarta | `notification-fan-out-outbox.integration.spec.ts`: „replays a committed message after consumer restart into one inbox row" + „commits one fan-out intent with each message and rolls it back with the message" | PostgreSQL integration |
| E-mail recovery / provider ishod | `notification-email-delivery-recovery.integration.spec.ts`: provider acceptance evidencija, retryable SMTP failure, stale claim → UNKNOWN bez slijepog resenda | PostgreSQL integration |
| Group membership revocation | `notifications.membership-cache.spec.ts` (warm cache pa autoritativna promjena) + digest: „drops held items after authoritative membership revocation despite a warmed group cache" | unit |
| Digest access revocation / fail-closed | `notification-digest.service.spec.ts`: „rechecks held items in the test-digest path and never composes revoked ticket facts", „fails closed when authorization cannot be checked" | unit |
| Preference DB failure | `notification-preference-policy.spec.ts`: „fails closed on a rejected setting read when no good snapshot exists" | unit |
| Concurrent dedupe | fan-out outbox integration: „returns and emits only rows persisted by concurrent duplicate batches" | PostgreSQL integration |
| Mark-all race | `notification-mark-all-read.integration.spec.ts`: post-snapshot redovi ostaju unread, bounded keyset receipts, rollback na grešci | PostgreSQL integration |
| Quiet hours | `notification-digest.service.spec.ts`: „flushes held items when quiet hours are over" | unit |
| Pagination historija | `notifications-list-pagination.integration.spec.ts`: svaki red tačno jednom preko tied timestampova, unread filter na kasnijim stranicama | PostgreSQL integration |
| Browser nivo | E2E `36-notifications-email.spec.ts` (ops health email blok, test alarm kanali, `ops.alert`, mark-read, admin kartica) u dnevnom schedule CI-ju | Playwright |

## Dokaz

- Dnevni schedule CI [`43178874566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43178874566) prošao je u cijelosti (uključujući E2E critical flows i PostgreSQL+Redis integration).
- Integration suiteovi su registrovani u `backend/scripts/run-isolated-integration.mjs` i izvršavaju se u svakom CI integration jobu.
- Bez promjene koda, bez migracije.

## Pripremljeni browser realtime scenarij

Opt-in `59-notifications-realtime.spec.ts` kreira tiket na izolovanom stacku, drži korisnički notification panel otvoren, kreira odgovor kroz admin API i traži Socket.IO `notification.created` frame koji sadrži konkretni ID tiketa i poruke te porast broja prikazanih redova u panelu bez ponovnog otvaranja. To testira pozitivnu browser isporuku, ne recovery, revocation ili race matricu. Izvršavanje je uslovljeno `E2E_VAL6_REALTIME=1`; bez toga je skipped. Lokalno su prošli samo TypeScript i Playwright listing, ne puni browser test. Nalaz ostaje otvoren dok se ne dobiju stvarni dokazi za preostale scenarije.

### Ciljani run 43306768799

Test 59 je izvršen, ali je pao prije provjere događaja: selektor regiona istovremeno je obuhvatio panel i toast region istog pristupačnog naziva. Selektor je sužen na ID notification panela; potreban je novi browser run, dosadašnji rezultat nije dokaz realtime isporuke.
