# W6.22 — BA-notifications-05: publish samo persistirane batch pobjednike

**Status:** zatvoren za ovaj nalaz; Val 6 ostaje otvoren<br>
**Audit nalaz:** `BA-notifications-05` (P2), [audit 17 — notifications](../audits/17-notifications.md#23-statusna-dopuna--ba-notifications-05-closeout-2026-11-06)<br>
**Branch:** `arena/864951a6-help-desk-enterprise`<br>
**Implementacijski/testani SHA:** [`ee9cc20f06204e3f149ab3a9b833d7bd968d7153`](https://github.com/mudzy992/help-desk-enterprise/commit/ee9cc20f06204e3f149ab3a9b833d7bd968d7153)<br>
**Automatski CI:** [`42168601336`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42168601336) — success

## Problem i acceptance

`insertNotificationBatch` je radio pre-read, a zatim `createMany({ skipDuplicates: true })`. Kod konkurentnih workers oba poziva mogu prije inserta vidjeti da notification red ne postoji. Baza jedinstvenim constraintom persistira samo pobjednički insert, ali stara putanja je mogla vratiti lokalno napravljene candidate zapise i emitovati phantom ID-jeve/dupli downstream event i za poziv čiji red nije upisan.

Acceptance za `BA-notifications-05`: svi downstream publish/sink pozivi i vraćeni rezultati predstavljaju samo stvarne, persistirane pobjedničke redove; obični replay ostaje idempotentan.

## Implementacija

- Pre-read je zadržan kao optimizacija za već poznate replaye, ali se ne koristi kao izvor istine za rezultat insert operacije.
- Insert koristi `createManyAndReturn({ data, skipDuplicates: true })`; upravo redovi koje baza vrati iz te operacije određuju rezultat i kandidate za downstream fan-out.
- Gubitnički poziv u raceu vraća prazan skup, pa sinkovi ne emituju njegov lokalni candidate niti phantom notification ID.
- In-memory notification delegate sada implementira `createManyAndReturn`; postojeći `createMany` i dalje vraća `{ count }` ugovor.
- Nije uvedena schema promjena ni migracija.

## Regresioni dokazi

Unit testovi pokrivaju vraćene insertovane pobjednike, postojeći replay filter, sinkove samo za pobjedničke redove i prazan recipients skup.

Real PostgreSQL integration test sinhronizuje dva poziva tako da oba završe prazan pre-read prije pokušaja inserta, a zatim ih pušta u konkurenciju. Poredi vraćene redove i emitted sink notification ID-jeve sa stvarno persistiranim redovima; potvrđuje da downstream vidi samo pobjednike, bez phantom ID-ja i duplog eventa.

## CI i granice dokaza

Automatski CI [`42168601336`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42168601336) na SHA `ee9cc20f06204e3f149ab3a9b833d7bd968d7153` je **success**: backend build/lint/full Jest, real PostgreSQL/Redis integration (uključujući race test), frontend build/test, Docs guard, container/supply-chain i CI gate.

E2E critical flows, install wizard i read-only inventory su `skipped`, ne passed. Perf nije pokrenut jer notification paths nisu obuhvaćeni push path filterom. Nisu ručno dispatchani dodatni E2E/Perf runovi. Nije korištena target baza niti pokretana migracija; nema PR-a, mergea ili deploymenta.

## Statusni opseg nakon closeouta

Zatvoren je samo `BA-notifications-05`; notifications je sada **5/15** zatvorenih, a `BA-notifications-06`–`15` ostaju otvoreni. Val 6 je **24/109** zatvorenih i **85 otvorenih** (18 P1 / 47 P2 / 20 P3) i nije završen. Source audit/generisani plan su **537 otvoren / 155 zatvoren**; redovi globalnog registra su **547 otvoren / 145 zatvoren**. Deset poznatih statusnih razlika ostaje netaknuto. `BA-status-page-01`–`19` ostaju 19/19.

Baseline audit score **5,05/10** i odvojeni `BA-15` full critical-flow acceptance ostaju nepromijenjeni/pending. Ovaj bounded closeout nije Val 6 completion niti BA-15 sign-off.
