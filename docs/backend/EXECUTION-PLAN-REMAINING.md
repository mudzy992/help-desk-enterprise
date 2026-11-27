# Plan izvršenja preostalih valova (W1, W2, W3, W9, W8, W10, W11)

**Osnova:** `master` @ `2b0aaf3` (Val 7 zatvoren W7.114 / PR #16)<br>
**Datum:** 2026-11-24<br>
**Izvor brojeva:** `docs/backend/backend-findings-plan.json` + `npm run audit:traceability` — 696 nalaza, **332 zatvoreno / 364 otvoreno** (P1 88 · P2 195 · P3 81)<br>
**Status plana:** **aktivan ugovor** — ovo je redoslijed rada, ne želja. Mijenja se samo po §1.6.

## 1. Pravila kojih se striktno držim

1. **Jedan nalaz = jedan paket.** Kod + testovi + `audits/<modul>.md` + `BACKEND-FINDINGS-REGISTER.md` + `BACKEND-IMPLEMENTATION-MASTER-PLAN.md` + `backend-findings-plan.json` + implementacijski dokument + ledger ovog plana — **u istom commitu**. Docs-only push ne pokreće CI, pa se dokumentacija nikad ne odvaja od koda.
2. **Nijedan paket ne počinje na nerazjašnjenom crvenom baseline-u.** Faza 0 (trijaža dnevnog full CI-ja) je kapija: klasa kvara (kod / okolina / stack) se dokumentuje prije prvog paketa.
3. **Redoslijed iz §3–§9 je obavezujući.** Unutar wave-a: prvo svi **P1**, pa **P2**, pa **P3**, redom kojim su navedeni.
4. **Izvještaj nakon paketa završava obavezno** linijom `Sljedeći paket: <ID> (BA-<nalaz>) — <razlog u jednom redu>`. Ako predlažem izmjenu reda, u istom izvještaju piše šta se mijenja i zašto, a plan se ažurira u sljedećem commitu.
5. **Standard dokaza:** (a) test koji pada prije i prolazi poslije; (b) za DB/Redis temu integration test ili dokumentovano zašto nije izvodljiv; (c) za korisniku vidljivo ponašanje E2E + `dispatch specs="<n>"`; (d) `nest build`, `eslint --max-warnings=0`, `wiring:check`, `audit:traceability` sa brojevima; (e) CI run ID-evi (push + PR, E2E kad je primjenjivo).
6. **Odstupanje** je dozvoljeno samo ako je zapisano u ledgeru (§12), obrazloženo zavisnošću ili novim dokazom i u istom commitu kao paket. „Usput bih još ovo” nije odstupanje — to je novi nalaz i ide u registar.
7. **Nepromjenjive granice:** ne diram pre-existing eslint warninge u `problem-owner-eligibility.spec.ts` i `sla-scan-failure-quarantine.spec.ts`; ne diram flaky `admin-ops-i18n-coverage.spec.ts` / `break-glass-command.integration.spec.ts`; E2E/CAPTCHA problem rješavam na stacku (Admin → Sigurnost), ne izmjenom speca; telemetrija nikad ne nosi raw korisnički termin (samo hash/length).
8. **Migracije i owner odluke traže se prije početka paketa** koji ih traži (§11), ne usput.
9. **Wave je zatvoren** samo kad svi njegovi BA ID-evi imaju `zatvoreno` u generisanom planu **i** kad su acceptance gateovi iz §10 ispunjeni.
10. **Oznaka paketa = red izvršenja.** Ako nalaz uleti ranije od svog mjesta u §4, uzima **prvi slobodan broj**
    (kao `W2.17`–`W2.21` za auth klaster), a sve preostale oznake u tom valu se **preračunaju u istom commitu** —
    tabela staro→novo ide u §4.6. Time nikad ne postoje dvije oznake za isti broj niti rupa u nizu; istorija
    (spojeni closeouti, komentari u kodu) se **ne prepisuje**.

## 2. Faze

| Faza | Šta | Zašto tu |
| --- | --- | --- |
| **0** | Trijaža dnevnog full CI-ja | Nijedan dokaz novog paketa ne visi o nerazjašnjenom crvenom runu |
| **1** | Val 1 — P1 slice: `xcut-08`, `xcut-18`, `xcut-20` (W1.5–W1.7) | Jedini P1 Vala 1 (destruktivni CLI) + dva jeftina security nalaza, nezavisni od svega |
| **2** | **Val 2** — 57 nalaza (W2.9–W2.65) | Substrat koji svi čitaju: OU/groups scope i sesija — i Val 8 (directory-sync, Teams, policy packs). Prvo ovdje = nema dvostrukog popravljanja |
| **3** | **Val 3** — 72 nalaza (W3.12–W3.83) | Integritet: change-log, config-versioning, privacy, SIEM, secreti. Naslanja se na Val 2, priprema Val 9/10 |
| **4** | Val 1 — ostatak: 14 nalaza (W1.8–W1.21) | Platformski dokazi (migration linter, readiness, Redis, metrike, CLI framework) |
| **5** | **Val 9** — 70 nalaza + plan paket `W9.0` | Health/observability/ops-health/docs; tu se zatvaraju readiness/metrike teme Vala 1 |
| **6** | **Val 8** — 148 nalaza + plan paket `W8.0` | Najveći val, ali **posljednji od domena** |
| **7** | **Val 10** — CLI, data-repair, migration closure | Koristi CLI framework iz Vala 1 i audit trag iz Vala 3 |
| **8** | **Val 11** — regression, recovery drill, rescore, acceptance | Završni gate |

**Zašto Val 2 prije Vala 1:** Val 1 ima **1 P1** i on je izolovan (CLI), a 12 od 14 P2 su „dokaz/ugovor nedostaje” čiji kod živi u Val 9/10 — prvo njih znači raditi ih dvaput. Val 2 nosi **13 P1** u kodu koji svi ostali zovu.

**Zašto Val 9 prije Vala 8:** install acceptance (Val 8, `31 — install`) traži health/readiness dokaz, a Val 1 readiness/metrike nalazi se zatvaraju u Val 9 paketima.

### 2.1 Faza 0 — baseline dnevnog full CI-ja (2026-11-24, **zatvoreno**)

| Run | Šta je pokazao |
| --- | --- |
| [`45376798360`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45376798360) — `schedule`, `master` @ `2b0aaf3` | Kodni poslovi **zeleni** (backend build + pun Jest, PostgreSQL/Redis integracija, frontend, docs guard, container/supply-chain). Full E2E: **125 passed / 2 failed / 3 flaky / 1 skipped** (61 min). API outage: `/health` nedostupan **10:55–11:43** (48 min). |
| [`45387603494`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45387603494) — trijaža `specs="12,48"`, `retries=0` | **48 prošao** ⇒ pao je zbog outage-a, ne koda; spec **netaknut** (env problem se ne rješava izmjenom speca). **12 pao ponovo** istim brojevima (1 preview red, 2 tražena) ⇒ stvarni defekt u testu. |
| [`45388019952`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45388019952) — `specs="12"` sa popravkom | **1 passed / 0 failed** iz prvog pokušaja. |

**Spec 12 — šta je bilo i šta je popravljeno (`4bdccfc`, test-only).** Audit lista je **najnovijih 50 redova cijelog OU dnevnika** i nema filter po akciji. Test je napravio tri zapisa (API preview, UI preview, CSV export) i onda **jednim** pitanjem na kraju tražio „jesu li oba preview reda još na prvoj strani”. Na instalaciji sa 145 otvorenih tiketa (157 u group inboxu) odgovor zavisi od svega što instanca u međuvremenu upiše — red napisan par sekundi ranije legitimno ispadne sa stranice, iako se proizvod ponaša tačno kako je projektovan (svaki preview se audituje **prije** nego redovi napuste servis). Popravka zadržava sve tri tvrdnje (forward_ping_pong preview, monthly_kpi preview sa `boundaries`/`windowMode`, `reports.export` sa `format`/`pack`/`from`) i provjerava svaki zapis **odmah nakon njegove akcije**, pa red koji je taj poziv upisao stoji na vrhu stranice umjesto da se takmiči sa nepovezanim saobraćajem. Helper pri neuspjehu ispiše šta je stranica stvarno sadržavala (akcija + pack), pa sljedeći crveni run objašnjava sebe.

**3 flaky i 1 skipped.** Dva flaky su eksplicitni `UND_ERR_CONNECT_TIMEOUT` na `api.desk.ba101.top` (42-catalog-sla-routing-ux, 44-on-call), treći (`09-config-ops`) je `CONFIG_CATALOG_STATE_CONFLICT` — sve unutar prozora outage-a. `1 skipped` je namjeran: `38-users-groups-rbac` destruktivna SuperAdmin trka traži izolovanu instalaciju sa **tačno jednim** aktivnim lokalnim SuperAdminom i jednim assignmentom; ovaj stack ih ima više i test sam navede razlog. Skip nije prolaz i ostaje vidljiv.

### 2.2 Faza 0 — full run na grani poslije popravke (2026-11-24, **zatvoreno**)

| Run | Šta je pokazao |
| --- | --- |
| [`45391299267`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45391299267) — full E2E na `4bdccfc` (128 testova, 1 retry) | **128 passed / 2 failed / 0 flaky / 1 skipped**. Spec 12 i 48 **prošli**. Nova dva pada su oba unutar **drugog** outage-a istog dana (`/health` pao `12:35:01–13:06:17`, 31 min): `55-session-refresh-draft:6` (timeout, CI ga sam označio `[stack-suspect]`) i `59-notifications-realtime:9` (nema Socket.IO konekcije dok API ne odgovara). |
| [`45400198567`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45400198567) — trijaža `specs="55,59"`, `retries=0` | **4 passed / 0 failed** na prvom pokušaju ⇒ oba su isključivo outage. Nijedan spec nije mijenjan. |

**Operativni rizik za baseline (bitno za Val 8/9, ne za kod).** Demo stack je danas pao **dva puta** (48 min i 31 min). CI to sam prepoznaje i piše „STACK OUTAGE — infrastructure, not a code regression”, ali svaki takav prozor pravi lažno crvene specove. Zaključak za dalje: **crveni E2E se prvo čita kroz outage prozor** (`/health` interval u summary-ju), pa se tek onda trijažira pojedinačno; nightly baseline se smatra čistim kada u prozoru bez outage-a nema padova. Danas je to stanje: 128/128 izvršenih testova prolazi kada stack radi, uz 1 namjeran skip.


## 3. Faza 1 — Val 1, P1 slice (3 paketa)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W1.5` | `BA-xcut-08` | Destruktivni/demo CLI ima write-by-default i hard-delete bez production target guarda, potvrde i audita |
| `W1.6` | `BA-xcut-18` | Request ID je neograničen untrusted input u logovima/envelopeu |
| `W1.7` | `BA-xcut-20` | Nema centralnog structured log redaction i exception sanitizer ugovora |

## 4. Faza 2 — Val 2 (57 paketa)

Klasteri su namjerni: nalazi u istom klasteru dijele kod i test harness, pa paket odmah plaća sljedećem.

### 4.1 P1 — scope enforcement: OU / users / groups (5)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W2.9` | `BA-organizational-units-01` | OU control plane ignoriše actor OU/service scope i target hijerarhiju |
| `W2.10` | `BA-users-01` | ADMIN users control plane ignoriše OU/service scope |
| `W2.11` | `BA-organizational-units-02` | Cross-instance stale `ouPath` cache privremeno zadržava pogrešan authorization scope |
| `W2.12` | `BA-groups-01` | Group delete može tiho cascade obrisati/odvezati kritične cross-module resurse |
| `W2.13` | `BA-groups-03` | Fallback invariant dopušta nula ili više fallback grupa u istom OU-u |

### 4.2 P1 — sesija, MFA i privilegovani audit (6)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W2.14` | `BA-authentication-01` | Refresh oživljava session čiji registry red ne postoji |
| `W2.15` | `BA-authentication-02` | Opoziv sesije fail-open krši logout/password-reset garanciju tokom Redis kvara |
| `W2.16` | `BA-authentication-03` | MFA enrollment token i potvrda nisu atomski single-use |
| `W2.22` | `BA-users-03` | Deactivate i identity transitioni ne opozivaju sesije/MFA lifecycle |
| `W2.23` | `BA-security-02` | Bulk reset ostavlja aktivne sesije nakon parcijalnog kvara |
| `W2.24` | `BA-security-03` | Privilegovani auth audit je best-effort i može nestati |

**Ubačeno ranije (red izvršenja, §1.10):** auth klaster je izvršen prije svojih planiranih mjesta i pojeo oznake
`W2.17`–`W2.21`:

| Paket | Nalaz | Status |
| --- | --- | --- |
| `W2.17` | `BA-authentication-04` | izvršeno (planirano `W2.48`) |
| `W2.18` | `BA-authentication-05` | izvršeno (planirano `W2.49`) |
| `W2.19` | `BA-authentication-06` | izvršeno (planirano `W2.50`) |
| `W2.20` | `BA-authentication-07` | izvršeno (planirano `W2.51`) |
| `W2.21` | `BA-authentication-08` | izvršeno (planirano `W2.63`, P3) |

Te planirane oznake su time oslobođene i preostali nalazi su preračunati u §4.6.

### 4.3 P1 — revokacija membershipa i atomičnost korisničkih operacija (2)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W2.25` | `BA-groups-02` | Membership revoke kasni do 30 s za HTTP i do 5 min za WebSocket group room |
| `W2.26` | `BA-users-02` | Kreiranje usera/passworda/role nije atomsko i autorizacija role dolazi prekasno |

### 4.4 P2 (30)

| Klaster | Paketi i nalazi |
| --- | --- |
| Model dozvola (6) | `W2.27` `BA-authorization-03`, `W2.28` `BA-authorization-04`, `W2.29` `BA-rbac-01`, `W2.30` `BA-rbac-02`, `W2.31` `BA-rbac-03`, `W2.32` `BA-rbac-05` |
| Organizacione jedinice (5) | `W2.33` `BA-organizational-units-03`, `W2.34` `BA-organizational-units-04`, `W2.35` `BA-organizational-units-05`, `W2.36` `BA-organizational-units-06`, `W2.37` `BA-organizational-units-07` |
| Grupe (5) | `W2.38` `BA-groups-04`, `W2.39` `BA-groups-05`, `W2.40` `BA-groups-06`, `W2.41` `BA-groups-07`, `W2.42` `BA-groups-08` |
| Korisnici (4) | `W2.43` `BA-users-06`, `W2.44` `BA-users-07`, `W2.45` `BA-users-08`, `W2.46` `BA-users-09` |
| Sigurnost (6) | `W2.47` `BA-security-04`, `W2.48` `BA-security-05`, `W2.49` `BA-security-06`, `W2.50` `BA-security-07`, `W2.51` `BA-security-08`, `W2.52` `BA-security-09` |
| Autentikacija (4) | *izvršeno ranije kao `W2.17`–`W2.20` (`BA-authentication-04`–`07`)* |

### 4.5 P3 (14)

`W2.53` `BA-authorization-05`, `W2.54` `BA-authorization-06`, `W2.55` `BA-authorization-07`, `W2.56` `BA-authorization-08`, `W2.57` `BA-rbac-06`, `W2.58` `BA-rbac-07`, `W2.59` `BA-rbac-08`, `W2.60` `BA-groups-09`, `W2.61` `BA-groups-10`, `W2.62` `BA-organizational-units-08`, `W2.63` `BA-organizational-units-09`, `W2.64` `BA-security-10`, `W2.65` `BA-security-11`

*`BA-authentication-08` je izvršen ranije kao `W2.21`; njegova planirana oznaka (`W2.63`) je time oslobođena.*

### 4.6 Preračunavanje oznaka (staro → novo)

Zapis uz §1.10: auth klaster (`BA-authentication-04`–`08`) izvršen je kao `W2.17`–`W2.21`, pa su njegove
planirane oznake (`W2.48`–`W2.51`, `W2.63`) oslobođene. Preostali **P1 i P2** nalazi pomjereni su za pet mjesta
(`W2.17`–`W2.47` → `W2.22`–`W2.52`), a **P3** za jedno (`W2.52`–`W2.62` → `W2.53`–`W2.63`), jer se pomak
zatvorio na oslobođenim oznakama. `W2.64`/`W2.65` ostaju iste, pa Val 2 i dalje ima tačno 57 paketa
(`W2.9`–`W2.65`), bez rupe i bez dvostruke oznake.

| Staro | Nalaz | Novo |
| --- | --- | --- |
| `W2.17` | `BA-users-03` | **`W2.22`** |
| `W2.18` | `BA-security-02` | **`W2.23`** |
| `W2.19` | `BA-security-03` | **`W2.24`** |
| `W2.20` | `BA-groups-02` | **`W2.25`** |
| `W2.21` | `BA-users-02` | **`W2.26`** |
| `W2.22`–`W2.47` | `BA-authorization-03`–`04`, `BA-rbac-01`–`03`/`05`, `BA-organizational-units-03`–`07`, `BA-groups-04`–`08`, `BA-users-06`–`09`, `BA-security-04`–`09` (26 nalaza, redom iz §4.4) | **`W2.27`–`W2.52`** (+5) |
| `W2.48`–`W2.51` | `BA-authentication-04`–`07` | *izvršeno kao `W2.17`–`W2.20`* |
| `W2.52`–`W2.62` | `BA-authorization-05`–`08`, `BA-rbac-06`–`08`, `BA-groups-09`–`10`, `BA-organizational-units-08`–`09` (11 nalaza, redom iz §4.5) | **`W2.53`–`W2.63`** (+1 na pomak, jer je `W2.48`–`W2.52` već popunjeno P2 nalazima) |
| `W2.63` | `BA-authentication-08` | *izvršeno kao `W2.21`* |
| `W2.64`, `W2.65` | `BA-security-10`, `BA-security-11` | nepromijenjeno |

## 5. Faza 3 — Val 3 (72 paketa)

### 5.1 P1 — privatnost (4)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W3.12` | `BA-privacy-01` | Legal hold write koristi `privacy.view` |
| `W3.13` | `BA-privacy-02` | Anonimizacija je trajno parcijalna pri mid-flight kvaru |
| `W3.14` | `BA-privacy-03` | Retention Redis lock može isteći i obrisati tuđi lease |
| `W3.15` | `BA-privacy-04` | Audit redaction nije atomska niti chain-safe |

### 5.2 P1 — change-log integritet (5)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W3.16` | `BA-clog-05` | Transaction atomarnost nije dio API ugovora; mutation i log mogu commitati odvojeno |
| `W3.17` | `BA-clog-01` | Missing path se predstavlja kao null; add/remove null promjene potpuno nestaju |
| `W3.18` | `BA-clog-02` | Prazni objekti/nizovi nemaju path; create/delete/replace može imati netačan ili prazan diff |
| `W3.19` | `BA-clog-03` | Recorder ne provodi reason/action/entity/resource invariants i dopušta međusobno kontradiktoran red |
| `W3.20` | `BA-clog-04` | Nema centralne redakcije/allowliste; before/after/changes mogu trajno duplicirati secret/PII |

### 5.3 P1 — SIEM webhook (3)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W3.21` | `BA-security-audit-webhook-03` | Proizvoljan HTTP(S) cilj omogućava SSRF i plaintext izvoz |
| `W3.22` | `BA-security-audit-webhook-01` | 24h failure nepovratno odbacuje sigurnosni backlog |
| `W3.23` | `BA-security-audit-webhook-02` | Aktivacija preskače događaje nastale prije prvog ticka |

### 5.4 P1 — postavke i secreti (3) — *prvi paket traži odobrenje migracije*

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W3.24` | `BA-settings-01` | Secret vrijednosti se čuvaju kao plaintext JSON bez envelope encryptiona |
| `W3.25` | `BA-settings-02` | Security konfiguracija i realtime događaj nisu cluster-atomic niti distribuirano invalidirani |
| `W3.26` | `BA-settings-03` | Concurrent dependency write skew može commitovati nevažeće globalno stanje |

### 5.5 P1 — config-versioning: lock, apply, scope (5) — *traži odobrenje migracije*

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W3.27` | `BA-config-versioning-04` | Paralelna aktivacija nema lock/CAS ni DB invariant jednog ACTIVE reda |
| `W3.28` | `BA-config-versioning-05` | Apply/rollback je nedokumentovan replace/upsert/skip hibrid i ACTIVE nije dokaz parityja |
| `W3.29` | `BA-config-versioning-06` | Konfigurisani scopes ne ograničavaju collect/apply; sve domene se i dalje primjenjuju |
| `W3.30` | `BA-config-versioning-03` | Isključena validacija označava DRAFT validnim i dopušta neprovjeren destructive apply |
| `W3.31` | `BA-config-versioning-07` | Export sa settings.write može iznijeti privatne/environment-bound vrijednosti bez step-upa |

### 5.6 P2 (38)

| Klaster | Paketi i nalazi |
| --- | --- |
| change-log (10) | `W3.32` `BA-clog-06`, `W3.33` `BA-clog-07`, `W3.34` `BA-clog-08`, `W3.35` `BA-clog-09`, `W3.36` `BA-clog-10`, `W3.37` `BA-clog-11`, `W3.38` `BA-clog-12`, `W3.39` `BA-clog-13`, `W3.40` `BA-clog-14`, `W3.41` `BA-clog-15` |
| SIEM webhook (6) | `W3.42` `BA-security-audit-webhook-04`, `W3.43` `BA-security-audit-webhook-05`, `W3.44` `BA-security-audit-webhook-06`, `W3.45` `BA-security-audit-webhook-07`, `W3.46` `BA-security-audit-webhook-08`, `W3.47` `BA-security-audit-webhook-09` |
| privacy (7) | `W3.48` `BA-privacy-05`, `W3.49` `BA-privacy-06`, `W3.50` `BA-privacy-07`, `W3.51` `BA-privacy-08`, `W3.52` `BA-privacy-09`, `W3.53` `BA-privacy-10`, `W3.54` `BA-privacy-11` |
| settings (5) | `W3.55` `BA-settings-04`, `W3.56` `BA-settings-06`, `W3.57` `BA-settings-07`, `W3.58` `BA-settings-08`, `W3.59` `BA-settings-09` |
| config-versioning (10) | `W3.60` `BA-config-versioning-08`, `W3.61` `BA-config-versioning-09`, `W3.62` `BA-config-versioning-10`, `W3.63` `BA-config-versioning-11`, `W3.64` `BA-config-versioning-12`, `W3.65` `BA-config-versioning-13`, `W3.66` `BA-config-versioning-14`, `W3.67` `BA-config-versioning-15`, `W3.68` `BA-config-versioning-16`, `W3.69` `BA-config-versioning-17` |

### 5.7 P3 (14)

`W3.70` `BA-clog-16`, `W3.71` `BA-clog-17`, `W3.72` `BA-clog-18`, `W3.73` `BA-clog-19`, `W3.74` `BA-clog-20`, `W3.75` `BA-security-audit-webhook-10`, `W3.76` `BA-security-audit-webhook-11`, `W3.77` `BA-privacy-12`, `W3.78` `BA-privacy-13`, `W3.79` `BA-settings-10`, `W3.80` `BA-settings-11`, `W3.81` `BA-config-versioning-18`, `W3.82` `BA-config-versioning-19`, `W3.83` `BA-config-versioning-20`

## 6. Faza 4 — Val 1, ostatak (14 paketa)

| Paket | Nalaz | Nalaz (naslov) |
| --- | --- | --- |
| `W1.8` | `BA-xcut-13` | Migracije nemaju expand/backfill/contract linter i destruction approval manifest |
| `W1.9` | `BA-xcut-14` | Budući migration timestampi do 2027-10 ruše pouzdanu chronology disciplinu |
| `W1.10` | `BA-xcut-12` | Readiness ne dokazuje schema kompatibilnost, write capability ni queue flow |
| `W1.11` | `BA-xcut-15` | Redis reconnect/offline queue/circuit-breaker i namespace contract nisu potpuni |
| `W1.12` | `BA-xcut-16` | Admin realtime je process-local i gubi cross-replica događaje |
| `W1.13` | `BA-xcut-11` | DB timeout/instrumentation ne pokriva kompletno lock/transaction/dedicated-client ponašanje |
| `W1.14` | `BA-xcut-19` | Globalni guard/filter/interceptor wiring zavisi od feature modula bez centralnog manifest testa |
| `W1.15` | `BA-xcut-21` | Metric cardinality i distributed trace propagation nisu dokazani |
| `W1.16` | `BA-xcut-22` | Nema globalnog/distribuiranog inbound rate limit ugovora |
| `W1.17` | `BA-xcut-25` | CLI-ji nemaju zajednički target fingerprint/operator audit/transaction safety framework |
| `W1.18` | `BA-xcut-26` | Raw body se kopira za svaki JSON request umjesto samo potpisanih webhook ruta |
| `W1.19` | `BA-xcut-27` | Shutdown hooks se uključuju dvaput u API bootstrapu |
| `W1.20` | `BA-xcut-28` | Recent request log je samo process-local volatilni buffer |
| `W1.21` | `BA-xcut-32` | Seed koristi zaseban client mimo common pool/metrics/startup konfiguracije |

Ako se u Fazi 5 pokaže da je nalaz nerazdvojiv od Val 9 koda (npr. readiness iz `39 — health`), zatvara se **u tom paketu**, a ovdje se upisuje „zatvoreno W9.x” — plan to dozvoljava (precedent: `BA-docs-01` zatvoren W2.7, a broji se u Val 9).

## 7. Faza 5 — Val 9 (70 nalaza, plan paket prvi)

`W9.0` = **W9 plan paket** (owner, BA ID lista, zavisnosti od Vala 1/2/3, dokaz po nalazu). Bez njega se ne otvara nijedan W9.x paket. Zatim moduli, **P1 → P2 → P3, ID rastuće** unutar modula:

| Red | Modul | Otvoreno (P1/P2/P3) | Zašto taj red |
| --- | --- | ---: | --- |
| 1 | [`39 — health`](audits/39-health.md) | 14 (1/9/4) | readiness/liveness ugovor je preduslov za install acceptance u Valu 8 |
| 2 | [`40 — observability`](audits/40-observability.md) | 18 (4/10/4) | metrike/trace prije nego ops-health počne da ih tumači |
| 3 | [`41 — ops-health`](audits/41-ops-health.md) | 24 (7/12/5) | najviše P1; troši health+observability primitive |
| 4 | [`42 — docs`](audits/42-docs.md) | 14 (1/8/5) | dokumentacija prati zatvorene ugovore, ne pretječe ih |

## 8. Faza 6 — Val 8 (148 nalaza, plan paket prvi)

`W8.0` = **W8 plan paket** vođen zavisnostima (§12 master plana to i traži): owner po modulu, tačna BA ID lista, W2/W3/W4 preduvjeti, migracijski/rollback plan, integration/E2E dokaz. Zatim moduli, **P1 → P2 → P3, ID rastuće**:

| Red | Modul | Otvoreno (P1/P2/P3) | Zašto taj red |
| --- | --- | ---: | --- |
| 1 | [`33 — policy-packs`](audits/33-policy-packs.md) | 19 (7/9/3) | sigurnosne politike se primjenjuju prije nego instalacija dobije „accept” |
| 2 | [`35 — directory-sync`](audits/35-directory-sync.md) | 23 (8/11/4) | najviše P1; traži OU/groups semantiku iz Vala 2 (zato poslije Vala 2) |
| 3 | [`34 — service-onboarding`](audits/34-service-onboarding.md) | 20 (7/10/3) | 7 P1, naslanja se na policy packs |
| 4 | [`36 — teams`](audits/36-teams.md) | 20 (6/10/4) | vanjski kanal, traži isti scope model |
| 5 | [`37 — edge-extension`](audits/37-edge-extension.md) | 21 (7/10/4) | 7 P1, ali traži Teams/onboarding ugovore |
| 6 | [`31 — install`](audits/31-install.md) | 21 (6/11/4) | instalacija se ocjenjuje zadnja u valu jer troši sve prethodno |
| 7 | [`32 — setup-checklist`](audits/32-setup-checklist.md) | 11 (0/7/4) | nema P1; prati instalacione korake |
| 8 | [`38 — branding`](audits/38-branding.md) | 13 (0/8/5) | nema P1; kozmetika + cache/asset semantika |

## 9. Faze 7–8 — Val 10 i Val 11 (bez novih BA ID-eva)

**Val 10 (`W10.x`)** — CLI, data-repair, migration closure: koristi target-fingerprint/operator-audit framework iz `BA-xcut-25` (W1.x) i redakcijski ugovor iz change-log paketa (W3.x). Paketi: migration closure dokument + linter gate, data-repair komande sa dry-run i audit tragom, CLI target guard testovi, seed client konsolidacija (`BA-xcut-32`).

**Val 11 (`W11.x`)** — završni gate: (1) pun regression (noćni + dispatch bez `specs`), (2) recovery drill (Redis restart, DB failover, worker restart) sa dokazom, (3) rescore svih 44 audita, (4) acceptance/release zapis u `docs/backend/audits/HANDOFF.md`.

## 10. Acceptance gateovi po valu

| Val | Gate |
| --- | --- |
| **1** | `44 — xcut` **17/17**; migration linter i readiness/rate-limit ugovori izvršni u CI-ju; CLI target guard test; pun Jest zelen |
| **2** | `01–06, 09` **63/63**; cross-module scope parity test (isti akter, ista OU → isto odobrenje kroz users/OU/groups/RBAC); revokacija sesije dokazana kroz najmanje jedan E2E; runovi zeleni |
| **3** | `07, 10, 11, 30, 43` **86/86**; change-log redaction allowlist test; config apply/rollback parity; privacy retention matrica; SIEM delivery/backlog garancija (uz dokumentovanu granicu za vanjski endpoint) |
| **9** | `39–42` **71/71**; alert/recovery runbook dokaz i više-instancni dokaz (ili dokumentovana granica) |
| **8** | `31–38` **148/148**; install wizard E2E (51/52/53) po odluci o resetu baze; directory-sync integration test; Teams/extension contract testovi |
| **10** | migration closure zapis + dry-run/audit dokaz za svaku data-repair komandu |
| **11** | pun zelen regression + recovery drill + rescore + potpisan acceptance |

## 11. Odobrenja i blokade (prije početka paketa)

| Tema | Paket | Šta treba prije početka |
| --- | --- | --- |
| Envelope encryption secreta u postavkama | `W3.24` (`BA-settings-01`) | odobrenje migracije + upravljanje ključem (env/KMS) i plan rotacije |
| Config-versioning lock/CAS | `W3.27` (`BA-config-versioning-04`) | odobrenje migracije (unique/partial index na ACTIVE) + rollout |
| Change-log redakcija/retention | `W3.16` (`BA-clog-05`) | odluka o retention periodu i allowlisti polja |
| Multi-instance dokaz (realtime, Redis revokacija) | `W2.15`, W9 paketi | druga instanca u testnom okruženju ili dokumentovana granica |
| Vanjski SIEM endpoint | `W3.21`–`W3.23` | potrošni endpoint za test; bez njega dokaz je lokalni mock i tako se piše |
| Install wizard E2E (51/52/53) | W8 paketi (`31 — install`) | odluka: reset baze ili `--include-step-markers` |

## 12. Ledger (ažurira se u istom commitu kao paket)

| Paket | Nalaz | Status | Commit / PR | Run ID |
| --- | --- | --- | --- | --- |
| W0.0 | Faza 0 — trijaža dnevnog full CI-ja i popravka speca 12 | **zatvoreno** | `4bdccfc` (spec 12, test-only) | `45376798360` → `45387603494` → `45388019952` → `45391299267` → `45400198567` |
| W1.5 | `BA-xcut-08` — demo CLI: dry-run default, target/confirm/production guard, operator audit | **zatvoreno** | `b213e9b` (kod) | `45413988648` ✓ (prvi pokušaj `45405257580` crven: env-example + integration spec) |
| W1.6 | `BA-xcut-18` — request ID trust policy: 128 znakova, charset, zamjena generisanim UUID-om na ulazu | **zatvoreno** | `4d71f71` (kod + docs) | `45420849606` ✓ (prvi pokušaj) |
| W1.7 | `BA-xcut-20` — centralna log redakcija, exception sanitizer ugovor i skener koji ga čuva | **zatvoreno** | `89b8d35` (kod + docs) | `45451235864` ✓ (prvi pokušaj) |
| W2.9 | `BA-organizational-units-01` — OU control plane: guard + `organizationalUnit.manage` + scope na 6 ruta, drugi target u servisu, suženo stablo | **zatvoreno** | `c9cbc48` (kod + docs) | `45463469776` ✓ (prvi pokušaj `45459606355` crven: stale wiring manifest) |
| W2.10 | `BA-users-01` — users control plane: `user.manage`/`user.security.manage`, user→OU scope lokator, sužena lista, destinacija granta/premještanja | **zatvoreno** | `60f6258` (kod + docs) | `45492790864` ✓ (prvi pokušaj) |
| W2.11 | `BA-organizational-units-02` — dijeljena revizija OU kataloga; bump u transakciji topološkog writea, keš samo uz poklapajuću reviziju, fail-closed na nečitljivu reviziju | **zatvoreno** | `4c25b41` (kod + docs) | `45504527764` ✓ (prvi pokušaj `45503790822` crven: TS2353 u in-memory klijentu) |
| W2.12 | `BA-groups-01` — inventar zavisnosti prije brisanja grupe: 16 relacija razvrstano u block/detach/cascade, 409 sa `blockers[]`, audit `dependencies`, read-only `GET /groups/:groupId/delete-impact` + preview u dijalogu | **zatvoreno** | `354d391` (kod + docs) | `45509708483` ✓ (prvi pokušaj) |
| W2.13 | `BA-groups-03` — fallback cardinality: parcijalni unique index po OU-u, `LAST_FALLBACK_GROUP` (409) za gašenje posljednje oznake, atomska zamjena pod per-OU advisory lockom (uključujući delete i install seed) | **zatvoreno** | `4344b36`+`378f1c1` (kod + docs) | `45558147870` ✓ (prvi pokušaj `45557049318` crven: TS2353 u `groups.service.spec.ts`) |
| W2.11b | perf follow-up na `W2.11` — revizija kataloga OJ u istom statementu kao durable čitanje sesije; 0 dodatnih upita, acceptance nepromijenjen | **zatvoreno** | `f7937fc` | `45605301271` (perf) + `45605301217` (CI) |
| W2.10b | `BA-users-10` (P1, regresija isporuke W2.10) — `import type` + `@Optional()` tiho isključio OU scope liste korisnika; `GET /users` prazan za sve, E2E pao na `EMAIL_CONFLICT` | **zatvoreno** | `a4d6204`+`499c019` (kod + docs) | `45639458079` ✓ (prvi pokušaj `45633604779` crven: baseline fixture findings guarda) |
| W2.14 | `BA-authentication-01` — refresh traži aktivan registry red i poklapanje subjecta; mrtav/tuđi red ⇒ 401 bez tokena i bez `touch`-a, `rememberMe` iz reda | **zatvoreno** | `dc29e55` (kod + testovi + docs) | `45656281822` ✓ + E2E `45656337091` ✓ (`specs=37`, 7/7) + PR #28 `45660699531` ✓ (E2E podskup 27/27) |
| W2.15a | `BA-authentication-09` (P3) — 401 guarda briše mrtav `helpdesk_session` cookie (`Max-Age=0`), samo za cookie pozivaoce; bearer i `403 FORBIDDEN_ORIGIN` netaknuti | **zatvoreno** | `30d4a08`+`53349ed`+`aa81e13` (kod + testovi + docs) | `45673273186`✓ + `45690854305`✓ + E2E `45690854256`✓ (7/7); crveni: `45669474850` (TS2345), E2E `45680384007`/`45681918868`/`45689603505` (test klijent odbacio cookie), `45690239976` (dupliran blok) |
| W2.15 | `BA-authentication-02` — durable cutoff za legacy JWT bez `sid`: `User.tokensInvalidBefore` (+`…ExceptJti`) pišu svi revoke-all putevi, čita isti `findUnique` (0 novih upita); Redis ostaje akcelerator, ne autoritet | **zatvoreno** | `77a0148`+`d2960e0`+`bd1c226` (kod + migracija + docs) | `45700024141` ✓ (crveni: `45695700372` migration sentinel, `45696677032` literalni pin u specu) |
| W2.16 | `BA-authentication-03` — MFA token je trajni atomski single-use claim (`MfaTokenClaim`, PK `jti`: INSERT = claim, `consumedAt` = potrošen, DELETE = oslobođen na odbijen kod); `confirmEnrollment` CAS `updateMany` + recovery set u istoj transakciji; claim prije provjere koda, consume prije sesije | **zatvoreno** | `43bcf2a` (kod + migracija + docs) | `45707676523` ✓ + Perf smoke `45707676445` ✓ + PR #31 `45710816624` ✓ (prvi prolaz: E2E realtime flake uz stack outage, rerun zelen) |
| W2.17 | `BA-authentication-04` — `:sessionId` validacija po šemi: `CuidParamPipe` (`^c[0-9a-z]{19,29}$`, `400 INVALID_ID`) umjesto `ParseUUIDPipe`; vlasništvo netaknuto (`404 SESSION_NOT_FOUND`), pipe spreman za `BA-users-07` | **zatvoreno** | `a82006a`+`37a5b8e` (kod + testovi + docs) | `45761503348` ✓ + `45763497338` ✓ (crveni: E2E spec 15 timeout, pa stack outage — oba rerunom) |
| W2.18 | `BA-authentication-05` — passkey counter kroz CAS: `updateMany({ where: { id, counter } })` uz `count === 1`; gubitnik race-a `401 MFA_INVALID_CODE` bez brisanja faktora, clone put (`PASSKEY_CLONED`) ispred upisa nepromijenjen, counterless (0) i dalje paralelno dozvoljen | **zatvoreno** | `97f4360` (kod + testovi + docs) | `45771967588` ✓ (crveni: E2E spec 15 socket flake, rerun zelen) |
| W2.19 | `BA-authentication-06` — Entra JWKS kroz `entra-jwks-key-resolver.ts`: timeout 5 s (`AbortController`), keš po `jwksUrl` (TTL 24 h, `kid → JWK`), jedan cooldown-om ograničen refresh na nepoznat `kid`, 256 KB cap na dokument, single-flight i stale-on-transport do 7 dana; verifikator drži jedan resolver | **zatvoreno** | `e66d9dd`+`acc2285` (kod + testovi + docs) | `45778720368` ✓ (kod) + `45780736160` ✓ (docs, uključujući `Docs guard`) + Perf smoke `45778720352` ✓/`45780735999` ✓ — bez ijednog reruna |
| W2.20 | `BA-authentication-07` — `prisma generate`/`validate` offline: `scripts/prisma-offline.mjs` daje CLI-ju sentinel umjesto downloada `schema-engine` (binar se za te komande ne koristi), `prisma/engines.lock.json` pinuje engine za migrate put, Jest `globalSetup` generiše klijent na čistom checkoutu, Dockerfile/CI bez mrežne zavisnosti; dokaz sa obrisanim klijentom i mrtvim mirrorom (43 passed / 3 skipped, 372 testa) | **zatvoreno** | `5e0ced9` (kod + testovi + CI koraci) | CI `45787401701` ✓ (svi poslovi, uključujući nova dva koraka) + Perf smoke `45787401067` ✓; docs commit `68dfcaf` run `45790062044`: svi code/docs poslovi ✓, `E2E critical flows` crven u `globalSetup` (`MFA_INVALID_CODE`, 0 izvršenih specova, paralelni `master` run visio u „Run E2E“) — infrastrukturno, dokumentovano u closeoutu; nalaz zatvoren: `813ac8d` (send-test nikad 500 + stabilni razlozi, E2E e-mail opt-in `E2E_ALLOW_EMAIL_SEND`) + `8a3e12c` (docs §CI) — dispatch `45799542900` ✓ (spec 18: 1 passed / 1 skipped, 0 flaky) i push `45799535868` ✓ (svi poslovi) |

| W2.21 | `BA-authentication-08` — clone incident briše **samo** pogođeni passkey: `deleteMany({ where: { id, userId } })` umjesto `{ userId }`, audit `auth.mfa_passkey_clone_detected` sa snapshotom (AAGUID, naziv uređaja, oba brojača, `remainingPasskeys`, fingerprint `sha256(credentialId)[0:16]`, bez credential ID-a) i notifikacija `account.passkeyCloneDetected` (always-on `account.security`, dedupe `passkey-clone:<userId>:<rowId>`); W2.18 CAS netaknut — gubitnik race-a nije clone i ne briše ništa, counter se ne pomjera unazad | **zatvoreno** | `dd2309d` (kod + testovi) + `6c3b484` (docs) | PR #37 `45809614730` ✓ (svi poslovi: `Backend build + test`, `Backend PostgreSQL + Redis integration` — uključuje novi clone integracijski spec, `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` 27/27 bez flakea, `CI gate`) + Perf smoke `45809614466` ✓ — bez reruna; triage dispatch `45809616641` otkazan prije testova (izbjegnut paralelni E2E na dijeljenom stacku) |
| W2.21a | **Plan** — preračunavanje oznaka Vala 2 poslije ranog auth klastera (§1.10 + §4.6): `BA-authentication-04`–`08` izvršeni kao `W2.17`–`W2.21`, njihove planirane oznake `W2.48`–`W2.51`/`W2.63` oslobođene, preostali P1/P2 pomjereni +5 (`W2.22`–`W2.52`), P3 +1 (`W2.53`–`W2.63`), `W2.64`/`W2.65` nepromijenjene — Val 2 ostaje 57 paketa bez rupe i bez duple oznake | **zatvoreno** | `7ffd4ad` (docs-only) | PR #38 `45823597666` ✓ — `Docs guard` + `CI gate`; svi code/E2E poslovi `skipped` jer je izmjena docs-only (workflow ih sam preskače) + k6 smoke `45823597599` ✓ |
| W2.22 | `BA-users-03` — granica pristupa se prekida u istoj transakciji: `cutAccountCredentials` piše `tokensInvalidBefore` (+ briše `exceptJti`), revokuje `UserSession` redove sa razlogom i briše `UserMfa`/recovery/passkey faktore **na transakcionom klijentu pozivaoca**; `updateUser(isActive=false)`, `linkUserDirectoryIdentity` i `unlinkUserDirectoryIdentity` ga zovu unutar svojih transakcija, pa fault u cut-u obara tranziciju (nema 2xx bez durable revoke); `afterCommit` radi Redis akceleraciju, audit `auth.security_transition_applied` i notifikaciju vlasniku; reaktivacija ne oživljava tokene ni faktore | **zatvoreno** | `df69eda` (kod + testovi) + `eacc528` (docs) | PR #39 `45829219995` ✓ — svi poslovi iz prvog pokušaja: `Backend build + test`, `Backend PostgreSQL + Redis integration` (novi boundary integracijski spec), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` 27/27 bez flakea, `CI gate`; k6 smoke `45829219934` ✓ |
| W2.23 | `BA-security-02` — bulk reset blokira **durable prije** registry cleanup-a: po targetu jedna transakcija (`mustChangePassword` kondicionalno → `tokensInvalidBefore = now` + `exceptJti = null` → `UserSession` revokacija sa `admin` razlogom i akterom), tek poslije commita Redis akcelerator za blokirane targete; registry kvar ostavlja račun odmah neupotrebljivim i broji se kao `pendingUsers`, fault bloka vraća **cijeli** target i broji se kao `failedUsers`; `status: COMPLETE|PARTIAL`, `PARTIAL` ⇒ **HTTP 202** (nikad lažni 200), MFA ostaje upisan (prinudna promjena lozinke nije izmjena identiteta); u istom paketu registrovan W2.22 boundary integration spec u izolovani runner (prvi prolaz je našao i popravio dva defekta tog dokaza: lažni notifier uz `prisma.auditLog` tvrdnju, i `recoveryCodes` → `recoveryFactors` jer policy redaktuje ključ) + guard protiv neevidentiranih `users`/`security` integracija | **zatvoreno** | `7a925419` (kod + testovi) + docs commit | PR #40 `45876845930` ✓ — svi poslovi: `Backend build + test`, `Backend PostgreSQL + Redis integration` (prvi prolaz oba registrovana spec-a), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` 27/27 bez flakea, `CI gate`; push run `45876839098` ✓ sa integracijom **skipped** (novi CI ugovor) + Perf smoke `45876845979` ✓ |
| W2.24 | `BA-security-03` — privilegovani auth audit je **durable**: tri prećutna `try/catch` bloka (rate-limits retune, zbirni bulk reset, account-security notifier) zamijenjena su `PrivilegedAuditService`-om nad postojećim transactional outboxom (topic `audit.privileged`, bez nove šeme); namjera se piše **na transakciji pozivaoca** (`recordWithinTransaction`) pa se commit-uje ili nestaje sa promjenom, a dostava commit-uje audit red i `SUCCEEDED` u **jednoj** transakciji (`dispatchOneTransactionally`) ⇒ poslije oporavka **tačno jedan** koreliran zapis; `record` vraća `delivered\|pending\|unavailable` umjesto da proguta grešku, idempotency key (`action:entityId:uuid` ili po runu) kolabira ponovljeni događaj, `health()` + `GET /security/metrics/privileged-audit` (SUPER_ADMIN, `no-store`) i red u „Nadzor“ kartici su alarm, dead letter je log + `replayDeadLetter`; odluka **durable-accept** (akcija se ne obara zbog audita) dokumentovana u closeoutu | **zatvoreno** | `8ec208d4` (kod + testovi) + docs commit | PR #41 `45891193873` ✓ — svi poslovi: `Backend build + test`, `Backend PostgreSQL + Redis integration` (privileged-audit 4/4, outbox 7/7, bulk 3/3, boundary 5/5), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` 27/27 bez flakea, `CI gate`; tri iteracije dokaza (`45883710368`, `45885971738`, `45888362283`) svaka je našla stvarni defekt (vidi closeout 358) |
| W2.25 | `BA-groups-02` (P1) — opozvano članstvo prestaje važiti odmah: `User.authzVersion` je **revizija članstva** i podiže se **unutar** transakcije koja mijenja `group_member` (add/remove/delete), pa commit i revizija ne mogu da se raziđu; verzija ulazi u request scope iz **postojećeg** durable čitanja sesije (`SessionRevocationStore.check`, 0 novih upita), a `loadActorGroupMemberships` servira 30 s snapshot **samo** pod tom revizijom (bez objavljene verzije čita bazu — nikad ne servira neprovjerljiv keš); uklanjanje člana piše i **durable** namjeru (`groups.membership-revoke`, dedupe `group:subject:revision`, 20 pokušaja) na transakciji pozivaoca, a `GroupRoomRevokeDispatcher` je pretvara u novi `kind: 'group'` event na postojećem socket kanalu — svaka instanca izbacuje subject iz `group:<id>` bez diskonekcije sesije (neuspio `leave` ⇒ diskonekcija, fail closed); 30 s sweep ostaje safety net; premise nalaza ispravljene (sweep je već bio 30 s, ne 5 min) | **zatvoreno** | kod + testovi + `359` | PR #42 `45903010971` ✓ — svi poslovi: `Backend build + test`, `Backend PostgreSQL + Redis integration` (18m8s, uključuje novi `group-membership-revoke` spec), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` 27/27 bez flakea, `CI gate`; push run `45903003104` ✓ sa integracijom **skipped** (CI ugovor) + Perf smoke `45903010749` ✓; dva crvena prolaza (`45900096760`, `45901278815`) su našla stvarne defekte (install double bez `User.authzVersion`, dva testa koja su tvrdila zastarjeli snapshot, neizolovan retry test i fake Redis bez `status:'ready'`) — vidi closeout 359 §3 |
| W2.26 | `BA-users-02` (P1) — kreiranje računa je **jedna odluka i jedan commit**: autorizacija i validacija cijelog intenta (`assertCanAssignRole`, rola, OU, e-mail, HIBP lozinka) idu **prije** prvog upisa; račun + hash + rola + namjera dostave + oba audita u **jednoj** transakciji (`createUserRoleWithinTransaction` dijeli pravila sa `assignUserRole`); dostava poslije commita po kanalu određenom prije commita — `ui` vraća tajnu u odgovoru, `email` piše durable namjeru `users.temporary-password-delivery` **bez tajne**, a worker (`maxAttempts=8`) izdaje lozinku, ne pregazi administratorski reset i vraća hash na `null` ako e-mail nije otišao; `user.created` audit bilježi kanal; install wizard prosljeđuje outbox | **zatvoreno** | kod + testovi + `360` | PR #43 `45956935765` ✓ — svi poslovi: `Backend build + test`, `Backend PostgreSQL + Redis integration` (14m3s, uključuje novi `user-provisioning` spec), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` 27/27 bez flakea, `CI gate`; push run `45956928588` ✓ sa integracijom **skipped** (CI ugovor) + Perf smoke `45956935587` ✓; prvi prolaz `45955076835` crven u integraciji i našao dva defekta u dokazu (role audit visi na `UserRole` redu; pad SMTP-a mora biti mock odgovor pošiljaoca, inače worker nikad ne vidi grešku) — vidi closeout 360 §3 |
| W2.27 | `BA-authorization-03` (P2) — read-only režim čita **census ruta**, ne ručnu listu: novi `adminReadOnlyRouteRegistry` popisuje svaku od **74** mutirajuće rute u lockable stablu po handler identitetu (`Controller.method`; 70 `mutation` + 4 `read`), a interceptor je pita iz `ExecutionContext` — nepoznat mutirajući handler unutar modula je **fail-closed** mutacija; `@AdminReadOperation` (44 upotrebe u 11 controllera, 37 inertnih) i lista putanja su **obrisani**, pa je izuzetak samo `kind: 'read'` zapis (4 čista reada: config `previewImport`/`validate`/`shadow`, `policy-packs validate`) pinovan testom; novi guard test poredi census sa centralnim `backend-wiring-manifest.json` (99 controllera / 634 rute) i pada na nekatalogizovanoj mutaciji (`uncatalogized-mutation`), zastarjelom zapisu, promjeni metode/putanje i preseljenju rute u drugi modul, a `service_forms ⊂ service_catalog` nesting je eksplicitno deklarisan; `POST /directory-sync/read` (koji upsertuje OU/users) prestaje biti „read“ | **zatvoreno** | kod + testovi + `361` | PR #44 `45966116686` ✓ — svi poslovi: `Backend build + test`, `Backend PostgreSQL + Redis integration` (14m34s), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` (prvi prolaz crven na `22-accessibility.spec.ts:85` axe nalazu, rerun zelen), `CI gate`; push run `45966094380` ✓ sa integracijom **skipped** (CI ugovor) + Perf smoke `45966116620` ✓ i `45966094338` ✓ |
| W2.28 | `BA-authorization-04` (P2) — Prisma precondition je **zajednička faza**, ne trik Jest-a: `scripts/ensure-generated-prisma.mjs` (brz put kad su artefakti tu; inače offline generate kroz `prisma-offline.mjs`; akciona greška sa `npm run db:generate` umjesto `Cannot find module`) sada hrani `prebuild`, Jest `globalSetup` (unit **i** izolovani integracijski runner) i CLI (`npm run db:ensure-generated`); CI sa mrtvim `PRISMA_ENGINES_MIRROR` briše `src/generated/prisma` pa dokazuje `npm run build` **i** `src/modules/authorization` (29 spec fajlova: 27 unit zelenih + 2 real-DB integracijska u integracijskom poslu), a novi workflow guard test pada ako se taj dokaz ukloni ili presloži iza suiteova; broj compile-blocked suiteova 0 (bilo 10/25) | **zatvoreno** | kod + testovi + `362` | PR #45 `45975684235` ✓ — svi poslovi: `Backend build + test` (6m11s, uključuje nove offline dokaze: obrisan klijent → `npm run build` i 27/27 authorization suiteova), `Backend PostgreSQL + Redis integration` (14m29s), `Frontend build + test`, `Backend container + supply chain` (3m43s, poslije popravke build contexta), `Docs guard`, `E2E critical flows` (9m59s, zelen poslije oporavka dijeljenog stacka), `CI gate`; push run `45975676464` ✓ sa integracijom **skipped** + Perf smoke `45975684055` ✓; prvi prolaz je oborio container posao (prebuild je importovao repo-root guard izvan Docker contexta) — popravka `7cb35592`; E2E je četiri puta padalo na `MFA_INVALID_CODE`/`ECONNREFUSED` dok je i `master` schedule run padао na istom stacku |
| W2.29 | `BA-rbac-01` (P2) — pregled uticaja sada nosi **baseline**: token potpisuje i `baselinePermissionKeys` (obavezan ulaz, normalizovan kao i predloženi skup), pa `PUT` ne dokazuje samo „pregledao sam X" nego i „od kada". `replaceRolePermissions` čita stanje **unutar** transakcije poslije `pg_advisory_xact_lock` i poredi ga sa baselineom **prije** ijednog upisa — razlika ⇒ `PREVIEW_STALE` (409) bez promjene i bez audit reda, a isti read hrani audit `previousPermissionKeys` (stanje koje je upis stvarno zamijenio, ne ono pročitano prije locka); token izdan prije deploya (bez baselinea) traži ponovni pregled. Bez šeme, migracije, DTO-a i frontend izmjene; `Role.revision` kolona odbijena kao skuplja varijanta iste semantike | **zatvoreno** | kod + testovi + `363` | PR #47 `45999085493` ✓ — svi poslovi iz prvog pokušaja: `Backend build + test` (6m3s), `Backend PostgreSQL + Redis integration` (17m51s, uključuje novi `role-permission-preview-cas` spec: sekvencijalni A/B scenarij i paralelni `Promise.allSettled` par ⇒ tačno jedan pobjednik), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`, `E2E critical flows` (10m0s), `CI gate`; push run `45999079142` ✓ sa integracijom **skipped** (CI ugovor) + Perf smoke `45999085457` ✓ |
Statusi: `_čeka_` · `u toku` · `zatvoreno` · `odgođeno (razlog)`. Redoslijed se ne mijenja bez zapisa ovdje.

## 13. Šablon izvještaja nakon svakog paketa

```
## <Paket> — <BA-nalaz> (<P>): <naslov>
Nalaz:      <šta je bilo pokvareno/nedokazano>
Promjena:   <kod; bez čega bi test pao>
Dokaz:      unit <n>, integration <n>, E2E <spec>, build/eslint/wiring/traceability <brojevi>
CI:         push <id> ✓, PR <id> ✓, E2E dispatch <id> ✓
Docs:       <audit §, paket NNN, registar, master plan, ovaj ledger>
Rizik:      <šta ostaje otvoreno i zašto>
Sljedeći paket: <ID> (BA-<nalaz>) — <razlog u jednom redu>
```
