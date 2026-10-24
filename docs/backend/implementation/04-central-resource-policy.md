# Backend Val 2 — W2.3 centralni permission/scope/ownership policy

## 1. Status i dokaz

- Status paketa: **završen kao centralni policy primitive i servisni entry point**.
- Implementacija: `e1b6b6d5a758ef597cd0e3f2d3db36dd7eead068`, fixture ispravka `201678ac5b77d65bc4b2fc70b18132e0bbbadb74`.
- Kanonski CI: **40121407427**, potpuno zelen.
- Nema migracije ni mutacije produkcijskih podataka.

## 2. Canonical odluka

`evaluateResourcePolicy` je jedna fail-closed odluka sa ulazima:

- authorization context;
- jedan obavezni permission key;
- target owner user ID;
- OU ID + kanonski path ili service ID;
- eksplicitni `allowOwner` opt-in.

Role key nije policy input. Običan assignment može odobriti pristup samo kroz traženi permission i jednu od sljedećih grana:

1. globalni assignment;
2. OU assignment koji pokriva target path, uključujući potomke;
3. service assignment sa tačno istim service ID-em;
4. eksplicitno dozvoljeno vlasništvo, uz isti permission;
5. local-only SuperAdmin bypass iz postojećeg invariantnog contexta.

Blank permission, nepotpun OU locator, OU+service target, foreign service, sibling OU, foreign owner i missing context završavaju odbijanjem.

## 3. Servisna granica

`AuthorizationService.authorizeResource` centralno:

- učitava principal authorization context;
- rješava OU path iz PostgreSQL-a;
- potvrđuje da service postoji;
- prosljeđuje samo kanonski target policy evaluatoru;
- vraća strukturiranu odluku i razlog.

Novi entry point nema `requiredRoles` parametar, čime role-key shortcut nije moguć u ovom policy putu. Stari decorator/route put ostaje radi kontrolisane migracije domain modula; nije netačno označen kao završen rollout.

## 4. Test matrica

Unit testovi dokazuju:

- role key sam ne daje pristup;
- permission daje pristup nezavisno od naziva role;
- OU potomak prolazi, sibling OU ne prolazi;
- tačan service prolazi, foreign service ne prolazi;
- dual-scope target je nevažeći;
- ownership zahtijeva eksplicitni opt-in i permission.

Real-PostgreSQL suite kreira stvarne user, role, permission, OU hijerarhiju, dva servisa i scoped `UserRole` redove. Pozitivne kontrole i cross-user, cross-OU i cross-service negativni scenariji izvršavaju se nad persisted assignmentima. Suite je uključen u isolated integration runner.

## 5. Preostale granice

- Postojeći `@RequireRoles` routeovi nisu masovno prebačeni u ovom paketu; njihova migracija mora biti modul-po-modul uz permission catalog i regression testove.
- Route manifest, typed decorator tokeni i current-session scoped capability response ostaju zasebni otvoreni nalazi.
- Domain queryji i dalje moraju pushdownati isti policy u DB filtere gdje collection cardinality ili confidentiality to zahtijevaju.

## 6. Sljedeći paket

**W2.4 — fail-closed step-up i emergency/recovery tokovi:** centralizovati MFA/step-up dokaz, recovery identitet i emergency pristup te dokazati replay, expiry, non-local SuperAdmin i degraded dependency negativne scenarije.
