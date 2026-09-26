# Paket 1.8: testno okruženje i verifikacija (Entra SSO, LDAPS sync, DR drill)

> Za koga: administrator koji verifikaciju radi **van mreže preduzeća**, na vlastitom Linux serveru (Coolify). Ne treba mu testni tenant preduzeća ni pristup produkcijskom AD-u.
> Veza: dizajn `docs/plans/modules/1.8-verifikacija-epbih.md` (checkliste V1–V3), DR runbook `ops/DR.md`.

Sadržaj:

1. Testni Active Directory (Samba AD DC u Dockeru).
2. Povezivanje aplikacije s testnim AD-om (LDAPS sync).
3. Besplatni Microsoft Entra tenant (SSO).
4. DR drill (zasebna baza i privremeni Coolify stack).
5. Zapisnik verifikacije (obrazac).
6. Odstupanja od dizajna 1.8.

---

## 1. Testni Active Directory (Samba AD DC)

Samba 4 je pravi AD domenski kontroler. Ima isti LDAP protokol, `objectGUID`, `userAccountControl`, paged search i LDAPS kao Windows Server, pa se sinhronizacija testira bez ijednog Windows servera.

Fajlovi su u `ops/dev/samba-ad/`:

| Fajl | Namjena |
|---|---|
| `Dockerfile`, `entrypoint.sh` | Debian + Samba. Domen se provizionira pri prvom startu, a CA certifikat se izvozi u `export/samba-ca.pem`. |
| `docker-compose.yml` | Kontejner na mreži `db_net` s aliasom `dc1.test.epbih.lab`. Port se **ne** objavljuje na hostu. |
| `seed.sh` | OU stablo po uzoru na produkciju (`Korisnici / ED … / poslovnica`), 30+ korisnika s dijakriticima, bind nalog, grupe `HD-Administratori` i `HD-Agenti`, rubni slučajevi (bez e-maila, onemogućen nalog). `--bulk N` dodaje N korisnika za test paginacije. |
| `scenario.sh` | Izmjene za checklistu: premještanje, deaktivacija, reaktivacija, preimenovanje, dodjela uloge, okidanje osigurača. |

### 1.1 Podizanje

Na serveru, u kloniranom repou:

```bash
cd ops/dev/samba-ad
cp .env.example .env        # promijenite lozinke
docker compose up -d --build
docker compose logs -f samba-ad    # čekajte "CA exported to /export/samba-ca.pem"
docker compose exec samba-ad seed.sh
```

Na kraju `seed.sh` ispisuje tačne DN-ove koji trebaju u postavkama (base DN, bind DN, DN-ove grupa).

> Ako mreža `db_net` ima drugo ime, promijenite ga u `docker-compose.yml`. Backend i worker moraju biti na istoj mreži. Provjera: `docker network inspect db_net`.

Brza provjera LDAPS-a iz samog kontejnera:

```bash
docker compose exec samba-ad bash -c \
  'LDAPTLS_CACERT=/export/samba-ca.pem ldapsearch -H ldaps://dc1.test.epbih.lab \
   -D "CN=svc-helpdesk,OU=Servisni,OU=HelpDesk,DC=test,DC=epbih,DC=lab" -w "$SVC_BIND_PASSWORD" \
   -b "OU=Korisnici,DC=test,DC=epbih,DC=lab" "(mail=*)" mail | grep -c ^mail:'
```

### 1.2 CA certifikat u backendu i workeru

Samba koristi vlastiti (self-signed) CA. Aplikacija uvijek verifikuje certifikat i ne postoji opcija „ignoriši certifikat", pa CA treba montirati:

1. U Coolifyju otvorite resurs aplikacije → **Storages** → **Add file mount**. Za **backend i worker** podesite:
   - putanja: `/run/secrets/ad-ca.pem`;
   - sadržaj: kopija fajla `ops/dev/samba-ad/export/samba-ca.pem`.
2. Environment: `AD_LDAPS_CA_CERT_PATH=/run/secrets/ad-ca.pem`.
3. Redeploy backenda i workera.

U produkciji, ako certifikat DC-a izdaje interni PKI preduzeća, isto se montira njegov root CA. Ako certifikat izdaje javni CA, varijabla ostaje prazna.

### 1.3 Uklanjanje

```bash
docker compose down -v && rm -rf export .env
```

---

## 2. Povezivanje aplikacije s testnim AD-om

Kao SUPER_ADMIN otvorite **Postavke → Autentikacija** i podesite:

| Ključ | Vrijednost za test |
|---|---|
| `private.auth.adLdapsUrlsCsv` | `ldaps://dc1.test.epbih.lab:636` (za test failovera: `ldaps://nepostojeci.test:636,ldaps://dc1.test.epbih.lab:636`) |
| `private.auth.adBindDn` | `CN=svc-helpdesk,OU=Servisni,OU=HelpDesk,DC=test,DC=epbih,DC=lab` |
| `private.auth.adBindPassword` | `SVC_BIND_PASSWORD` iz `.env` (secret) |
| `private.auth.adRead.enabled` | `true` |
| `private.auth.adRead.source` | `ldaps` |
| `private.auth.adRead.usersBaseDn` | `OU=Korisnici,DC=test,DC=epbih,DC=lab` |
| `private.auth.adRead.groupsBaseDn` | `OU=Grupe,OU=HelpDesk,DC=test,DC=epbih,DC=lab` |
| `private.auth.ouMappingStrategy` | `by_dn_ou_path` (drugi test: `by_company_department`) |
| `private.auth.roleSource` | `local_db` (drugi test: `ad_groups`, uz DN-ove grupa ispod) |
| `private.auth.adRoleGroupDnAdmin` | `CN=HD-Administratori,OU=Grupe,OU=HelpDesk,DC=test,DC=epbih,DC=lab` |
| `private.auth.adRoleGroupDnAgent` | `CN=HD-Agenti,OU=Grupe,OU=HelpDesk,DC=test,DC=epbih,DC=lab` |
| `private.auth.adRead.maxDeactivationPercent` | `10` |
| `private.auth.adRead.syncCooldownMinutes` | `0` za vrijeme testiranja, nakon toga `15` |
| `private.auth.adRead.strategy` | `manual_only`; za test rasporeda `scheduled` + `private.auth.adRead.scheduleCron` npr. `*/20 * * * *` |

Zatim otvorite **Organizacijske jedinice**. Kad je izvor `ldaps`, ispod stabla se pojavljuje konzola **Sinhronizacija s Active Directoryjem**.

### 2.1 Checklista V2 (LDAPS sync)

Iza svakog koraka piše šta se očekuje. Rezultate unesite u zapisnik (§5).

| # | Korak | Očekivano |
|---|---|---|
| L1 | **Test veze** | Zeleni okvir s URL-om, trajanjem i „Bazni DN pronađen". U historiji je red „Test veze · Uspješno". |
| L2 | Test veze s pogrešnom bind lozinkom | Greška „Veza s domenskim kontrolerom nije uspjela". U dnevniku backenda nema lozinke. Nakon greške konzola prikazuje pauzu (backoff, `retryBackoffMinutes`, default 3 min), a novi pokušaj prije isteka pauze dobija poruku o pauzi. |
| L3 | Test failovera (prvi URL nepostojeći) | Uspjeh preko drugog URL-a. Prvi URL je naveden kao nedostupan. |
| L4 | **Probni prolaz** (prvi put) | Plan: sve OU su nove, ~31 novi korisnik. Izuzetak `NO_EMAIL` za `bez.maila`. `onemogucen.korisnik` se ne kreira. Dijakritici su ispravni. |
| L5 | **Preuzmi CSV** | Fajl se u Excelu otvara s ispravnim č/ć/š/ž/đ i ima po jedan red za svaku stavku plana. |
| L6 | **Primijeni plan** | Potvrdni dijalog s brojevima, zatim poruka „Plan je primijenjen". OU stablo i Korisnici prikazuju nove podatke. Lokalni nalozi i SUPER_ADMIN su netaknuti. |
| L7 | Ponovni probni prolaz bez izmjena u AD-u | Nema novih ni izmijenjenih stavki; sve je „Bez izmjene". |
| L8 | `scenario.sh move` → probni prolaz → primjena | `lejla.begic` ima izmjenu OU (Visoko → Kakanj). |
| L9 | `scenario.sh rename` | Izmjena imena kod `amar.hodzic`. |
| L10 | `scenario.sh disable` → primjena | `haris.mujic` je u kartici Deaktivacije. Nakon primjene nalog je neaktivan, a otvorena sesija tog korisnika odmah dobija 401. |
| L11 | `scenario.sh enable` → primjena | Reaktivacija `haris.mujic`. |
| L12 | `roleSource=ad_groups`, `scenario.sh role` | Dodjela AGENT za `selma.dzafic`, ograničena na njenu OU. Uloga SUPER_ADMIN nikad se ne dodjeljuje niti oduzima. |
| L13 | `scenario.sh safeguard` → probni prolaz | Crveno upozorenje „Osigurač je aktiviran" i neaktivno dugme **Primijeni plan**. Kod rasporeda: status „Zaustavljeno osiguračem" i notifikacija SUPER_ADMIN-ima. Nakon toga `scenario.sh restore`. |
| L14 | Plan stariji od 24 h ili već primijenjen | Greška „Plan je istekao" odnosno „već primijenjen". |
| L15 | `seed.sh --bulk 1200` → probni prolaz | Paginacija radi (više od 1000 zapisa, pageSize 500). Trajanje je zapisano u historiji. |
| L16 | Raspored (`strategy=scheduled`) | U roku od 15 min nakon cron termina pojavljuje se red „Po rasporedu". Radi samo jedna instanca workera (lease). |

---

## 3. Besplatni Microsoft Entra tenant (SSO, checklista V1)

Tenant preduzeća nije potreban. Svaki Microsoft nalog može napraviti vlastiti **Entra ID Free** tenant:

1. Na <https://portal.azure.com> se prijavite privatnim Microsoft nalogom. Ako nemate Azure pretplatu, napravite je. Entra ID Free se ne naplaćuje, a kartica se traži samo za verifikaciju identiteta.
2. Otvorite **Microsoft Entra ID → Manage tenants → Create → Microsoft Entra ID** i dajte mu naziv, npr. `ephd-test` (domen `ephdtest.onmicrosoft.com`).
3. Prebacite se u novi tenant i otvorite **App registrations → New registration**:
   - naziv `EP HelpDesk (test)`, *Accounts in this organizational directory only*;
   - Redirect URI: platforma **Single-page application**, `https://desk.ba101.top/auth/callback`. Za lokalni razvoj dodajte i `http://localhost:5173/auth/callback`.
4. Na stranici **Overview** kopirajte *Directory (tenant) ID* i *Application (client) ID*. Client secret se **ne** pravi, jer je SPA javni klijent i koristi PKCE.
5. Na stranici **Token configuration → Add optional claim → ID** dodajte `email` i `upn`.
6. Pod **Users → New user** napravite 2–3 testna korisnika, npr. `test.agent@ephdtest.onmicrosoft.com`.

U aplikaciji, kao SUPER_ADMIN:

| Ključ | Vrijednost |
|---|---|
| `private.auth.azureTenantId` | Directory (tenant) ID |
| `private.auth.azureClientId` | Application (client) ID |
| `private.auth.entra.jitProvisioning` | `true` (novi korisnik dobija ulogu USER) |
| `private.auth.entra.singleLogout` | `false`; za test odjave i iz Microsofta `true` |
| `private.auth.mode` | `entra_ad` (mijenja se **zadnje**) |

> Break-glass: dok je mod `entra_ad`, login stranica i dalje nudi „Prijava lokalnim nalogom (administrator)". Lokalni SUPER_ADMIN se uvijek može prijaviti i vratiti mod na `local`.

| # | Korak | Očekivano |
|---|---|---|
| E1 | Login stranica | Dugme „Prijava Microsoft računom". Lokalna forma je sklopljena. |
| E2 | Prijava testnim korisnikom kojeg nema u bazi | Redirect na Microsoft, pa povratak na `/auth/callback` i na početnu stranicu. Korisnik je kreiran kao USER (JIT), a `entraObjectId` je upisan. |
| E3 | Prijava korisnikom čiji e-mail već postoji lokalno (npr. iz LDAPS synca, uz isti e-mail) | Nalog se veže po e-mailu i ne kreira se duplikat. |
| E4 | Isključen JIT, nepoznat korisnik | Povratak na login s porukom „Prijava Microsoft računom nije uspjela". |
| E5 | Link na tiket bez sesije → Microsoft prijava | Nakon prijave korisnik završava na tom tiketu (return path). |
| E6 | `singleLogout=true`, odjava | Odjava i iz Microsofta, pa povratak na `/login`. |
| E7 | Deaktiviran korisnik (L10) pokuša Microsoft prijavu | Odbijeno. |

---

## 4. DR drill (checklista V3)

Odluka iz dizajna je zasebna baza na istom Postgres serveru i privremeni Coolify stack. Produkcijska/staging baza se ne dira. Skripte su u `ops/dr/`:

| Skripta | Namjena |
|---|---|
| `backup-uploads.sh` | Dnevna arhiva volumena `uploads`, SHA-256, manifest i retention (cron na hostu). |
| `export-config.sh` | Config verzija „DR backup YYYY-MM-DD" i snapshot JSON, bez tajni. |
| `restore-drill.sh` | Dump u bazu `ephelpdesk-drill` (ime mora sadržavati „drill"), uploads u volumen `ephd-drill-uploads`. Ispisuje RPO, trajanje i ID-ove za verifikaciju. |
| `verify-restore.mjs` | 4 provjere (login, novi tiket, stari prilog, audit export), PASS/FAIL i JSON za zapisnik. `--dry` preskače kreiranje tiketa. |

Postupak:

```bash
export RESTORE_STARTED_AT=$(date -u +%FT%TZ)
PG_CONTAINER=hgpchekxb6dutalsyctu42al DUMP_FILE=/putanja/do/backupa.dmp \
UPLOADS_ARCHIVE=/var/backups/ephelpdesk/uploads-2026-10-03.tar.gz \
  ops/dr/restore-drill.sh
```

Privremeni stack u Coolifyju:

1. **Clone** postojećeg resursa aplikacije (ili novi resurs iz istog repoa/grane), npr. `ephd-drill`.
2. Environment:
   - `DATABASE_URL` pokazuje na bazu `ephelpdesk-drill`;
   - vlastiti domeni, npr. `drill.desk.ba101.top` i `api.drill.desk.ba101.top`;
   - `VITE_API_BASE_URL` i `CORS_ORIGINS` prilagoditi tim domenima.
3. Volumen `uploads` zamijeniti postojećim volumenom `ephd-drill-uploads`.
4. **Worker ne pokretati** (ili ga pokrenuti uz Redis s drugim prefiksom), da drill ne šalje e-mailove i ne izvršava jobove.
5. Deploy, pa verifikacija naredbom koju je ispisao `restore-drill.sh`:

```bash
API_URL=https://api.drill.desk.ba101.top ADMIN_EMAIL=… ADMIN_PASSWORD=… \
ATTACHMENT_TICKET_ID=… ATTACHMENT_ID=… AUDIT_OU_ID=… \
  node ops/dr/verify-restore.mjs --json=drill-2026-10-03.json
```

6. Nakon zapisnika: obrisati Coolify resurs `ephd-drill`, bazu (`DROP DATABASE "ephelpdesk-drill"`) i volumen (`docker volume rm ephd-drill-uploads`).

---

## 5. Zapisnik verifikacije (obrazac)

```
Paket 1.8 — zapisnik verifikacije
Datum: ____________   Izvršio: ____________   Verzija (commit): ____________

V1 Entra SSO:  tenant ________  E1 □ E2 □ E3 □ E4 □ E5 □ E6 □ E7 □
V2 LDAPS sync: DC ____________  L1 □ … L16 □   (ID-ovi runova: __________)
   Probni prolaz: korisnika u AD-u ____, novih ____, izuzetaka ____, trajanje ____ ms
V3 DR drill:   backup od ________ (starost ___ h, RPO ≤ 24 h)
   restore baze ___ s, uploads ___ s; verify-restore: login □ tiket □ prilog □ audit □
   ukupno od početka restore-a ___ min (RTO ≤ 240 min)
   Drill stack obrisan □   Sljedeći drill (mjesečno): ____________
Odstupanja / napomene:
```

---

## 6. Odstupanja od dizajna 1.8 (zapisnik implementacije)

| # | Odstupanje | Razlog i posljedica |
|---|---|---|
| O1 | Korisnik kreiran kroz JIT (prva Entra prijava) nema OU dok ga ne obuhvati LDAPS sync. | ID token ne nosi pouzdanu OU putanju. Sync ga uparuje po e-mailu, usvaja i dodjeljuje mu OU. Do tada se vidi kao korisnik bez OU (uloga USER). |
| O2 | Nema `adRoleGroupDnSuperAdmin`. | Odluka iz §9: SUPER_ADMIN ostaje isključivo lokalan (break-glass) i sync ga nikad ne dodjeljuje niti oduzima. |
| O3 | AD grupe se ne preslikavaju u aplikacijske `Group` (timove). | Grupe služe samo kao izvor uloga ADMIN/AGENT kad je `roleSource=ad_groups`. Timovi se i dalje vode u aplikaciji. |
| O4 | Backoff poslije grešaka pamti se u memoriji procesa. | Backend i worker imaju svaki svoj brojač. Nakon restarta pauza počinje ispočetka. Prihvatljivo, jer je pauza kratka (default 3 min, fiksno trajanje od zadnje greške). |
| O5 | Paged search broji se kao jedan upit prema limitu `maxQueriesPerSecond`. | Stranice čita jedna LDAP operacija, pa throttle važi po operaciji. |
| O6 | Cron izraz provjerava vlastiti mali parser (5 polja, `*`, liste, rasponi, korak). | Bez nove zavisnosti. Nevaljan izraz znači da se sync po rasporedu ne pokreće; ručni probni prolaz radi normalno. |
| O7 | Raspored: worker svakih 15 min (`0 7,22,37,52 * * * *`) provjerava je li cron termin prošao od zadnjeg uspješnog synca. | Stvarno vrijeme pokretanja kasni do 15 min u odnosu na cron. Time se izbjegava dinamičko prepravljanje BullMQ rasporeda pri svakoj izmjeni postavke. |
| O8 | CSV plana generiše frontend iz JSON-a plana. | Nema dodatnog endpointa. CSV je uvijek identičan prikazanom planu (UTF-8 BOM, `;`, zaštita od CSV injectiona). |
| O9 | Samba AD DC umjesto Windows Server DC-a za verifikaciju. | Nema testnog domena preduzeća. Protokol i atributi su isti. Konačna provjera na AD-u preduzeća je jedan probni prolaz (bez primjene), uz saglasnost IT-a. |
