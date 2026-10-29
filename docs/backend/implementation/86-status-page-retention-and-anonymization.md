# W6.13 — Status page retention and anonymization

**Paket:** Val 6 / W6.13  
**Nalaz:** `BA-status-page-15` (P2) — Incident/update/link/subscription retention i anonymization nisu formalizovani  
**SHA:** `fa7e80a`  
**CI:** `40846691101` (u toku u trenutku pisanja)  
**DB migracije:** DA — nova migracija `20271027210000_status_page_retention`, treba ručno pokrenuti pri releaseu/redeployu

## Problem

Status-page podaci nisu imali nikakvu retention politiku:
- `ServiceIncident` (title, createdByUserId) se čuva neograničeno
- `ServiceIncidentUpdate` (message, authorUserId) se čuva neograničeno
- `TicketIncidentLink` (linkedByUserId) se čuva neograničeno
- `ServiceIncidentSubscription` (userId) se čuva neograničeno
- Nema legal hold, deletion/tombstone, user anonymization niti public content takedown za status-page

## Rešenje

### 1. Nova DB migracija (`20271027210000_status_page_retention`)

Dodaje dva nuova polja:
- `ServiceIncident.retentionArchivedAt` — datum kada je incident retention-archivisan (tombstone marker)
- `ServiceIncidentUpdate.contentRedactedAt` — datum kada je update poruka/autor redaktovan

### 2. Nova retention kategorija: `statusIncidents`

Dodana u `retentionCategories`, `retentionCategoriesRequiringDryRun` (dry run obavezan pre prvog izvršenja), `retentionExecutionOrder`, `PrivacyConfigurationLoader`, i setting definition u `privacy-settings.ts`.

**Setting ključ:** `private.privacy.retention.statusIncidentsDays`  
**Default:** `0` (onemogućeno)  
**Minimum:** 180 dana  
**Maksimum:** 36.500 dana

### 3. Retention executor (`status-incident-retention.executor.ts`)

`createStatusIncidentRetentionExecutor(prisma)` implementuje `RetentionExecutor`:

- **`preview(cutoff)`** — broji RESOLVED incidente sa `resolvedAt < cutoff` i `retentionArchivedAt: null`, plus njihove ne-redaktovane updateove
- **`executeBatch(cutoff)`** — za batch do 50 incidenta:
  1. Redaktuje `ServiceIncidentUpdate` poruke i autore (`[redacted]`, null, `contentRedactedAt = now`)
  2. Briše `TicketIncidentLink` redove (uklanja `linkedByUserId`)
  3. Briše `ServiceIncidentSubscription` redove (uklanja `userId`)
  4. Archiviše `ServiceIncident`: `title` → `[redacted]`, `titleEn` → null, `createdByUserId` → null, `retentionArchivedAt` → now

Sve radi u jednom Prisma transakciji za atomicnost. Incident skelet (id, status, datumi, broj servisa) se zadržava tako da izvještaji i uptime istorija ostaju konzistentni.

### 4. Noćni sweep integracija

`RetentionService.sweepNightly()` automatski preuzima novu kategoriju kroz `retentionExecutionOrder` i `PrivacyConfigurationLoader`. Kada je `statusIncidentsDays > 0`, retention run se pokreće u noćnom prozoru sa dry-run gate-om.

## Testni dokazi

### Unit — `status-incident-retention.executor.spec.ts`

- `category is statusIncidents`: executor se registruje pod ispravnom kategorijom
- `preview counts due incidents and their updates`: računa incidente + njihove updateove
- `executeBatch redacts incident title/author and sets retentionArchivedAt`: proverava da se title/author redaktuju, links/subs brišu, `retentionArchivedAt` se postavlja
- `returns done when batch is smaller than limit`: batch < 50 → done = true
- `returns done=false when batch is exactly the limit`: batch = 50 → done = false (nastavlja sljedeću noć)
- `returns empty batch when nothing is due`: nema fälligih incidenta → prazan batch

### Integracija — `status-incident-retention.integration.spec.ts` (stvarno PostgreSQL)

- Stari RESOLVED incident (400 dana): arhiviran, title/author redaktovani, links/subs obrisani
- Noviji RESOLVED incident (10 dana): netaknut
- Već archivisan incident: preskočen
- Update poruka redaktovana na `[redacted]`, autor postavljen na null

## Traceability

- `docs/backend/audits/29-status-page.md`: `BA-status-page-15` označeno `zatvoreno`; sekcija 10 opisuje retention/anonimizaciju; dodan W6.13 closeout
- `docs/backend/BACKEND-FINDINGS-REGISTER.md`: red `zatvoreno`; kontrolni zbir **595 otvorenih / 97 zatvorena / 692 ukupno**
- `docs/backend/backend-findings-plan.json`: `BA-status-page-15` status `zatvoreno`
- `docs/backend/BACKEND-IMPLEMENTATION-MASTER-PLAN.md`: W6.13 označen implementiranim, CI u toku

## ⚠️ VAŽNO: DB migracija

Paket carries novu DB migraciju:

```
20271027210000_status_page_retention
```

Koja dodaje `retentionArchivedAt` na `ServiceIncident` i `contentRedactedAt` na `ServiceIncidentUpdate`. Ova migracija **mora biti ručno pokrenuta pri releaseu/redeployu** pre nego što retention sweep počne da radi. Bez migracije, `PrismaService` neće poznavati nova polja i retention će biti neefektivan.

## Sljedeći paket (W6.14)

Kandidati iz preostalih status-page P2 nalaza:
- `BA-status-page-16`: open/history capped liste nemaju cursor/hasMore
- `BA-status-page-17`: edit audit/revision ne omogućava rekonstrukciju promjena
- `BA-status-page-18`: neograničeno backdating incidenta mijenja uptime istoriju
- `BA-status-page-19`: tri od pet suiteova compile-blockirana; failure/concurrency/large-volume matrica nedostaje

Konačan izbor se potvrđuje nakon zelenog CI-ja za W6.13.
