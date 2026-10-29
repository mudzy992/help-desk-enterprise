# Backend Val 2 / W2.8 — route-level negativna authorization matrica

## Status

**Završeno.** Kod i registracija testa su na SHA `25f83c7`, fixture ispravke na `4ef9c1a` i `386b206`, a potpuno zeleni CI dokaz je `40130219620`.

W2.8 je završni dokaz Vala 2. Paket ne zatvara dodatne audit nalaze: potvrđuje da prethodno uvedene authorization granice rade zajedno kroz kanonske izvršne entry pointove.

## Izvršni dokaz

`route-authorization-negative-matrix.integration.spec.ts` koristi stvarni PostgreSQL i persisted korisnike, role, permissione, role-permission veze, assignment scopeove i OU hijerarhiju. Test poziva:

- `executeAuthorizedHttpRequest` kao kanonsku HTTP/route authorization granicu;
- `AuthorizationService.authorizeResource` kao centralnu resource/ownership granicu.

Suite je eksplicitno registriran u izolovanom integration runneru. Contract test runnera zaključava registraciju kako se matrica ne bi mogla neprimjetno izostaviti iz CI-a.

## Matrica

Dokazani su sljedeći scenariji:

- OU-scoped principal smije pristupiti child OU-u pokrivenom njegovim scopeom;
- isti principal je odbijen za sibling OU;
- OU-scoped `settings.read` je odbijen na globalnoj settings ruti;
- inactive principal je odbijen prije autorizacijske odluke;
- drugi korisnik je odbijen nad owner-bound resursom;
- vlasnik sa potrebnim permissionom prolazi i odluka vraća `OWNER_ALLOWED`.

Owner kontrola namjerno ima potreban permission: ownership nije i ne smije postati implicitni bypass permission provjere.

## Verifikacija

CI `40130219620` potpuno je zelen, uključujući:

- backend build, lint i puni Jest;
- stvarni PostgreSQL/Redis integration posao i novu negativnu matricu;
- izolovani integration runner contract;
- frontend, docs guard, container/supply-chain i završni CI gate.

Raniji runovi `40129553818` i `40129869580` nisu završni dokaz: prvi je otkrio nepotpun Prisma fixture, a drugi nedostajući owner permission assignment. Oba problema su ispravljena prije završnog zelenog runa.

## Granice paketa

W2.8 ne tvrdi da su svi domain controlleri već migrirani sa svakog historijskog role-key shortcuta; taj rollout ostaje vezan za odgovarajuće modulske nalaze. Paket dokazuje fail-closed ponašanje centralnih route/resource entry pointova i reprezentativne negativne scope/identity slučajeve.

## Sljedeće

Sljedeći paket je **W3.1 — inventar i canonical append-only audit primitive: actor/action/entity registry, correlation kontekst, centralna redakcija i izvršna atomarnost zapisa**.
