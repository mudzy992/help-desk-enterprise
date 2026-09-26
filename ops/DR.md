# Disaster recovery (EP-HelpDesk)

Deploy odluke (bez Traefik-a, Postgres van compose-a, volume `/usr/app/uploads`): `ops/COOLIFY.md` i `.cursor/docs/05-infra-coolify.md`. Ovaj fajl je backup/restore runbook. Ne committati `.env` ni dumpove.

## Ciljevi

| Metrika | MVP target | Kako se drži |
|---|---|---|
| **RPO** | ≤ 24h | Daily backup sva tri izvora ispod, off-box |
| **RTO** | ≤ 4h | Restore Postgres + `uploads` + Coolify env, pa 4 verifikacije |

Drill **ne** overwrite-a prod. Koristi staging (`ba101.top`) ili odvojeni prod-like klon. Secreti (SMTP, Entra, `DATABASE_URL`, Redis ACL) žive u Coolify Environment — nisu u config snapshotu.

Van backup seta: Redis/BullMQ (job audit je u Postgres `IntegrationJob`; queue se rebuild-a). Redis ACL ostaje `ops/redis-acl.line`.

## Backup politika

Retention za sva tri izvora: **≥ 14 dnevnih kopija**. Schedule: **jednom dnevno** (RPO 24h). Destinacija off-box (Coolify backup storage i/ili S3), ne samo disk Coolify hosta.

### 1. PostgreSQL (Coolify Database)

Postgres **nije** u `docker-compose.yml`. Coolify Database resurs → Backups:

1. Uključi scheduled backup, frequency **daily**.
2. Retention **≥ 14** kopija (Coolify “backups to keep”).
3. Connection string restore-ane instance ide u `DATABASE_URL` (isti ključ kao u `.env.example`).

### 2. Uploads dir

Named volume `uploads` (compose) mountan na `/usr/app/uploads` na **backend i worker** (`UPLOAD_ROOT`). Database backup **ne** uključuje fajlove. U DB je samo path.

Daily, read-only volume → arhiva na istu off-box destinaciju kao Postgres, ime `uploads-YYYY-MM-DD.tar.gz`. Primjer (ime volume-a prilagodi `docker volume ls`):

```bash
docker run --rm \
  -v uploads:/data:ro \
  -v /var/backups/ephelpdesk:/backup \
  alpine tar -C /data -czf /backup/uploads-$(date -u +%F).tar.gz .
```

Briši lokalne arhive starije od retention-a nakon što je off-box kopija potvrđena.

### 3. Config exports (settings / routing / SLA / forms)

Ne postoji poseban export servis. Koristi F8-1 `ConfigVersion.snapshot` (`collectConfigSnapshot`). Scope default: `settings,routing,sla,service_catalog,service_forms`. **Secret setting values se ne snimaju.**

Zahtijeva `private.configVersioning.enabled=true`, Admin + `settings.write`. Nakon uspješnog DB backupa:

1. `POST /config-versions` body `{ "releaseNotes": "DR backup YYYY-MM-DD" }` — snima live snapshot (status `DRAFT`).
2. `GET /config-versions/:id` — polje `snapshot` spremi kao `config-YYYY-MM-DD.json` **off-box**.

`GET /config-versions` lista je metadata-only (bez `snapshot`). Snapshot je i u Postgres tabeli `ConfigVersion` (DB restore ga vraća); JSON fajl je fallback ako dump nije upotrebljiv. Restore konfiguracije na live radi `POST /config-versions/:id/validate` pa `POST /config-versions/:id/activate` — **samo** ako DB restore nije vratio ispravan running config; activate ne dira secret keys.

## Restore (prod incident ili drill)

Preduslov: Coolify Environment ključevi iz `.env.example` već na ciljnom stacku (uključujući `VITE_API_BASE_URL` kao build arg).

1. Restore PostgreSQL iz Coolify Database backupa na **ciljnu** bazu. `DATABASE_URL` → ta baza.
2. Restore `uploads` volume iz `uploads-YYYY-MM-DD.tar.gz` (isti mount `/usr/app/uploads` na backend i worker).
3. Deploy compose (`ops/COOLIFY.md`). Backend radi `prisma migrate deploy` pa API. **Ne** pokretati install wizard na restore-anoj bazi.
4. Ako running config nije konzistentan, a `ConfigVersion` red postoji u restore-anoj bazi: `validate` pa `activate`. Nema import API-ja za off-box JSON — fajl je fallback (inspect/diff; ručni unos u `ConfigVersion.snapshot` samo ako dump nije upotrebljiv).
5. Health: `GET https://api.…/health`. Zatim verifikacija ispod. Cilj: stack + 4 checka unutar 4h.

## Restore drill checklist (min. 1× mjesečno)

Datum, operator, backup ID/filename (Postgres + uploads + config JSON), okruženje, pass/fail — upisati u ops evidenciju (nije u gitu).

- [ ] Izabran restore set ≤ 24h star (RPO). Drill okruženje nije prod.
- [ ] Postgres restore + `DATABASE_URL` na klon.
- [ ] Uploads volume restore; backend i worker dijele volume.
- [ ] Stack up; wizard se ne pokreće; `/health` 200.
- [ ] **Login:** `POST /auth/login` (local) ili `POST /auth/entra`. Session: `GET /auth/session`.
- [ ] **Create ticket:** `POST /tickets` (validan catalog/form). Očekivano 2xx i ticket id.
- [ ] **Download attachment:** `GET /tickets/:ticketId/attachments/:attachmentId/content` za attachment koji je postojao **prije** backupa (dokaz da je volume restore-an, ne samo novi upload). HTTP 200 + očekivani MIME/sadržaj.
- [ ] **Audit export:** `GET /audit-logs/export?format=json&organizationalUnitId=` (Admin + `audit.export` + OU scope). 200 i fajl; `format=csv` ako je u `allowedFormatsCsv`.
- [ ] Fail: ne označavati drill uspješnim; popraviti backup/restore pa ponoviti. Pass: zabilježiti trajanje vs RTO 4h.

Nema matrix foldera za ovaj runbook. Config snapshot API: `.cursor/docs/matrices/config-versioning-rollback/MATRIX.md`.

## Skripte i drill (paket 1.8)

Automatizovani koraci iz ovog runbooka su u `ops/dr/`:
- `backup-uploads.sh` — dnevna arhiva uploads volumena (cron na hostu);
- `export-config.sh` — config snapshot „DR backup YYYY-MM-DD";
- `restore-drill.sh` — restore u zasebnu bazu `ephelpdesk-drill` i volumen `ephd-drill-uploads`;
- `verify-restore.mjs` — četiri provjere (login, tiket, stari prilog, audit export) i JSON za zapisnik.

Postupak mjesečnog drilla s privremenim Coolify stackom i obrazac zapisnika su u `docs/ops/test-okruzenje-1.8.md` (§4 i §5).

## Paket 2.1: ključ za MFA

`MFA_ENCRYPTION_KEY` (backend env) čuvati u backupu tajni. Bez njega se TOTP tajne ne mogu dešifrovati i svi korisnici s MFA moraju proći reset (`ops/runbook/mfa-reset.md`).
