# Paket 212 — BA-announcements-18: hasMore signal za arhivu

**Status:** implementirano; CI i vlasnička potvrda Y1 u toku.
**Nalaz:** audit 28 §3.18 (P3) — archive/manage/pending liste bez cursor/hasMore signala i stabilnog tie-breaka. Stanje prije ovog paketa: manage lista je BA-14 keyset skeniranjem i `truncated` signalom već pokrivena, a report pending ima keyset cursor (BA-04/BA-12); preostali tihi cap bila je arhiva (`take: 100` bez signala).

## Promjene

| Fajl | Promjena |
| --- | --- |
| `announcements.service.ts` (`archive`) | dohvat `archiveMax + 1`; odgovor sada nosi `hasMore` i `listLimit` uz prvih 100 redova. Tie-break `startsAt desc, id asc` već postoji (BA-02). |
| `announcements.visibility.spec.ts` | postojeće očekivanje capa ažurirano na +1; novi test: `hasMore=true` i isječenih 100 kad postoji 101. red, `hasMore=false` ispod capa. |
| `frontend/src/services/announcements-api.ts` | `getAnnouncementArchive` vraća cijeli payload (`AnnouncementArchiveResponse`). |
| `frontend/src/components/announcements/announcement-archive.tsx` | kad je `hasMore`, iznad liste se prikazuje napomena `announcements.archive.truncated` s limitom. |
| `frontend/src/i18n/locales/{bs,en}/common.json` | novi ključ `announcements.archive.truncated`. |

## Semantika

- Arhiva više nikad ne izgleda potpuno kad je odsječena: korisnik vidi da postoje starije najave izvan prikaza, isti obrazac objave kao BA-14 manage lista.
- Bez migracije; API odgovor arhive je aditivan (nova polja), jedini potrošač (arhiva komponenta) je ažuriran.

## Dokaz

- Backend (stub harness): visibility + retention + retention-job → **13/13**.
- Frontend: `tsc --noEmit` čist, `prettier --check` čist, `i18n:check` OK (4597 ključeva u oba jezika). CI je autoritativan za puni suite.
