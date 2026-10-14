# Faza 1 — trajni kriterij zatvaranja (završena 2026-10-14)

## Ishod
§1 plana 6.1 sada traži da se svaka stavka iz audit tabele razriješi prije zatvaranja modula, uz samo dva izuzetka: datirani/obrazloženi **Prihvaćen rizik** ili dokumentovan zaključak istraživanja bez potrebe za kodom.

„Za kasnije“ mora biti eksplicitno **Otvoreno** u auditu ili praćeno u `docs/analysis/TASKS.md`. Backend/cross-module izuzeci ostaju posebno označeni. Auditi modula 04+ moraju imati sekciju **„Kriterij zatvaranja (val 6.1+)“** sa svim ID-jima i konačnim statusima.

## Dokaz
`docs/plans/modules/6.1-frontend-audit-ispravke.md` §1, tabela valova i modula 01–03 status notes.

Commit se ne pravi bez izričitog zahtjeva vlasnika.
