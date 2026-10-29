# Backend Val 3 / W3.10 — bounded audit query identifikatori i cursor envelope

## Status

**Završeno.** Implementacija je na SHA `65fa04b`, a potpuno zeleni CI dokaz je `40189888596`.

Zatvoren je `BA-audit-log-10`: audit OU/user identifikatori i cursori više nisu neograničeni proizvoljni stringovi, a repository više ne dobija raw klijentski cursor.

## Bounded opaque identifikatori

Audit transport ugovor koristi zajedničke granice:

- najviše 128 znakova;
- prvi znak mora biti alfanumerički;
- ostatak prihvata samo alfanumeričke znakove, `_` i `-`.

Pravilo se primjenjuje na OU scope u list/export rutama te na security-journal `userId`. Security action filter dodatno mora biti bounded kanonski `auth.*` oblik. Malformed i oversized vrijednosti padaju u `ValidationPipe` prije service/repository poziva.

## Versionirani cursor envelope

Javni cursor je canonical base64url envelope:

```json
{"v":1,"id":"<opaque-audit-id>"}
```

Decoder provjerava:

- maksimalno 256 znakova;
- base64url alfabet bez paddinga;
- canonical round-trip reprezentaciju;
- JSON objekt sa tačno `v` i `id` poljima;
- podržanu verziju `1`;
- isti bounded opaque-ID ugovor za interni audit ID;
- ograničenu decoded veličinu.

Raw row ID, nepoznata verzija, dodatna polja, nekanonski encoding, nedozvoljeni ID znakovi i oversized cursor završavaju stabilnim `AUDIT_INVALID_CURSOR` 400 ugovorom.

## Granica prije repositoryja

OU-scoped audit lista i globalni security journal dekodiraju envelope na početku service metode. Tek validirani interni ID ulazi u Prisma `cursor: { id }`; nepostojeći ali sintaksno validan ID ostaje kontrolisan ORM page cursor slučaj, dok malformed input nikada ne stiže do repositoryja.

Repository vraća interni next ID, a service ga prije HTTP odgovora ponovo pakuje u v1 envelope. Klijent zato više ne zavisi od trenutnog DB ID formata i buduća cursor verzija može promijeniti payload bez lomljenja repository ugovora.

## Test dokaz

Testovi zaključavaju:

- validan UUID/opaque-ID round-trip;
- odbijanje raw ID-a, v2 cursora, dodatnih JSON polja, nedozvoljenog ID-a i 257-znakovnog inputa;
- null first-page semantiku;
- DTO odbijanje malformed/oversized OU-a i cursora;
- service odbijanje malformed cursora prije repository poziva;
- encoding `nextCursor` izlaza.

CI `40189888596` potpuno je zelen: backend build/lint/puni Jest, PostgreSQL/Redis integracije, container/supply-chain, frontend, docs i završni gate.

## Migracija

**Ovaj paket nema novu baznu migraciju i ne zahtijeva ručno pokretanje release migratora.**

## Sljedeće

Sljedeći paket je **W3.11 — zatvoreni typed action/entity/schema compatibility ugovor i kontrolisani extension namespace; zatvoriti `BA-audit-log-11`**.
