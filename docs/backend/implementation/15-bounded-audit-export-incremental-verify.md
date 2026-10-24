# Backend Val 3 / W3.6 — bounded streaming export i incremental verify

## Status

**Završeno.** Osnovna implementacija je na SHA `f230561`, stream/query type korekcije na `3dae5be` i `9a3c41e`, centralni page bound na `cdfa03d`, uklanjanje preostalih neograničenih snapshot/head readova na `b81ecc2`, a zaključavajući cap test na `403fbf9`. Potpuno zeleni CI dokaz je `40140062168`.

Zatvoren je `BA-audit-log-05`: korisnički export više ne materijalizuje cijeli scope ni rezultat u memoriji, chain verify radi inkrementalno, support-bundle snapshot ima tvrdi limit, a anchor publisher čita samo jedan head red.

## Stabilna keyset paginacija

Repository uvodi asc keyset stranice po jedinstvenom redoslijedu `(createdAt, id)`. Naredna stranica koristi striktni uslov:

- `createdAt > previous.createdAt`; ili
- isti `createdAt` i `id > previous.id`.

Export i verifier koriste centralni hard page bound od 500 redova. Nema offset skeniranja niti full-scope `findMany` poziva na tim putanjama.

## Streaming export

`GET /audit-logs/export` sada vraća Node `Readable` kroz `StreamableFile`. JSON se emituje kao `[` + canonical redovi + `]`, a CSV kao header i po jedan pravilno escaped canonical red. U memoriji je istovremeno najviše jedna DB stranica i trenutni string chunk; kompletan fajl se više ne gradi kao jedan string/Buffer.

Audit događaj exporta nastaje u generator `finally` grani i bilježi format, broj stvarno emitovanih redova i `completed` stanje. Time i prekinut klijentski download ostavlja eksplicitan audit trag umjesto lažne tvrdnje o kompletnom exportu.

## Incremental verify

Verifier čita po 500 redova, provjerava svaki page uz prethodni hash/checkpoint kao početno stanje i prenosi samo posljednji `(createdAt, id, hash)` u naredni korak. Rezultat agregira checked/redacted/sealed brojeve i prevodi lokalni mismatch index u globalni chain index.

Izvršni test gradi 1.201-redni chain, potvrđuje puni verification i dokazuje da nijedan poziv readera nije dobio niti vratio više od 100 redova u testnom hard boundu. Drugi test mijenja red 175 i potvrđuje globalni mismatch index uz stranice od 50.

## Ostale memory granice

- support-bundle audit snapshot ostaje string zbog ZIP builder ugovora, ali je tvrdo ograničen na posljednjih 5.000 redova;
- poseban repository test zaključava `take: 5000` ugovor;
- remote/WORM anchor publisher više ne učitava chain nego radi jedan `findFirst` za chain head.

Time u audit modulu više nema produkcijskog periodičnog ili request puta koji bez limita učitava kompletan chain radi exporta, verifikacije, support snapshot-a ili anchora.

## Verifikacija

CI `40140062168` potpuno je zelen: backend build/lint/puni Jest, PostgreSQL/Redis integration, container/supply-chain, frontend, docs guard i završni gate. Raniji runovi `40138059883`, `40138432238` i `40139713757` nisu završni dokaz; tokom stabilizacije otkrili su stream typing, query typing i nestabilne pune-suite rerunove, a finalni SHA prolazi kompletan gate.

## Sljedeće

Sljedeći paket je **W3.7 — partitioned audit append concurrency: ukloniti jedan deployment-wide advisory-lock bottleneck uz očuvanje determinističkog chain/anchor ugovora i dokazati paralelni throughput bez forkova; zatvoriti `BA-audit-log-06`**.
