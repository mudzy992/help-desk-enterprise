# Paket 211 — BA-announcements-17: retention kao zaseban job s retryjem

**Status:** implementirano; CI i vlasnička potvrda X1 u toku.
**Nalaz:** audit 28 §3.17 (P3) — retention je radio unutar 5-minutnog sweepa (kandidati skenirani svaki sweep), a neuspjeh se gutao kao upozorenje, pa neuspjeli retention nije bio vidljiv niti retryan; ritam je bio vezan za sweep, ne za retention-semantiku.

## Promjene

| Fajl | Promjena |
| --- | --- |
| `announcements.service.ts` | retention uklonjen iz `sweep()`; javni `runRetention(now)` briše potvrde/odbacivanja + satelite i vraća ukupan broj obrisanih redova. Greška propagira (više nema swalowed warn-a); per-announcement satelitski neuspjeh se prikuplja i na kraju baca `announcement_retention_incomplete` — pojedina najava ostaje fail-closed (npr. legal hold), ostale se obrađuju. |
| `announcement-retention.job.constants.ts` (novo) | queue `announcement-retention`, hourly pattern `0 17 * * * *`, attempts 3, backoff 60 s, timeout/lock 300 s, keep 10/20. |
| `announcement-retention.scheduler.service.ts` (novo) | registracija + 60 s self-heal (`announcement_retention_schedule_recovered`), identičan uzorak kao BA-11 sweep scheduler. |
| `announcement-retention.processor.ts` (novo) | concurrency 1; metric log; greška se baca → job zaista FAIL-uje i BullMQ retrya. |
| `announcement-worker.module.ts` | queue + processor + scheduler registrovani u worker modulu. |
| `announcements.retention.spec.ts` | BA-15 satelitski testovi zadržani; novi: total iz `runRetention`, propagacija greške (`announcement_retention_incomplete`), sweep više ne radi retention. |
| `announcement-retention.job.spec.ts` (novo) | processor: uspjeh vs bacanje greške; scheduler: registracija + self-heal. |

## Semantika

- Ritam je sada eksplicitan retention ritam (satno), ne nuspojava sweepa; skeniranje kandidata više ne opterećuje 5-minutni sweep.
- „Alarm" = job vidljivost: neuspjeli retention sada pravi FAILED job s 3 pokušaja i `failed: 1` metric liniju (`AnnouncementRetentionJob`), umjesto tihog upozorenja; failed jobovi se zadržavaju (20) za inspekciju (DLQ politika paketa iz istog modula).
- Legal-hold/fail-closed pravila iz BA-15 se ne mijenjaju.

## Dokaz

- `npx jest --config <stub> announcements/…retention|announcement-retention.job|preview|list|snapshot|report|authorization|concurrency…` → **8/8 suita, 32/32 testa**. Lokalni harness je stub okruženje (diagnostics:false) — CI je autoritativan.
