# Inventar i redoslijed backend modula

**Status:** aktuelno  
**Datum snapshot-a:** 2026-10-22  
**Izvor:** `backend/src/modules` i `docs/backend/backend-module-inventory.json`

## 1. Sažetak

Inventar je generisan direktno iz aktuelnog checkouta i sadrži **43 Nest modula**, **2.200 produkcijskih TypeScript fajlova**, **618 spec fajlova**, približno **179.628 produkcijskih linija**, **98 kontrolera** i **200 servisa**. Brojevi su navigacijski pokazatelji, ne mjera kvaliteta niti stvarna coverage metrika.

Audit ide po zavisnostima i riziku, ne abecedno. Svaki red je zasebna audit jedinica i dobija zaseban izvještaj. Nakon 43 modula slijede cross-cutting infrastruktura i konsolidovani master plan implementacije.

## 2. Redoslijed

### Val A — identitet, pristup i audit

|   # | Modul                    | Rizik    | Prod. fajlovi | Spec fajlovi |   LOC | Kontroleri | Servisi | Status        |
| --: | ------------------------ | -------- | ------------: | -----------: | ----: | ---------: | ------: | ------------- |
|  01 | `authentication`         | kritičan |            80 |           40 | 7.206 |          2 |       9 | audit završen |
|  02 | `authorization`          | kritičan |            46 |           25 | 2.722 |          1 |       2 | audit završen |
|  03 | `rbac`                   | kritičan |            18 |            5 |   995 |          1 |       1 | audit završen |
|  04 | `users`                  | visok    |            32 |           22 | 2.704 |          4 |       1 | audit završen |
|  05 | `organizational-units`   | visok    |            43 |           11 | 1.987 |          1 |       1 | audit završen |
|  06 | `groups`                 | visok    |            27 |            6 | 1.282 |          2 |       1 | audit završen |
|  07 | `settings`               | kritičan |           103 |           28 | 9.375 |          2 |       1 | audit završen |
|  08 | `audit-log`              | visok    |            21 |            7 | 1.625 |          1 |       1 | sljedeće      |
|  09 | `security`               | kritičan |             9 |            6 |   999 |          5 |       3 | nije započeto |
|  10 | `security-audit-webhook` | visok    |            11 |            2 |   665 |          0 |       2 | nije započeto |
|  11 | `privacy`                | kritičan |            44 |           16 | 6.635 |          3 |      11 | nije započeto |

### Val B — jezgra tiketa i izvršenje

|   # | Modul               | Rizik    | Prod. fajlovi | Spec fajlovi |    LOC | Kontroleri | Servisi | Status        |
| --: | ------------------- | -------- | ------------: | -----------: | -----: | ---------: | ------: | ------------- |
|  12 | `tickets`           | kritičan |           470 |          107 | 31.986 |         19 |      29 | nije započeto |
|  13 | `routing`           | kritičan |            32 |            8 |  2.414 |          1 |       1 | nije započeto |
|  14 | `sla`               | kritičan |           120 |           28 |  7.623 |          6 |       9 | nije započeto |
|  15 | `service-catalog`   | visok    |           124 |           23 |  6.365 |          4 |       3 | nije započeto |
|  16 | `templates`         | visok    |            24 |            6 |  3.103 |          3 |       3 | nije započeto |
|  17 | `notifications`     | kritičan |            87 |           41 |  9.778 |          3 |       8 | nije započeto |
|  18 | `websocket`         | visok    |            28 |           16 |  1.707 |          0 |       2 | nije započeto |
|  19 | `integration-queue` | kritičan |            30 |           10 |  1.606 |          1 |       8 | nije započeto |
|  20 | `inbound-email`     | kritičan |            24 |            2 |  1.694 |          1 |       3 | nije započeto |
|  21 | `on-call`           | visok    |            18 |            3 |  2.101 |          1 |       3 | nije započeto |

### Val C — poslovni domeni

|   # | Modul            | Rizik   | Prod. fajlovi | Spec fajlovi |    LOC | Kontroleri | Servisi | Status        |
| --: | ---------------- | ------- | ------------: | -----------: | -----: | ---------: | ------: | ------------- |
|  22 | `assets`         | visok   |            44 |           13 |  9.053 |          2 |      13 | nije započeto |
|  23 | `problems`       | visok   |            22 |            8 |  3.372 |          1 |       7 | nije započeto |
|  24 | `changes`        | visok   |            23 |            4 |  3.506 |          1 |       7 | nije započeto |
|  25 | `knowledge-base` | visok   |            73 |           12 |  6.152 |          3 |       7 | nije započeto |
|  26 | `reports`        | visok   |            86 |           27 | 10.082 |          3 |       5 | nije započeto |
|  27 | `search`         | srednji |             7 |            2 |    318 |          1 |       1 | nije započeto |
|  28 | `announcements`  | srednji |            16 |            2 |  2.102 |          1 |       3 | nije započeto |
|  29 | `status-page`    | visok   |             9 |            5 |  1.322 |          2 |       2 | nije započeto |

### Val D — konfiguracija, instalacija i integracije

|   # | Modul                | Rizik    | Prod. fajlovi | Spec fajlovi |    LOC | Kontroleri | Servisi | Status        |
| --: | -------------------- | -------- | ------------: | -----------: | -----: | ---------: | ------: | ------------- |
|  30 | `config-versioning`  | kritičan |            51 |            4 |  4.463 |          1 |       2 | nije započeto |
|  31 | `install`            | kritičan |           208 |           54 | 12.982 |          7 |      19 | nije započeto |
|  32 | `setup-checklist`    | srednji  |             6 |            2 |    233 |          1 |       1 | nije započeto |
|  33 | `policy-packs`       | visok    |            32 |           12 |  2.133 |          1 |       1 | nije započeto |
|  34 | `service-onboarding` | visok    |            40 |            7 |  2.555 |          3 |       2 | nije započeto |
|  35 | `directory-sync`     | kritičan |            73 |           21 |  5.287 |          2 |       5 | nije započeto |
|  36 | `teams`              | visok    |            38 |            6 |  4.352 |          2 |      11 | nije započeto |
|  37 | `edge-extension`     | visok    |            15 |            2 |    851 |          1 |       2 | nije započeto |
|  38 | `branding`           | srednji  |             5 |            1 |    207 |          1 |       1 | nije započeto |

### Val E — operativnost i sadržaj

|   # | Modul           | Rizik    | Prod. fajlovi | Spec fajlovi |   LOC | Kontroleri | Servisi | Status        |
| --: | --------------- | -------- | ------------: | -----------: | ----: | ---------: | ------: | ------------- |
|  39 | `health`        | visok    |             3 |            1 |   187 |          1 |       0 | nije započeto |
|  40 | `observability` | visok    |            14 |            5 |   671 |          1 |       1 | nije započeto |
|  41 | `ops-health`    | kritičan |            25 |           12 | 4.164 |          1 |       6 | nije započeto |
|  42 | `docs`          | srednji  |             9 |            4 |   778 |          1 |       2 | nije započeto |
|  43 | `change-log`    | srednji  |            10 |            2 |   286 |          0 |       0 | nije započeto |

## 3. Završne audit jedinice

|   # | Jedinica                     | Obavezni opseg                                                                                                                                        | Status        |
| --: | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
|  44 | Cross-cutting infrastruktura | `src/common/**`, root Nest wiring, `main.ts`, `worker.ts`, CLI, globalni guardovi/interceptori/filteri, Prisma konfiguracija i migracijska disciplina | nije započeto |
|  45 | Konsolidovani backend audit  | deduplikacija nalaza, globalna score tabela, cross-module traceability i jedinstveni fazni implementacijski master plan                               | nije započeto |

## 4. Pravila inventara

- Machine-readable snapshot se regeneriše sa `node scripts/generate-backend-audit-inventory.mjs`.
- Promjena broja modula ili naziva direktorija zahtijeva ažuriranje ovog registra prije nastavka audita.
- `specFiles` je broj `*.spec.ts` fajlova, a ne broj testova niti coverage procenat.
- `productionLoc` isključuje spec fajlove; koristi se samo za procjenu audit površine.
- Rizik označava redoslijed i dubinu provjere, ne unaprijed utvrđenu grešku.
- Zavisnosti iz JSON snapshot-a su statički relativni importi između modula; runtime/event zavisnosti se dopunjavaju tokom pojedinačnog audita.
- Modul se označava završenim tek kada postoje izvještaj, BA nalazi, baseline ocjena, izvršeni ciljani testovi i fazni plan.

## 5. Očekivani završni artefakti

Po završetku svih jedinica postoje:

1. 43 pojedinačna module audit dokumenta;
2. jedan cross-cutting infrastrukturni audit;
3. globalni registar svih `BA-*` nalaza bez duplikata;
4. dependency i migracijska mapa;
5. objedinjena baseline ocjena backenda;
6. fazni implementacijski plan sortiran po P0/P1, zavisnostima i sigurnom rollout redoslijedu;
7. acceptance/test matrica za kasniju implementaciju.
