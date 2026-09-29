# Teze za dokumentaciju

Stalna lista pojašnjenja koja moraju ući u korisničku i administratorsku dokumentaciju kada je budemo
pisali. Svaka teza ima kratku tvrdnju i link na detalje. Nova pitanja korisnika tipa „nije li to ista
opcija?“ dopisuju se ovdje.

| # | Tema | Teza | Detalji |
|---|---|---|---|
| T1 | Status servisa | **„Zakaži prekid“ ≠ „Incident“.** Zakazani prekid je planiran, s poznatim početkom i krajem, bez toka i bez obavijesti, i ne umanjuje dostupnost. Incident je neplaniran, ima tok (Istražujemo → Riješeno), povezuje tikete, šalje obavijesti i umanjuje dostupnost. Incident s uticajem „Održavanje“ koristi se samo za hitno, nenajavljeno održavanje. | [status-incidenti-i-planirani-prekidi.md](status-incidenti-i-planirani-prekidi.md), dizajn [2.7 §8.5](../plans/modules/2.7-pouzdanost-i-monitoring.md) |
| T2 | Nova verzija aplikacije | Nakon ažuriranja servera, otvoren tab se pri prvom prelasku na stranicu sam osvježi jednom. Ako i to ne uspije, prikaže poruku „Dostupna je nova verzija aplikacije“ s dugmetom za osvježavanje. Podaci se ne gube, jer je sve spremljeno na serveru. | `frontend/src/lib/app/chunk-reload.ts`, `frontend/nginx.conf` |
