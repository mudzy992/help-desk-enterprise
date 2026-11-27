# 361 — W2.27 `BA-authorization-03`: read-only režim čita census ruta, ne ručnu listu

**Paket:** `W2.27` · **Nalaz:** `BA-authorization-03` (P2) · **Datum:** 2026-11-27 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** authorization + configuration platform · **Povezano:** `BA-authorization-02`, `BA-authorization-06`, `BA-directory-sync-01`

## 1. Nalaz i šta je stvarno bilo pokvareno

Read-only režim je odgovarao na pitanje „smije li ovaj zahtjev pisati?" iz dvije ručne liste:

1. `adminReadOnlyRouteModules` — 10 URL prefiksa mapiranih na 6 modula, sortiranih po dužini da najspecifičniji
   pobijedi. Ruta izvan svih prefiksa **nije bila zaključana**, i niko nije provjeravao da li prefiks pokriva sve
   rute modula koji tvrdi da štiti.
2. `@AdminReadOperation()` — dekorator koji je **bilo koji** handler mogao označiti kao „read", bez obzira na
   modul, HTTP metodu ili stvarni side effect. Uz njega je postojao i treći mehanizam, lista putanja
   `adminReadOnlyReadMutationPaths` (`/directory-sync/read`, `/policy-packs/validate`).

Pretraga je pokazala koliko je taj escape hatch bio širok: dekorator je stajao na **44 handlera u 11
controllera**. Od toga je samo **7** bilo na mutirajućem glagolu unutar lockable modula — ostalih 37 su `GET`
rute ili rute izvan scopea, gdje dekorator nije radio ništa. Dakle, mehanizam je u praksi bio istovremeno
preširok (mogao je osloboditi svaku mutaciju) i tih (37 od 44 upotreba nije imalo nikakav efekat).

Najozbiljniji konkretan slučaj: `POST /directory-sync/read` je nosio dekorator i bio je u listi izuzetaka, a
`DirectorySyncService.executeRead` poziva `materializeDirectoryRead` — upsert produkcijskih OU/users/groups i
invalidaciju principal keša. Mutacija je prolazila kroz read-only režim kao „read". To je već dokumentovano kao
`BA-directory-sync-01` (P1); ovaj paket zatvara **read-only dio** tog defekta, ne i razdvajanje read/materialize.

Uz sve to, repozitorij **je** imao centralni registar ruta — `docs/backend/backend-wiring-manifest.json`
(634 rute, 99 controllera, generisan iz stvarnih controller fajlova i verificiran u CI-ju kroz `wiring:check`) —
ali read-only režim ga nije koristio, a nijedan test nije poredio kompletan census admin mutacija sa onim što
režim zaista štiti.

| Scenario prije paketa | Ishod |
| --- | --- |
| nova konfiguraciona ruta pod prefiksom koji niko ne posjeduje | nije zaključana, i testovi ostaju zeleni |
| nova `POST` ruta u `settings` controlleru | zaključana „slučajno", jer prefiks pogađa — niko to nije zapisao ni provjerio |
| `@AdminReadOperation()` na novoj mutaciji | read-only režim je tiho propušta |
| `POST /directory-sync/read` u read-only režimu | prolazi i mijenja identity podatke |
| legitimna read RPC ruta premještena na drugu putanju | izuzetak ostaje vezan za staru putanju, nova se blokira |

## 2. Korekcija

### 2.1 Census rutâ kao jedini izvor klasifikacije

Novi `admin-read-only-route-registry.ts` je **popis svake mutirajuće rute** (`POST`/`PUT`/`PATCH`/`DELETE`)
unutar lockable stabla — 74 zapisa, ključanih po **handler identitetu** `Controller.method`:

```ts
{
  handler: 'DirectorySyncController.read',
  method: 'POST',
  path: '/directory-sync/read',
  moduleKey: adminReadOnlyModuleKeys.admin,
  kind: 'mutation',
}
```

Raspodjela po modulima: `service_catalog` 26, `settings` 16, `sla` 14, `admin` 11, `service_forms` 4,
`routing` 3. Od 74 rute, **70 je `mutation`** i **4 su `read`** (vidi 2.3).

Interceptor više ne čita dekorator: handler identitet uzima iz `ExecutionContext`
(`context.getClass().name` + `context.getHandler().name`) i pita registar. Ako handler nije u registru,
klasifikacija pada na prefiks i tada je **fail-closed**: nepoznat mutirajući glagol unutar lockable modula je
mutacija. Tako „neotkrivena" ruta ne može ostati otključana samo zato što je niko nije upisao.

### 2.2 Guard test: census protiv centralnog manifesta

`admin-read-only-route-census.ts` je čista funkcija koja poredi registar sa
`docs/backend/backend-wiring-manifest.json` — istim manifestom koji CI već drži sinhronizovanim sa stvarnim
controllerima (`wiring:check`: 99 controllera / 634 rute). Prijavljuje šest vrsta drifta:

| Vrsta | Znači |
| --- | --- |
| `uncatalogized-mutation` | mutirajuća ruta pripada modulu, ali nema zapisa u registru → **guard test pada** |
| `stale-registration` | zapis u registru više ne postoji u manifestu, nije mutirajući, ili je ispao iz lockable stabla |
| `attribute-mismatch` | registar i manifest se ne slažu o metodi/putanji |
| `module-mismatch` | URL sada pripada drugom modulu nego što registar tvrdi |
| `ambiguous-module-ownership` | dva modula polažu pravo na istu putanju bez deklarisane pod-modul relacije |
| `duplicate-registration` | isti handler upisan dvaput |

Time je acceptance izveden doslovno: **svaka admin mutacija pripada tačno jednom lockable modulu**, a
**nekatalogizovana mutacija ruši guard test**.

### 2.3 Read RPC izuzeci po handler identitetu

Dekorator `@AdminReadOperation` i lista putanja su **obrisani**. Jedini način da mutirajući glagol ne bude
zaključan je zapis `kind: 'read'` u censusu, vezan za handler — ne za URL. Preostala su četiri izuzetka, i svi
su čista izračunavanja nad već sačuvanim stanjem:

| Handler | Zašto smije u read-only režimu |
| --- | --- |
| `ConfigVersioningController.previewImport` | parsira i validira uvezeni paket, ne upisuje |
| `ConfigVersioningController.validate` | validira snimak verzije |
| `ConfigVersioningController.shadow` | računa diff kandidata i aktivne verzije (`computeShadowDiff`) |
| `PolicyPacksController.validate` | validira paket prije primjene |

Spisak izuzetaka je **pinovan testom**: dodavanje novog `kind: 'read'` zapisa je promjena koja se vidi u diffu i
mora proći review, a nije lokalna anotacija koju autor stavi na svoj endpoint.

### 2.4 Vlasništvo nad putanjom je deklarisano, ne implicitno

`resolveAdminReadOnlyModule` vraća pobjednika **i** sve kandidate; `isAdminReadOnlyModuleOwnershipExplicit`
prihvata skup od jednog modula ili deklarisanu relaciju pod-modula. Jedini takav slučaj je
`service_forms ⊂ service_catalog` (`/services/:serviceId/form/**`), i sada je zapisan jednom
(`adminReadOnlySubModules` + `adminReadOnlyServiceFormsPathPattern`) umjesto da bude skriven u poretku `if`
grana. `read-only-mode.constants.ts` više ne opisuje rute — samo vlasništvo prefiksa.

## 3. Dokaz

### 3.1 Unit

| Spec | Šta dokazuje |
| --- | --- |
| `admin-read-only-route-census.spec.ts` (6, novo) | registar ⇄ manifest bez ijedne vrste drifta; 74 zapisa; pinovan spisak od 4 `read` handlera; svih 6 modula zastupljeno; **negativni testovi**: dodata nekatalogizovana `POST /settings/retention-policy`, uklonjena ruta i premještena ruta svaki proizvode očekivanu vrstu kršenja |
| `classify-admin-read-only-request.spec.ts` (6, prepisan) | registrovani read (`PolicyPacksController.validate`, `ConfigVersioningController.shadow`) ostaje read; `DirectorySyncController.read` je **mutacija** i pored imena; nepoznat mutirajući handler unutar modula je mutacija (fail-closed); poznati upisi padaju u svoj modul; `service_forms`/`service_catalog` nesting i granica `form` vs `formula` |
| `admin-read-only.interceptor.spec.ts` (4, +2) | `POST /policy-packs/validate` prolazi bez čitanja konfiguracije; `POST /directory-sync/read` vraća `READ_ONLY_MODE`; stari put (`RoleGuard` pa blokada `apply`) nepromijenjen |
| `setup-checklist.controller.spec.ts` (prepravljen) | kontroler više ne nosi nikakav izuzetak; checklist nije konfiguracija pa read-only režim nema šta da klasifikuje |

### 3.2 Regresija

- `authorization` + `setup-checklist`: **136 passed / 2 skipped**.
- `audit-log`, `config-versioning`, `directory-sync`, `inbound-email`, `ops-health`, `policy-packs`, `privacy`,
  `reports`, `teams`, `setup-checklist` (svih 11 controllera iz kojih je dekorator uklonjen):
  **1153 passed / 66 skipped**, 172 suitea.
- `app.module.spec.ts`: DI lanac intereceptora (koji je izgubio `Reflector` zavisnost) se kompajlira.
- `npm run wiring:check`: 99 controllera / 634 rute — manifest se **nije** promijenio (dekorator nije bio dio
  manifesta), pa nije bilo regenerisanja.
- `tsc --noEmit`: čist osim poznatog `announcement-delivery.spec.ts:310`; `eslint` čist na svim dotaknutim
  fajlovima.

### 3.3 CI

_Detalji se dopunjavaju uz PR (vidi ledger `W2.27` u `EXECUTION-PLAN-REMAINING.md`)._

## 4. Šta paket mijenja u ponašanju

- **`POST /directory-sync/read` je u read-only režimu sada blokiran.** To je namjena: ruta upisuje OU/users
  (`materializeDirectoryRead`). Zadani bypass (`super_admin`, samo lokalni) je nepromijenjen, pa lokalni
  super-admin i dalje prolazi — ali klasifikacija više ne tvrdi da je to read.
- **`POST /directory-sync/test-connection` i `POST /directory-sync/dry-run` su takođe mutacije** — kreiraju
  run/audit/backoff zapise. U read-only režimu su blokirani kao i `apply`.
- **Konfiguracijski read RPC-i ostaju dostupni**: validacija paketa, validacija i shadow konfiguracijske
  verzije, preview importa.
- **Dekorator `@AdminReadOperation` više ne postoji** (44 linije u 11 controllera). Nijedna ruta nije dobila
  novi izuzetak; sedam prijašnjih izuzetaka je svedeno na četiri stvarna reada.
- **Neotkrivena mutacija unutar lockable modula se i dalje blokira** (fail-closed fallback), a sada istovremeno
  ruši guard test — dakle vidi se u CI-ju, ne samo u produkciji.

## 5. Granica paketa

- **Ne** razdvaja read od materijalizacije u `directory-sync` — `BA-directory-sync-01` ostaje otvoren; ovaj
  paket samo prestaje da tu mutaciju proglašava readom.
- **Ne** uvodi fine permissione po ruti (`BA-authorization-02`, `BA-authorization-06` ostaju otvoreni).
- **Ne** mijenja manifest, `wiring` skriptu, CSV env ugovor (`READ_ONLY_MODE_MODULES` i dalje prima istih 6
  ključeva) ni HTTP kontrakt (isti `READ_ONLY_MODE` kod i `403`).
- **Ne** dira `evaluateAdminReadOnlyAccess` (bypass i aktivni moduli) — mijenja se samo **kako** se ruta
  klasifikuje, ne šta se s klasifikacijom radi.

## 6. Reference

- Kod: `backend/src/modules/authorization/{admin-read-only-route-registry.ts,`
  `admin-read-only-route-census.ts,classify-admin-read-only-request.ts,read-only-mode.constants.ts,`
  `admin-read-only.interceptor.ts}`; uklonjen `admin-read-operation.decorator.ts`.
- Testovi: `backend/src/modules/authorization/{admin-read-only-route-census.spec.ts,`
  `classify-admin-read-only-request.spec.ts,admin-read-only.interceptor.spec.ts}`,
  `backend/src/modules/setup-checklist/setup-checklist.controller.spec.ts`.
- Centralni registar: `docs/backend/backend-wiring-manifest.json` (`npm run wiring:check`).
- Audit: `docs/backend/audits/02-authorization.md` §`BA-authorization-03`; kontekst:
  `docs/backend/audits/35-directory-sync.md` §`BA-directory-sync-01`.
