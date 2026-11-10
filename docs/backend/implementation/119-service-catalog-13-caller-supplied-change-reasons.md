# Closeout — `BA-service-catalog-13` (caller-supplied mutation reasons)

**Nalaz:** `BA-service-catalog-13` (P3) — **zatvoren owner-directed 2026-11-03** nakon izričite korisničke dozvole.<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Odluka:** CI je potvrdio implementaciju; status je promijenjen tek nakon zasebne izričite korisničke odluke o zatvaranju.<br>
**Prethodni nalaz:** BA-09 zatvoren owner-directed; dokaz i ograničenja su u [118 closeoutu](118-service-catalog-09-owner-directed-closeout.md).<br>
**Schema / migracija / ciljna baza:** BA-13 ne mijenja Prisma schema ni migracije; ciljnoj bazi nije pristupljeno.

## Nalaz i isporučeni ugovor

Audit 15 je utvrdio da category, lifecycle i service-form mutacije nisu imale dosljedan caller-supplied reason ugovor: neke putanje su koristile fiksni razlog, a druge nisu prenosile razlog kroz UI/API. Implementacija također pokriva delete putanje i normalizaciju.

Za ljudske mutacije razlog je obavezan na HTTP DTO/domain granici, trimuje se i ograničen je na 1–512 znakova; prazan ili samo-razmak razlog se odbija. Vrijednost koju je pozivalac unio snima se u `ChangeLog.reason`, a stabilni `diff.action` ostaje zaseban mašinski čitljiv tip radnje. Nema generičkog hard-coded razloga za autentifikovanog ljudskog pozivaoca. Pozivi bez actor-a za interne/system/seed operacije zadržavaju stabilne action fallback razloge.

Obuhvaćene HTTP mutacije:

- kreiranje/ažuriranje service category i category delete (`reason` u bodyju za create/update, query parametar za delete);
- lifecycle transition (`reason` u bodyju);
- form create, version create/update i activation (`reason` u bodyju);
- service delete (`reason` query parametar);
- service create/update nastavljaju koristiti postojeći required DTO reason, sada kroz zajedničku normalizaciju i action audit polja.

Form builder više ne kreira prvu formu kao sporedni efekat čitanja/otvaranja ekrana. Prva forma se kreira eksplicitnom akcijom nakon što administrator unese razlog, tako da nema ljudski actor sa sistemski izmišljenim razlogom. Availability/downtime ugovori i ostali nalazi nisu mijenjani.

## Dokaz

CI [`41697055454`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41697055454) na kodnom SHA `6a3546b2ebd46ff75dde7cba435709468d17f3a3` je **success**. Backend generated-Prisma build/lint/full Jest, PostgreSQL/Redis integration na disposable CI bazi, frontend build/test, docs guard, container/supply-chain i CI gate su **passed**.

Read-only inventory, E2E critical/install i conditional zero-high/critical image enforcement su **skipped**, ne passed. Nema browser/spec 56 sign-offa. CI nije dokaz deploya niti primjene migracije.

Odvojeni Perf smoke [`41697055530`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41697055530) na istom SHA-u je **failure** samo na nepovezanom search p95 `956.26 ms` prema pragu `<500 ms`. Ticket-message p95 `945.25 ms`, service-catalog p95 `60.03 ms`, service-catalog contract failures `0`, payload p95 `112.42 KB` i query-budget avg `2.088` prema `2.1` su **passed**. Perf failure nije BA-13 acceptance i nije proširen u BA-13 scope.

## Statusne granice

BA-13 je **zatvoren owner-directed** na osnovu izričite korisničke dozvole od 2026-11-03 uz navedeni CI dokaz. Nije izvršeno target-DB pristupanje, migracija, deployment, merge ni PR prema `master`. BA-routing-02 i statusi drugih nalaza nisu mijenjani ovim closeoutom.

Deklarisani globalni zbir nakon zatvaranja samo BA-13 je **557 otvoren / 135 zatvoren / 692 ukupno**. Machine-readable source redovi su **560 otvoren / 121 zatvoren / 11 historijskih**; postojeća razlika od tri statusa ostaje dokumentovana. `service-catalog` ima **2 otvorena / 13 zatvorenih**. Sljedeći scope je otvoreni P3 `BA-service-catalog-14`, incident-impact read fail-closed; implementacija i lokalni status su u [120 checkpointu](120-service-catalog-14-incident-read-fail-closed.md).
