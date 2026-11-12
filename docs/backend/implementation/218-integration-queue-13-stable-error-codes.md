# Paket 218 — BA-integration-queue-13: stabilan code u `lastError`, bez raw provider teksta

**Status:** implementirano; CI i vlasnička potvrda AC1 u toku.
**Nalaz:** audit 19 §3.13 (P3) — `lastError` je čuvao sirovi `error.message` bez stabilnog codea i redakcijskog ugovora; provider poruka može sadržavati adresu primaoca, host ili response tekst. Admin API redakcija je ranije riješena (paket 152, BA-04), ali je sirovi tekst i dalje stajao u bazi do terminalnog retentiona.

## Promjene

| Fajl | Promjena |
| --- | --- |
| `handle-integration-job-failure.ts` | Nova `resolveIntegrationJobFailureCode(error, type)`: outcome-unknown → `PROVIDER_DELIVERY_OUTCOME_UNKNOWN`; payload limit → `INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED`; e-mail → `MAIL_SEND_FAILED_<DAILY_LIMIT/RATE_LIMIT/AUTH/RECIPIENT/TRANSIENT>` prema postojećoj `classifyMailSendError` klasifikaciji; ostalo → `INTEGRATION_JOB_FAILED`. I `markFailed` i `markDeadLetter` sada spremaju kod umjesto poruke. |
| `handle-integration-job-failure.spec.ts` | Postojeća očekivanja ažurirana (`'SMTP unavailable'` → `MAIL_SEND_FAILED_TRANSIENT`); novi testovi: poruka s adresom i SMTP kodom 550 daje `MAIL_SEND_FAILED_RECIPIENT` bez `@` u pohranjenoj vrijednosti; payload-limit/outcome-unknown/generic mapiranje. |

## Semantika

- Baza više nikad ne akumulira sirovi provider tekst u queue redu; vrsta kvara ostaje dijagnostički dostupna kroz stabilan kod (frontend ga mapira na postojeći generički/prijevodni prikaz, BA-04 ugovor se ne mijenja).
- Stari redovi sa sirovim tekstom ostaju čitljivi kroz postojeće API mapiranje (nepoznato → `INTEGRATION_JOB_FAILED`), a terminalni retention ih redaktuje kao i dosad; migracija podataka nije potrebna.
- Bez schema promjene i bez migracije.

## Dokaz

- Lokalno (stub harness): failure spec **14/14**, repository + response specovi prolaze. CI je autoritativan.
