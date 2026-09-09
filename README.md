# EP-HelpDesk — Cursor Workspace Starter

## Šta je ovo
Priprema za razvoj EP-HelpDesk sistema u Cursor-u, dizajnirana da minimizira potrošnju tokena/kredita tako što agent NIKAD ne mora čitati cijeli originalni SRS odjednom.

## Struktura
```
.cursor/rules/
  00-core.mdc        ← always-apply, kratko (~150 riječi), globalna disciplina
  backend.mdc         ← auto-attach samo kad se diraju src/modules/**
  database.mdc         ← auto-attach samo za prisma/**
  frontend.mdc         ← auto-attach samo za frontend/**
  websocket.mdc         ← auto-attach samo za websocket/gateway fajlove
  security.mdc          ← auto-attach samo za guards/auth
docs/
  00-mvp-scope.md      ← ŠTA se radi sada, šta NE (najvažniji fajl)
  01-domain-model.md    ← sažetak data modela (referenca na punu Prisma šemu)
  02-routing-logic.md    ← kritična routing logika, izdvojena
  03-edge-extension.md    ← Faza 2, van MVP-a
TASKS.md               ← fazna checklist, agent radi samo trenutnu stavku
README.md (ovaj fajl)
```

## Kako raditi (da potrošite minimum)

1. **Prekopirajte ovaj folder kao root vašeg Cursor projekta** (ili ga zalijepite preko postojećeg repo-a).
2. **Faza 0 ne radite agentom** — scaffold (npx nest new, prisma init, kopiranje šeme) uradite ručno ili jednim kratkim, direktnim promptom. Agent je skup za mehanički rad koji vi brže uradite CLI komandama.
3. Za svaku sljedeću stavku iz `TASKS.md`:
   - Otvorite **NOVI chat/agent session** (ne nastavljajte stari beskonačno — stari razgovor nosi sav prethodni kontekst i poskupljuje svaki sljedeći zahtjev).
   - Prvi prompt: `"Radimo TASKS.md stavku: <naziv>. Pročitaj relevantan docs/ fajl ako je naveden, pa predloži kratak plan prije pisanja koda."`
   - Pregledajte plan, potvrdite, tek onda "Go".
   - Kad agent završi, VI ručno označite `[x]` u TASKS.md i commitujete (git commit) — ne tražite od agenta da to radi, to je besplatno i vaše.
4. **Model izbor u Cursoru:**
   - **Auto mode** (uključen u Pro, ne troši kredite) → za scaffold, DTO-ove, ponavljajući CRUD, sitne izmjene.
   - **Ručno biran frontier model** (troši $20 kredita iz Pro plana) → SAMO za: TicketRoutingService, AuthGuard/OUAccessGuard, WebSocket gateway, bilo šta gdje greška boli.
5. Nikad ne tražite "napravi cijeli sistem" u jednom promptu — pratite TASKS.md fazu po fazu. Cursor rules eksplicitno zabranjuju agentu da "preskoči" ili radi "brzo i prljavo" (vidi 00-core.mdc), ali disciplina oko obima zadataka je na vama kroz TASKS.md.
6. Kad MVP (Faze 0–5) bude gotov i testiran, tek onda otvarate Fazu 6 (Edge ekstenzija, WebSocket real-time, auto-assignment) — po mogućnosti u novom razgovoru s pročitanim `docs/03-edge-extension.md`.

## Budžetska napomena
Cursor Pro ($20/mj) uključuje neograničen Auto mode i Tab completion, plus $20 vrijednosti frontier-model korištenja. Realno, za projekat ove veličine (enterprise CRUD + routing + WS + auth), jedan mjesec Pro-a je ostvariv cilj AKO se strogo drži gornjeg workflow-a (Auto mode za rutinu, frontier model štedljivo, uvijek fazno, nikad "sve odjednom"). Ako u prve dvije sedmice budete dosljedno blizu limita, razmislite o Pro+ za taj mjesec — ali prvo probajte disciplinu, ne plan.
