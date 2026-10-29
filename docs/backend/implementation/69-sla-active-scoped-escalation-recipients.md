# W5.42 — Active and scope-eligible SLA escalation recipients

**Finding:** `BA-sla-12`  
**Implementacija:** `7fced76`, `bf956b2`, `5499a2c`  
**CI:** `40584535451` — zelen

## Problem

SLA escalation fan-out je vraćao konfigurisanog usera bez provjere statusa, sve role assignmente bez OU/service scope provjere i sve članove grupe bez active/anonymized provjere. On-call rezultat nije morao biti aktivan član ciljane grupe. Prazna ili obrisana publika mogla je ostati bez primaoca i bez operativnog signala nakon što je escalation ključ već označen kao aktiviran.

## Implementacija

Recipient resolver sada prvo gradi ticket scope iz origin OU putanje i servisa, a zatim primjenjuje fail-closed pravila:

- **explicit user:** korisnik mora biti aktivan, neanonimizovan i podoban kroz vlastiti OU podstablo ili barem jedan OU/service-applicable role assignment;
- **role target:** assignment mora pripadati traženoj roli, korisnik mora biti aktivan i neanonimizovan, service scope mora biti globalan ili jednak ticket servisu, a OU scope globalan ili predak ticket origin OU-a;
- **group target:** grupa mora pripadati ticket OU podstablu, membership red mora trenutno postojati, a član mora biti aktivan i neanonimizovan;
- **on-call target:** izabrani user prolazi istu group-membership, active/anonymized i OU-scope provjeru; nepodoban ili odsutan on-call rezultat pada na aktivne podobne članove grupe;
- duplikati se uklanjaju prije fan-outa.

Ako konfigurirana publika postane prazna, resolver pokušava aktivnog i scope-eligible zaduženog korisnika i članove zadužene grupe. Ako ni fallback nema primaoca, zapisuje kanonski audit/alarm događaj `sla.escalation.audience_empty` sa rule ID-em, razlogom, service ID-em i origin OU ID-em. Događaj je uveden u backend action/schema/compatibility registre i oba frontend audit prevoda. On-call notified audit više se ne guta best-effort putem.

## Dokaz

- Unit testovi potvrđuju aktivne group/user/role i on-call puteve, odbacivanje inactive explicit targeta, handler fallback i OU-scoped role filtriranje.
- Stvarni PostgreSQL integration test kreira parent/child i sibling OU, aktivnog i neaktivnog člana, scoped role assignmente i potvrđuje da se šalje samo aktivnom primaocu iz dozvoljenog podstabla.
- Isti real-DB test potvrđuje prazan configured/fallback audience i trajni `sla.escalation.audience_empty` audit zapis.
- CI `40584535451` je potpuno zelen: backend build/lint/test, realni PostgreSQL/Redis suite, svih 94 migracije, frontend audit-i18n pokrivenost, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

SLA eskalacija više ne smatra deaktiviran, anonimizovan, izvan-scope ili stale-membership identitet validnim primaocem. Prazna publika dobija sigurni handler fallback ili trajni audit alarm. `BA-sla-12` je zatvoren; registar prelazi na **614 otvorenih / 78 zatvorenih / 692 ukupno**.
