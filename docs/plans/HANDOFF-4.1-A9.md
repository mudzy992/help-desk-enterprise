# Handoff — Paket 4.1, faza A9 (prelazak na stagingu)

Stanje na dan 2026-10-02. Grana prve sesije, `arena/01a0d46c-help-desk-enterprise`, već je na `master` (`585dd8f`).
**Grana tekuće sesije je `arena/01a0fe12-help-desk-enterprise`** (ime zadaje sesija; radi se i pusha samo na nju). Odatle ide
fast-forward na `master` (Coolify gradi master).
Dizajn paketa: `docs/plans/modules/4.1-audit-vise-klijenata.md`. Odluke su u §0, prelazak u §7, a bilješke po fazama u §11 i §12.

## 1. Gotovo

| Faza | Commit | Sadržaj |
|---|---|---|
| A1–A3 | `cb13993` … `ef7818c` | brending, postavke umjesto hardkodiranja, KDF v2 + CLI `rekey-asset-licenses` |
| A4 | `08ebff3`, `7730da5` | localStorage `service-desk.*` (migracija), Redis/DB zadane vrijednosti, `.env.example` + `check-env-example.mjs` |
| A5 | `a2ed88a` | test podaci na `example.com`, neutralna struktura organizacije |
| A6 | `12524dd` | Edge, `.cursor/`, `referenca-dizajn/`, uklonjeni stari patchevi |
| A7 | `8908426` | dokumentacija i preimenovani fajlovi (`RAW_PROJECT.md`, `CLIENT_*` …), ops zadane vrijednosti |
| A8 | `2bb35f7` | `check-client-neutral.mjs` u CI, završni prolaz bez nalaza |

Testovi: backend jest 2336/2336, frontend vitest 572/572, tsc oba, sve `check-*` skripte zelene.

### A9 — urađeno na stagingu

1. **Deploy** (master ← grana): korisnici su ostali prijavljeni, a tema i jezik sačuvani (localStorage migracija radi).
2. **BullMQ redovi pod `bull:ephelpdesk`:** `wait=0` i `active=0` u svim redovima. `delayed` su samo ponovljivi poslovi.
3. **Redis ACL korisnik `servicedesk`** je dodan aditivno, s pravilima kopiranim od `ephelpdesk`:
   `on sanitize-payload ~servicedesk* ~bull:servicedesk* &* +@all -flushall -flushdb -config -shutdown -acl -debug -save -bgsave -bgrewriteaof -replicaof -slaveof -monitor -module -failover`.
   Uz to je urađen `ACL SAVE`, a `PING` je vratio PONG. Stari korisnik `ephelpdesk` **i dalje postoji** i ne dira se do koraka 7.
   Lozinka je jednom bila otkrivena u chatu, ali je korisnik potvrdio da ju je promijenio.
4. **Coolify env** je promijenjen i deployan: `REDIS_USERNAME=servicedesk`, `REDIS_PASSWORD=<nova>`, `REDIS_KEY_PREFIX=servicedesk`,
   `QUEUE_PREFIX=bull:servicedesk`.
   Provjereno: 21 red pod `bull:servicedesk:*`, svi `failed=0`. Redis klijenti: `servicedesk` 72, `ephelpdesk` 0
   (`inventory` je druga aplikacija i ne dira se). Prijava u aplikaciju radi.

**Otvoreno pitanje:** korisnik javlja da mu se *izgleda gubi sesija*. Ne zna se da li se to odnosi na sesiju u aplikaciji ili
na chat sesiju. Na početku sljedeće sesije pitati i, ako je u pitanju aplikacija, provjeriti: odjavljuje li se korisnik
nakon refresha, kad se to dešava, i da li se dešava i nakon `localStorage.getItem('service-desk.session')`
(DevTools → Console). Registar sesija je u Postgresu, a opoziv tokena u Redisu uz fail-open, pa promjena Redisa ne bi trebala
odjavljivati korisnike (ispravka i kandidati za uzrok: §4).

## 2. Preostali koraci A9 (komandu po komandu, uz čekanje na rezultat)

### Korak 5 — licence (KDF v2)

Prvo proba, koja ništa ne mijenja:
```
read -rp "Backend kontejner: " BACKEND && docker exec -i "$BACKEND" node dist/src/cli/rekey-asset-licenses.js --dry-run
```
Ispis: `checked N: X already v2, would re-encrypt Y, Z changed meanwhile (re-run), U unreadable`.
- `checked 0`: korak je gotov.
- `U = 0`, `Y > 0`: pokrenuti istu komandu bez `--dry-run`. Ako je `Z > 0`, pokrenuti je ponovo.
- `U > 0`: stati i istražiti (ključ se ne može dešifrovati ni trenutnim ni legacy ključem).

### Korak 6 — DR cron (samo ako postoji)

Zadani direktorij u `ops/dr/*` je sada `/var/backups/servicedesk`. Provjeriti `crontab -l` / `sudo crontab -l`. Ako cron
poziva `backup-uploads.sh` ili `export-config.sh`, treba mu dodati `BACKUP_DIR=/var/backups/ephelpdesk`
(odnosno `OUT_DIR=…`) ili premjestiti direktorij.

### Korak 7 — čišćenje (najranije 24 h nakon koraka 4, tek uz potvrdu korisnika)

Vremenska kapija: korak 4 je završen 2026-10-02, pa korak 7 ne ide prije 2026-10-03. Tačno vrijeme završetka nije zapisano:
pitati korisnika ili pogledati Coolify deployment, odnosno `docker inspect -f '{{.State.StartedAt}}' <backend kontejner>`
(kasniji restart samo pomjera kapiju naprijed, a to je sigurna strana).

1. Ponovo provjeriti da nema klijenata `user=ephelpdesk`:
   `redis-cli CLIENT LIST | grep -o "user=[a-z]*" | sort | uniq -c`.
2. Obrisati stare ključeve: `SCAN` + `UNLINK` po `ephelpdesk:*` i `bull:ephelpdesk:*` (prvo samo prebrojati, pa brisati).
3. `ACL DELUSER ephelpdesk` + `ACL SAVE`, s ispisom `ACL LIST` prije i poslije.

**Povrat** (dok korak 7 nije urađen): u Coolifyju vratiti stare četiri `REDIS_*` / `QUEUE_PREFIX` vrijednosti i ponovo
deployati.

Nakon koraka 7: upisati rezultat u §12 dizajna 4.1, označiti 4.1 kao završen u `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md`
(trenutno piše „čeka odobrenje“), pa commit i push. Isti commit uklanja izuzetak za ovaj fajl iz
`scripts/check-client-neutral.mjs` i iz §9 dizajna, a ovaj handoff se briše (ostaje u git istoriji) ili neutralizira. Odluku o
tome potvrditi s korisnikom. CI na masteru mora biti zelen.

## 3. Pravila rada (sažetak, vrijede i dalje)

- Odgovarati na bosanskom/hrvatskom. Komande davati **jednu po jednu** i tražiti ispis.
- Korisnik radi na Windowsu (Git Bash), a testira na Linux serveru (Coolify) preko SSH (`-p 2222 administrator@sql.ba101.top`).
- Komande za backend: `read -rp "Backend kontejner: " BACKEND && docker exec -i "$BACKEND" ...`.
- Redis: `read -rp "Redis kontejner: " REDIS && read -rsp "Redis lozinka (default korisnik): " RPASS && docker exec -e REDISCLI_AUTH="$RPASS" -i "$REDIS" ...`.
  Kontejner je `redis-core-j4yv1noel7cxdmghjcwhfymh-090809466522`. ACL mijenjati samo aditivno, uz provjeru prije i poslije i `ACL SAVE`.
  Ne koristiti `resetchannels` i ne dirati maxmemory-policy. Lozinke ne ispisivati u terminal.
- Baza i korisnik baze na stagingu ostaju `ephelpdesk` (odluka §0.4). SRS `EPHELPDESK.pdf/.docx` ostaje nepromijenjen.
- Nikad force-push. Push samo na granu tekuće sesije (vidi vrh dokumenta), bez PR-a prema master.
- Deploy: `git fetch origin && git checkout master && git merge --ff-only origin/<grana-tekuće-sesije> && git push origin master`
  (trenutno `origin/arena/01a0fe12-help-desk-enterprise`). Svaki push na master pokreće Coolify deploy, pa
  dokumentacijski commitovi mogu čekati i ići zajedno s prvim commitom koji ionako treba na staging.
- Staging: https://desk.ba101.top, API https://api.desk.ba101.top.
- Nakon 4.1 slijedi sljedeći paket iz faznog plana. Za svaki paket prvo se piše dizajn u `docs/plans/modules/`, a implementacija ide tek nakon odobrenja.

## 4. Dopune — sesija 2 (2026-10-02)

- **CI na masteru je bio crven od `585dd8f`.** Ovaj handoff doslovno navodi stare identifikatore, pa je `check-client-neutral`
  pao, a GitHub Actions je zbog toga preskočio sve sljedeće korake frontend joba (uključujući `npm test` i `npm run build`).
  Popravak je privremeni izuzetak za ovaj fajl u `scripts/check-client-neutral.mjs` i u §9 dizajna (izuzima se fajl, ne
  obrazac; negativni test s privremenim fajlom i dalje pada). CI na masteru ozeleni tek nakon fast-forwarda s grane sesije.
- **Staging je zdrav** (samo čitanje, 2026-10-02 19:32 UTC): `/health/ready` daje `database: ok`, `redis: ok`, a
  `/health/worker` daje `ok` s heartbeatom starim 6 s (worker piše u Redis pod `servicedesk`).
- **Ispravka tvrdnje „sesije su u Postgresu“.** Registar sesija je u Postgresu, ali opoziv tokena je u Redisu
  (`auth:revoked-jti:*`, `auth:revoked-sid:*`, `auth:sessions-valid-after:*`) i radi fail-open. Kvar ili promjena Redisa dakle
  ne može odjaviti korisnike (detalji: §12 dizajna, „Ispravka §7.4“). Ako je odjava u aplikaciji stvarna, prvi kandidati su:
  1. JWT traje 1 h, a SPA ga produžava samo uz aktivnost (`frontend/src/lib/session/session-keep-alive.ts`). Neaktivnost od
     60 min je odjava po dizajnu (odluka iz Review 2026-09-25).
  2. `/auth/refresh` opoziva stari token, a svaki 401 na prijavljenom zahtjevu (pa i na samom `/auth/refresh`) briše
     pohranjenu sesiju, koju dijele svi tabovi preko localStorage-a (`frontend/src/services/api.ts`). Dva taba koja
     istovremeno osvježavaju isti token mogu zato jedan drugog odjaviti (npr. kad se laptop probudi s više otvorenih tabova).
- **Za odluku vlasnika, izvan A9: skraćenica `ephd`** nije u listi traženih oblika (§1 dizajna), pa je `check-client-neutral` ne
  hvata. Ostaci: e-mail zaglavlje `X-EPHD-Ticket` (`compose-ticket-email.ts`; ako klijent ima mail pravila na to zaglavlje,
  promjena ih lomi), sessionStorage ključ `ephd.entra.configuration`, DR zadane vrijednosti `ephd-drill-uploads` i log
  `/var/log/ephd-uploads-backup.log`, te primjeri `ephd-test` / `ephdtest` u `docs/ops/test-okruzenje-1.8.md`. Predlog: poseban
  mali paket (dizajn, odobrenje, pa implementacija) koji uz to dodaje `ephd` u provjeru.
