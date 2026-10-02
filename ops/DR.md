# Disaster recovery (Service Desk)

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

Daily, read-only volumen → arhiva na istu off-box destinaciju kao Postgres, ime `uploads-YYYY-MM-DD.tar.gz`.
Umjesto ručne komande koristi `ops/dr/backup-uploads.sh` (ista radnja + SHA-256, manifest, retention 14 dana);
instalacija na host je u odjeljku „Instalacija cron-a" ispod.

```bash
UPLOADS_VOLUME=<ime iz `docker volume ls`> ops/dr/backup-uploads.sh
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
6. **Obavezno (paket 2.6, ZZLP):** ponovo primijeniti anonimizacije izvršene nakon backupa baze. Ledger
   `uploads/privacy-ledger/erasures.jsonl` nije u bazi, pa je preživio restore:
   ```bash
   docker exec -i "$BACKEND" node dist/src/cli/privacy-replay.js            # pregled: "replay …" linije, to_replay=N
   docker exec -i "$BACKEND" node dist/src/cli/privacy-replay.js --apply    # izvršava; exit 0 = sve primijenjeno
   ```
   Exit 2 znači da je neki unos blokiran (npr. korisnik je u backupu još aktivan). Razlog je u ispisu i na
   stranici Privatnost → Anonimizacija. Ledger je u uploads volumenu, pa uploads arhiva mora biti **ista ili
   novija** od trenutka incidenta. Ako je stara baza još dostupna, prije restore-a pokrenuti
   `privacy-replay.js --export-ledger` na njoj: dopisuje u ledger završene anonimizacije koje u njemu fale.
   Retencija se ne ponavlja ručno. Noćni posao sam ponovo briše sve što je starije od roka.

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
- `export-config.sh` — config snapshot „DR backup YYYY-MM-DD" (lozinku čita iz `ADMIN_PASSWORD` ili `ADMIN_PASSWORD_FILE`);
- `verify-backups.sh` — kontrola svježine i SHA-256 za oba backupa (exit 1 = problem; za cron/monitoring);
- `cron.example` — gotove cron linije za `/etc/cron.d/servicedesk-backups`;
- `restore-drill.sh` — restore u zasebnu bazu `servicedesk-drill` i volumen `servicedesk-drill-uploads`;
- `verify-restore.mjs` — četiri provjere (login, tiket, stari prilog, audit export) i JSON za zapisnik.

Postupak mjesečnog drilla s privremenim Coolify stackom i obrazac zapisnika su u `docs/ops/test-okruzenje-1.8.md` (§4 i §5).

## Instalacija cron-a (obavezan korak na svakoj instalaciji)

**Nalaz (2026-10-02, prolazak A9 korak 6):** na staging hostu nije postojao nijedan cron koji zove `backup-uploads.sh`
ili `export-config.sh`, ni direktoriji `/opt/servicedesk` i `/var/backups/servicedesk`, pa se uploads i config snapshot
**nisu arhivirali**. Skripte su u repou; ovim postupkom se hvataju na host. Ponoviti na svakoj novoj instalaciji.

1. **Repo na host:** `/opt/servicedesk` (npr. `git clone` pa `git fetch && git checkout master`, ili kopija fajlova).
   Skripte se ne mijenjaju često, pa je dovoljno osvježiti ih uz veće nadogradnje.
2. **Ime uploads volumena:** `docker volume ls | grep -i uploads` → `<IME_VOLUMENA>` (Coolify ga nasumično imenuje).
3. **Lozinka za config snapshot:** nalog s `settings.write` (najbolje zaseban ADMIN za DR, ne lični SUPER_ADMIN).
   ```bash
   sudo install -d -m 700 /etc/servicedesk
   sudo install -m 600 /dev/null /etc/servicedesk/admin-password
   sudo sh -c 'read -rsp "Lozinka: " p && printf %s "$p" > /etc/servicedesk/admin-password'   # ne ispisuje se
   sudo ls -l /etc/servicedesk/admin-password                                                  # -rw------- root
   ```
4. **Cron:** uredi `ops/dr/cron.example` (volumen, e-mail, domen), pa
   `sudo install -m 0644 ops/dr/cron.example /etc/cron.d/servicedesk-backups`.
   Cron.d traži prazan red na kraju i korisnika `root` u svakoj liniji (docker + čitanje tajne).
5. **Logovi i rotacija:**
   ```bash
   sudo touch /var/log/servicedesk-uploads-backup.log /var/log/servicedesk-config-export.log
   sudo tee /etc/logrotate.d/servicedesk-backups >/dev/null <<'EOF'
   /var/log/servicedesk-uploads-backup.log /var/log/servicedesk-config-export.log {
     weekly
     rotate 12
     compress
     missingok
     notifempty
   }
   EOF
   ```
6. **Prvi prolaz ručno** (isti env kao u cronu), pa provjera:
   ```bash
   sudo env UPLOADS_VOLUME=<IME_VOLUMENA> /opt/servicedesk/ops/dr/backup-uploads.sh
   sudo API_URL=https://api.desk.ba101.top ADMIN_EMAIL=<ADMIN_EMAIL> \
     ADMIN_PASSWORD_FILE=/etc/servicedesk/admin-password /opt/servicedesk/ops/dr/export-config.sh
   sudo /opt/servicedesk/ops/dr/verify-backups.sh      # očekivano: [verify-backups] OK
   ```
7. **Off-box kopija:** prebaciti arhive s hosta (Coolify backup storage, rclone/S3/NAS). Lokalni disk **nije** backup;
   retention na hostu (14 dana) smije brisati tek kad je off-box kopija potvrđena.
8. **Monitoring (opciono, preporuka):** uključiti liniju 3 iz `cron.example` (`verify-backups.sh`, dnevno) i vezati
   exit ≠ 0 na postojeći kanal alarma (npr. Push monitor u Uptime Kumi, `ops/monitoring/uptime-kuma.md`).

## Paket 2.1: ključ za MFA

`MFA_ENCRYPTION_KEY` (backend env) čuvati u backupu tajni. Bez njega se TOTP tajne ne mogu dešifrovati i svi korisnici s MFA moraju proći reset (`ops/runbook/mfa-reset.md`).
