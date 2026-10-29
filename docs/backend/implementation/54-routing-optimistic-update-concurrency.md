# W5.27 — Optimistička konkurentnost izmjene routing pravila

**Finding:** `BA-routing-08`  
**Implementacija:** `5d8f901`, korekcija fixturea `3a88b2b`  
**CI:** `40398241803` — zelen

## Problem

Routing update je prethodno čitao postojeće pravilo i zatim ga bez preconditiona mijenjao. Dva administratora sa istom učitanom verzijom mogla su oba dobiti uspjeh, a kasniji zapis bi neoznačeno prepisao raniji.

## Implementirani ugovor

Update DTO i frontend zahtjev sada obavezno nose strict ISO 8601 token `expectedUpdatedAt`. Backend u istoj transakciji izvršava atomski Prisma `updateMany` nad predikatom `{ id, updatedAt: expectedUpdatedAt }`:

- tačno jedan pogođeni red znači da je verzija osvojena i update se nastavlja;
- nula pogođenih redova znači stale writer;
- stale writer dobija stabilni `ROUTING_RULE_CONFLICT` kao HTTP 409;
- odbijeni pokušaj rollbackuje transakciju i ne kreira ChangeLog;
- authorization, reason, target-validacija, before/after resolution i deterministički diff ostaju u postojećoj transakcijskoj putanji.

Frontend šalje `rule.updatedAt`, mapira stabilni kod i na bosanskom i engleskom jasno traži osvježavanje stranice i ponovni pokušaj.

## Izvršivi dokaz

Paralelni regression test šalje dva updatea sa istim tokenom i potvrđuje jednog pobjednika, jedan HTTP 409 sa `ROUTING_RULE_CONFLICT` te tačno jedan update ChangeLog zapis. In-memory Prisma adapter implementira isti conditional-update ugovor i pomjera `updatedAt`, pa stale token nije moguće ponovo koristiti.

Frontend unit test potvrđuje mapiranje konfliktnog koda. Produkcijski frontend build i oba lint prolaza završili su lokalno bez greške. Lokalno generisanje Prisma klijenta nije bilo moguće zbog mrežne zabrane prema Prisma binary hostu; puni GitHub CI je izvršio generisanje i sve backend testove.

## CI dokaz

CI `40398241803` je potpuno zelen: backend build/lint/svi testovi, PostgreSQL/Redis integration, frontend build/lint/svi testovi, docs guard, container/supply-chain i završni CI gate su prošli. Puni E2E critical flow nije pokrenut jer ovaj paket ima ciljane unit/integration dokaze i ne treba trošiti Gmail SMTP limit.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release radnju.

## Ishod

`BA-routing-08` je zatvoren. Registar prelazi na **629 otvorenih / 63 zatvorena / 692 ukupno**.
