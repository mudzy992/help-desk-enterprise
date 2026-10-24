# Backend Val 3 / W3.5 — atomska privacy redakcija i authenticated transition

## Status

**Završeno.** Implementacija i real-PostgreSQL rollback dokaz su na SHA `89e0480`, a potpuno zeleni CI dokaz je `40136626790`.

Zatvoren je `BA-audit-log-04`: metadata redakcija, hashirani v4 redaction state, deterministički rechain i završni `audit.redacted` authorization događaj sada commitaju ili rollbackuju kao jedna PostgreSQL transakcija.

## Jedinstvena transakcijska granica

`redactAuditForSubject` sada otvara jednu interaktivnu transakciju sa eksplicitnim timeoutom od 120 sekundi i odmah uzima canonical audit advisory lock. Unutar iste transakcije izvršava se:

1. paginirano pronalaženje svih audit redova povezanih sa subjektom;
2. scrub metadata vrijednosti i postavljanje zajedničkog `redactedAt` vremena;
3. računanje broja redigovanih i legacy sealed redova;
4. deterministički v4 rechain po `createdAt, id` redoslijedu;
5. append završnog `audit.redacted` događaja sa ID/hash/version inventarom originalnih redova.

Nijedan metadata update više se ne izvršava izvan transakcije. Globalni advisory lock sprečava paralelni append između redakcije i rechaina. Ponovno uzimanje istog transaction-scoped locka u `appendAuditLog` ostaje unutar iste sesije i ne otvara race prozor.

## Authenticated redaction transition

V4 hash envelope veže `redactedAt`. Legitimna promjena tog stanja zato proizvodi novi hash za pogođeni red i svaki naredni v4 link. Završni `audit.redacted` događaj u istom commitu čuva:

- broj redigovanih redova;
- broj legacy sealed redova;
- originalni ID, hash i hash-version svakog evidentiranog reda;
- indikator trunciranog inventara.

Time redaction nije neautentificirana in-place promjena: verifier vidi novi konzistentni chain, a transition događaj je njegov završni hashirani član.

## Mid-batch rollback dokaz

Real-PostgreSQL integration test kreira dva v4 audit reda sa prepoznatljivom metadata vrijednošću i koristi scrubber koji namjerno baca grešku na drugom redu, nakon što je prvi update već izvršen unutar transakcije.

Nakon greške test direktno potvrđuje:

- oba originalna metadata payload-a su ostala netaknuta;
- oba `redactedAt` polja su ostala `null`;
- nije nastao `audit.redacted` događaj;
- kompletan audit chain i dalje prolazi verifier.

To je izvršni dokaz rollbacka stvarnog mid-batch kvara, ne samo mockovana tvrdnja o pozivu transakcije.

## Verifikacija

CI `40136626790` potpuno je zelen i uključuje backend build/lint/puni Jest, stvarni PostgreSQL anonymization i rollback suite, ostale PostgreSQL/Redis integration testove, frontend, docs guard, container/supply-chain i završni CI gate.

## Granice paketa

W3.5 ne rješava memorijski neograničen export/verify, globalni append lock throughput niti producer OU provenance. Ti nalazi ostaju otvoreni kao zasebni paketi.

## Sljedeće

Sljedeći paket je **W3.6 — bounded streaming audit export i incremental verify: ukloniti full-chain/full-scope učitavanje u memoriju, uvesti stabilnu keyset paginaciju i izvršne memory/limit dokaze; zatvoriti `BA-audit-log-05`**.
