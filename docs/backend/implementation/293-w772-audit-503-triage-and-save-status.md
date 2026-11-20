# W7.72 — 503 nad permisijama: imenuj uzrok u logu, ne prijavljuj sačuvano kao neuspjelo

**Paket:** interventni fiks po nalogu korisnika (nije BA nalaz; redoslijed Val 7 nepomijenjen)<br>
**Kodni commit:** `4bef5e7` · **CI:** [44749609423](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44749609423)<br>
**DB migracija:** **nema** — nema izmjene šeme, ruta ni zavisnosti

## Šta je korisnik vidio

Izmjena permisija nad ulogama `agent` i `admin` (uklanjanje `problem.manage` i `problem.close`) kao lokalni
superadmin: poruka o grešci, ali permisije su **sačuvane**. Drugi, identičan pokušaj je prošao, a spec 30 je
prošao nakon ručnog vraćanja permisija.

## Dijagnoza: 503 nije mogao doći iz samog upisa

`PUT /roles/:roleKey/permissions` nosi `@RequireRoles(superAdmin)`, pa svaki prolazi kroz
`authorizeHttpExecution`. Guard superadmin bypass audit (`recordSuperAdminBypass`) piše **prije** handlera i
čeka commit; ako audit padne, zahtjev se odbija kao `503 AUTHORIZATION_AUDIT_UNAVAILABLE` i **handler se ne
izvršava**. Pošto su permisije u bazi bile izmijenjene, upis je *jeste* izvršen — dakle 503 je došao iz
**narednog** zahtjeva: niza čuvanih `GET`-ova (`GET /roles`, `GET /roles/:roleKey/permissions`) kojima panel
ponovo gradi prikaz poslije snimanja. Panel je tu grešku prikazao kao „snimanje nije uspjelo”, iako je
snimanje uspjelo. Otuda tri popravke.

## 1. Backend: 503 tijelo ostaje neprozirno, log imenuje uzrok

Tijelo odgovora je nepromijenjeno (`AUTHORIZATION_AUDIT_UNAVAILABLE`, fail-closed) — ne otkriva interne
detalje klijentu. Server log sada nosi ono što trijaža traži:

```
authorization_audit_unavailable method=PUT route=/roles/:roleKey/permissions requestId=… cause=PrismaClientKnownRequestError/P2024 dbCode=P2024 message=Timed out fetching a new connection…
```

`describeAuditFailure()` daje `name/code`, `dbCode` iz `meta.code` i skraćen `message` (**≤ 200 znakova**, bez
stack trace-a). `requestId` se čita jednom, prije upisa, pa je isti u logu i u odgovoru. Bez ovoga se pool
timeout, lock konflikt i schema drift u logu vide kao isti, nijemi 503.

## 2. Backend: jedan ograničen retry za prolazne DB greške

Prolazni kvar (pool wait, transaction/lock timeout, serialization/deadlock) pretvarao je **svaki** superadmin
zahtjev u 503, iako pokušaj nekoliko milisekundi kasnije prolazi. `recordBypassWithRetry()` ponavlja upis
**jednom**, poslije 50 ms, i to samo za kodove koji se smiju ponoviti: `40001`, `40P01`, `55P03`, `57014`,
`P2024`, `P2028`, `P2034`.

Ugovor se ne mijenja: audit je jedan `INSERT` u vlastitoj transakciji, pa neuspjeli pokušaj ne ostavlja red i
ponavljanje ne može duplirati zapis; handler i dalje čeka commitani red, a ponovljeni pokušaj se bilježi kao
`authorization_audit_retry` (warning), da operativa i dalje vidi da se kvar dešava. Deterministička greška
(npr. schema drift) se **ne** ponavlja — pada na prvom pokušaju, ista 503 i isti `authorization_audit_unavailable`
red u logu.

## 3. Frontend: sačuvano je sačuvano, osvježavanje je odvojeno stanje

`permissions-panel.tsx` razdvaja dva ishoda koja su do sada dijelila jedan `errorKey`:

| Ishodi | Prikaz |
| --- | --- |
| `PUT` odbijen | `permissions.errorGeneric` + postojeći `requestId` (ništa nije sačuvano) |
| `PUT` prošao, osvježavanje prošlo | success toast `permissions.saved` |
| `PUT` prošao, osvježavanje palo | warning toast `permissions.savedRefreshFailed` + blok `data-testid="permissions-saved-not-refreshed"` sa dugmetom `permissions.refreshAction` |

`reload()` sada vraća `Promise<boolean>` da poziv iz snimanja zna da li je prikaz potvrđen. Kad osvježavanje
padne, `errorKey` se **čisti** (uzrok je pročitan, prikaz je samo zastario) i flag `savedNotRefreshed` nosi
stanje; uspješno osvježavanje flag gasi. Novi ključevi u `bs` i `en`: `permissions.saved`,
`permissions.savedRefreshFailed`, `permissions.refreshAction`.

## Dokazi

- Backend (stub klijent, ciljane putanje `authorization`, `changes`, `audit-log`): **75 suite / 380 testova**;
  `authorize-http-execution.spec.ts` 7/7, uključujući `names the cause … while the 503 body stays opaque`,
  `retries one transient audit failure`, `does not retry a deterministic audit failure`.
- Frontend: `permissions-panel.spec.tsx` 2/2 (sačuvano + pad osvježavanja ⇒ **nema** `errorKey`, ima
  `permissions-saved-not-refreshed`; odbijen `PUT` ⇒ `errorKey`, bez success toasta); cijeli vitest
  **466 fajlova / 1853 testa**; `npm run build`, `format:check`, `bundle:check` zeleni.
- Nema migracije, nema promjene ruta, nema nove zavisnosti.

## Šta ovaj paket ne tvrdi

Ne tvrdi da je audit-sink zdrav u produkciji: log sada imenuje uzrok, a retry pokriva samo prolazne kodove.
Ako se `authorization_audit_unavailable` ponovi, prvi korak trijaže je `cause=` iz loga, a ne nagađanje.
`BA-changes-16` ostaje sljedeći P2 paket; P1 nalaza nema.
