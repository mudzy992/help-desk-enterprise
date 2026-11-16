# W7.22 — BA-problems-03: CMDB veze problema iza `asset.read` i asset OU scopea

**Status: implementacija kompletna; čeka automatski CI gate i korisničku vizuelnu provjeru.** Problem manager više ne dobija installation-wide pretragu, prijedloge, vezanje ni prikaz CMDB stavki kroz problem modul. Svaka CMDB površina problema sada traži `asset.read` u opsegu jedinice same stavke; bez toga odgovor je prazan ili `PROBLEM_ASSET_NOT_FOUND`. Nema proširenja prava i nema migracije.

## Triage

BA-problems-03 (P1), audit [23-problems.md](../audits/23-problems.md) §8:

> CMDB feature switch se provjerava, ali `searchAssets`, suggestions, `linkAssets` i get linked assets nikad ne zahtijevaju `asset.read` niti koriste asset OU scope. Problem manager može pretraživati installation-wide asset tag/name/serial, vidjeti tip/OU/status i vezati arbitrary asset po ID-u.

Dodatno iz §8: prijedlozi izvedeni iz tiketa mogu sadržavati tuđe CMDB stavke; reverse asset endpoint filtrira problem scope, ali ne popravlja forward leak.

Obim ovog paketa je **isključivo CMDB granica**. Service i status-page incident pickeri iz istog odjeljka audita pripadaju nalazu **BA-problems-11** („Service/incident linkovi nemaju njihov scope policy“) i ovdje nisu mijenjani — problem-group authority se i dalje ne tretira kao pravo nad svim servisima/incidentima, ali njihov access policy ugovor ostaje predmet tog nalaza. Također nije mijenjan transakcioni obrazac service/incident linkova (drugi dio istog nalaza).

## Implementacija po površini

- **Nova granica** (`problem-asset-access.ts`): `problemAssetAccess(prisma, userId)` učitava aktuelni principal (`loadPrincipalContext`), odbija neaktivnog/nepostojećeg korisnika, gradi viewer sa prefiksom `asset.` (`assetViewerFromContext`), traži tačno `asset.read` (`permissionKeys.assetRead`) i računa opseg preko `resolveAssetScope` + `unitScopeWhere` na `Asset.organizationalUnit.ouPath`. Globalni `problem.*` grant ne postaje globalni CMDB grant jer se grantovi filtriraju po `asset.` prefiksu. Prazan opseg daje nemoguć predikat `{ id: { in: [] } }` umjesto NUL sentinela. Fail-closed na svakoj grani.
- **`assetWhereOf(access)`**: jedinstveni filter (`organizationalUnit` OR put + podputevi) koji sve površine prosljeđuju u Prisma `where`, uvijek prije `take`/agregacije.
- **`get` (kartica „Povezano i tok“)** (`problem-links.service.ts`): `problemAsset.findMany` dobija `asset: { is: assetWhereOf(...) }`, pa se limit 200 primjenjuje na već filtrirane redove i strani asseti ne zauzimaju mjesto.
- **Prijedlozi iz tiketa** (`suggestAssets`): `groupBy` ostaje filtriran ticket vidljivošću (W7.21), a naknadno `asset.findMany` traži presjek sa asset opsegom; strani asseti se izbacuju prije nego uđu u listu i prije `ticketCount`.
- **Picker pretrage** (`searchAssets`): traži `asset.read` opseg prije pretrage; bez opsega vraća `{ items: [] }` i ne izvršava upit. Filter je `AND: [assetWhereOf(...)]` uz postojeći `problems: { none: { problemId } }` i tag/name/serial `OR`.
- **Vezanje** (`linkAssets`): `asset.findMany` je ograničen opsegom; ako se broj pronađenih razlikuje od traženih ID-eva, cijeli zahtjev pada kao `PROBLEM_ASSET_NOT_FOUND` (identično nepostojećem assetu, bez oracle-a). Bez opsega se odbija prije upita.
- **Odvezivanje** (`unlinkAsset`): asset se čita kroz `findFirst` sa opsegom; strani asset daje `PROBLEM_ASSET_NOT_FOUND` i ne dolazi do `deleteMany` ni historijskog događaja.
- **Reverse kartica** (`forAsset`): prazno bez `asset.read` opsega i prazno za asset izvan opsega (provjera `asset.count` prije `reverse`), pa problem scope više nije jedini filter.
- **Historija problema** (`problems.service.ts`): `asset_linked`/`asset_unlinked` više nisu u „uvijek sigurnim“ akcijama; prikazuju se samo ako je referencirani `assetId` čitljiv u opsegu (jedan `asset.findMany ... select id` po stranici, analogno ticket provjeri). Bez `asset.read` nijedan asset događaj se ne prikazuje i upit se preskače. Time tag/name ne cure kroz timeline.

Nema promjene API shape-a, DTO-a, ruta ni frontend ugovora. Kad je pristup odbijen, postojeći ekrani prikazuju praznu listu (kao i asset modul izvan opsega).

## Testni dokaz

- **`problem-asset-access.spec.ts` (novi, 7 testova)**: nedostajući/neaktivni principal, problem manager bez `asset.read`, globalni `problem.*` grant koji ne širi CMDB, super admin i installation-wide ADMIN (sve jedinice), scoped grant (put + podputevi), fallback na home jedinicu, prazan opseg → nemoguć predikat bez NUL sentinela.
- **`problem-links.service.spec.ts` (13 testova, 6 novih)**: linked assets filtrirani opsegom, bez `asset.read` prazna lista uz nemoguć predikat, picker ograničen opsegom i prazan bez opsega, `linkAssets`/`unlinkAsset` odbijaju strani asset bez posljedica, in-scope link prolazi transakcijski, reverse kartica prazna za nečitljiv asset.
- **`problem-events-visibility.spec.ts` (5 testova, 2 nova)**: asset događaji se filtriraju po opsegu, događaji bez `assetId` i bez opsega se izostavljaju, CMDB upit se preskače bez `asset.read`.
- **`problem-asset-scope.integration.spec.ts` (novi, PostgreSQL, registriran u `scripts/run-isolated-integration.mjs`)**: stvarni redovi u dvije jedinice; dokazuje da `asset: { is: ... }` i asset `organizationalUnit` filter stvarno drže strani asset izvan pretrage, vezanja, kartice, odvezivanja i reverse liste, te da in-scope link pravi tačno jedan `asset_linked` događaj. Suite se izvršava u CI PostgreSQL/Redis poslu.
- Lokalno: ciljane mock suite prošle su s `ts-jest diagnostics:false`; puni `tsc` i Prisma generisanje nisu izvedivi lokalno (TLS prema Prisma binaries), pa je mjerodavan CI.

## Lokalna ograničenja

- Lokalni `prisma generate` pada na TLS-u prema `binaries.prisma.sh`, pa `src/generated/prisma/client` ne postoji; 5 problems suiteova koje uvoze generisani klijent ne mogu se pokrenuti lokalno (poznato ograničenje iz ranijih paketa). Mock suiteovi koji ne učitavaju generisani klijent prolaze.
- Integracijska suite je pisana protiv šeme iz `prisma/schema/*`; njeno prvo izvršavanje je u CI PostgreSQL poslu.

## Preostali rizici (dokumentovani, nisu blokada zatvaranja)

- **Service/incident pickeri** ostaju installation-wide do BA-problems-11; ovaj paket ih eksplicitno ne pokriva (vidi Triage).
- **Event historija starijih zapisa**: `asset_linked` događaji bez `assetId` u `detail` (ako postoje iz ranijih verzija) više se ne prikazuju nikome — konzervativno, ali gubi historiju.
- **Performanse**: `get` i historija sada rade po jedan dodatni `asset` upit (i principal učitavanje) po zahtjevu; historija radi jedan upit po stranici od 200 događaja.
- **Postojeći linkovi izvan opsega** se ne brišu; samo se skrivaju. Administrator sa širim opsegom ih i dalje vidi.
- **Frontend** nema posebnu poruku „izvan opsega“; prazna lista je namjerno identična kao u asset modulu (nema oracle-a).
- **`reverse` za incidente** (`forIncident`) ostaje bez incident scope policy — dio BA-problems-11.

## Commitovi i CI

_(popunjava se nakon pusha)_

## Korisnička vizuelna provjera (prije zatvaranja)

Priprema: potreban je korisnik sa `problem.read`/`problem.manage` u problem grupi **bez** `asset.read` (ili sa `asset.read` samo za drugu OU), i drugi sa `asset.read` u OU problema. CMDB addon uključen, problem u statusu koji dozvoljava izmjene.

1. **Administracija → Permisije**: korisniku A (problem manager) ostaviti `problem.*` bez `asset.read`; korisniku B dati `asset.read` u jedinici problema. (Nema dodjele po osobama — samo po ulozi.)
2. Kao **korisnik A**: otvoriti problem → kartica „Povezano i tok“ → polje za pretragu CMDB stavki, ukucati tag stavke iz druge jedinice. Očekivano: **nema rezultata** (prije paketa bi se pojavila).
3. Kao **korisnik A**: ako problem već ima povezanu stavku iz druge jedinice, ona se **ne prikazuje** u kartici ni u historiji; broj povezanih stavki se ne povećava.
4. Kao **korisnik A**: pokušati dodavanje stavke iz druge jedinice preko mrežnog zahtjeva (ID iz druge kartice). Očekivano: `PROBLEM_ASSET_NOT_FOUND` i crveni toast, bez promjene liste i bez novog zapisa u historiji.
5. Kao **korisnik B**: pretraga pronalazi stavke iz svoje jedinice, vezanje radi, historija prikazuje `Povezana CMDB stavka …`, a kartica CMDB stavke prikazuje problem u „Problemi“.
6. **Odvezivanje**: kao korisnik A pokušati odvezati stavku izvan opsega (ako je bila povezana prije paketa) — odbijeno bez brisanja; kao korisnik B odvezivanje radi i bilježi događaj.

Format odgovora: **DA / NE / N/A** po tački, uz napomenu ako je nešto drukčije viđeno.
