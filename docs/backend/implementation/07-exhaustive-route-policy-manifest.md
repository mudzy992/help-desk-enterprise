# Backend Val 2 / W2.6 — iscrpan route policy manifest

## Status

**Završeno.** Implementacija je na SHA `52b5f1af95e7c650cfecef91a88a602edd5279e8`; potpuno zeleni CI dokaz je `40127087672`.

Zatvoren je `BA-authorization-02`: svaka HTTP ruta i worker composition root sada pripadaju jednoj eksplicitnoj klasi, a CI odbija implicitnu petu klasu.

## Klasifikacijski ugovor

Dozvoljene su tačno četiri klase:

1. `authenticated` — ruta ima stvarnu autentikacijsku granicu (`SessionAuthenticationGuard` ili install credential/lock guard), uz sve dodatne role, permission, scope i step-up guardove;
2. `public` — namjerno ne zahtijeva session, ali mora imati eksplicitan owner i dokaz zašto je javna;
3. `webhook` — inbound integracija ima vlastiti provjeren token/potpis ugovor, owner i dokaz;
4. `worker` — non-HTTP worker composition root.

Guard sam po sebi nije dovoljan: ruta koja ima samo policy guard bez autentikacijske granice ruši provjeru. Guardovana ruta ne može dobiti public/webhook override.

## Inventar

Machine-readable snapshot `docs/backend/backend-wiring-manifest.json` obuhvata:

- **98 controllera**;
- **610 HTTP ruta**;
- **590 authenticated** ruta;
- **19 public** ruta;
- **1 webhook** rutu;
- **1 worker** execution surface.

Svaki zapis sadrži source, controller, handler, HTTP metodu i putanju, class/method guardove, klasifikaciju, policy ownera i dokaz.

## Eksplicitni izuzeci

`backend/route-policy-overrides.json` je uska lista samo namjerno session-less HTTP ruta i worker rootova. Obuhvata:

- pre-auth authentication tokove, uključujući login, MFA enrollment/verify i idempotent logout;
- sanitizovane branding, privacy notice i status projekcije;
- health/readiness probeove;
- revocable-token on-call calendar;
- Teams inbound webhook sa vlastitim JWT/HMAC ugovorom;
- `WorkerModule` kao non-HTTP worker granicu.

Stale override, nepoznata klasifikacija, nedostajući owner/proof ili override nad guardovanom rutom ruše manifest generation/check.

## CI guard

`check-backend-wiring.mjs` sada:

- AST-om inventariše sve controller metode;
- automatski priznaje `authenticated` samo uz prepoznatu auth granicu;
- zahtijeva eksplicitni registry zapis za svaku rutu bez auth guarda;
- odbija novu neklasifikovanu rutu;
- odbija policy guard bez auth granice;
- odbija stale registry zapis;
- snapshotuje API i worker root module wiring.

Contract testovi dokazuju pozitivne i negativne slučajeve, uključujući novu guardless rutu i `RoleGuard` bez autentikacije.

## Verifikacija

CI `40127087672` potpuno je zelen:

- wiring snapshot i negativni manifest guard testovi;
- backend build, lint i puni Jest;
- PostgreSQL/Redis integration;
- frontend i docs guard;
- container/supply-chain;
- završni CI gate.

## Granice paketa

W2.6 klasifikuje transport/authentication ownership. Ne tvrdi da je svaka postojeća domain ruta već migrirana sa role-key prečica na završni permission + scope/resource policy. Taj modul-po-modul rollout ostaje naredni posao. `BA-authorization-03` i `BA-authorization-07` također ostaju otvoreni.

## Sljedeće

Sljedeći paket je **W2.7 — docs/admin/config read granice prebaciti sa role-key stringa na permission + scope odluku**.
