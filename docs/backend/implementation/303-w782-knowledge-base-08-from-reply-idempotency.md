# W7.82 — `BA-knowledge-base-08`: nacrt iz odgovora je jedna idempotentna transakcija

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „From-reply article/event/audit nije idempotentan ni atomaran”<br>
**Kod:** `portal/knowledge-from-reply-lock.ts` (novo), `portal/knowledge-portal.service.ts` (`createFromReply`
prepisan), `create-in-memory-knowledge-article-delegate.ts` (filter po izvoru), `portal/knowledge-portal.from-reply.spec.ts`
(5 → **8** testova), `knowledge-from-reply-atomicity.integration.spec.ts` (novo), `scripts/run-isolated-integration.mjs`
(shard), frontend `article-from-reply-sheet.tsx`, `services/knowledge-portal-api.ts`, `i18n/locales/{bs,en}/common.json`<br>
**DB migracija:** nema<br>
**CI:** [`44945610188`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44945610188)

## Nalaz

„Napravi članak iz odgovora” je pisao **tri** zapisa u **tri** koraka:

1. `createKnowledgeArticle` — članak + change log, u sopstvenoj transakciji;
2. `insertSystemTicketEvent` — `SYSTEM_EVENT` na tiketu (staff-only trag), poslije nje;
3. `recordAuditEntry` — `knowledge.article.drafted_from_reply`, još poslije.

Dvije posljedice, obje stvarne:

- **Neatomarnost.** Ako korak 2 ili 3 padne (tiket zaključan, audit nedostupan, prekinuta konekcija), članak
  **ostaje** u bazi, a tiket nema trag i audit nema zapis. Nacrt postoji, ali se ne zna odakle je došao — a to
  je upravo ono što audit i trag na tiketu treba da dokažu.
- **Nema idempotencije.** `KnowledgeArticle` **nema** unique ključ nad `(sourceTicketId, sourceMessageId)`, pa
  retry (mrežni retry, dvoklik, ponovljen zahtjev) nije imao po čemu da prepozna prethodni pokušaj — pravio je
  **drugi** nacrt istog odgovora. Duplikati se zatim vide u listama, portalu i pretrazi, a svaki ima svoj
  change log i svoj audit.

## Rješenje

**Jedna transakcija pod bravom vezanom na izvorni odgovor.**

- `withKnowledgeFromReplyLock(transaction, ticketId, messageId, operation)` uzima **transakcijski advisory
  lock** kroz postojeći `DatabaseLockService` (`pg_advisory_xact_lock`), sa identitetom
  `knowledge-base.from-reply` + `<ticketId>:<messageId>`. Dva pisca **istog** odgovora se serijalizuju; ostali
  odgovori nisu blokirani. Brava je vezana na transakciju, pa se pušta na commit, na rollback i na prekinutu
  konekciju — nema „zaglavljenog” ključa.
- `findKnowledgeDraftFromReply(client, ticketId, messageId)` traži nacrt **poslije** brave. Pošto PostgreSQL u
  READ COMMITTED uzima novi snapshot po naredbi, drugi pisac poslije brave **vidi** ono što je prvi commitovao.
- `createFromReply` sada radi `$transaction(lock → postojeći? → članak + change log → trag na tiketu → audit)`.
  Sve četiri stavke su u **istoj** transakciji: pad bilo gdje poslije inserta odnosi i članak, pa retry kreće od
  nule umjesto da ostavi siroče.
- **Idempotentan odgovor.** Ako nacrt za taj odgovor već postoji, vraća se **taj** nacrt uz
  `alreadyCreated: true` (aditivno, opciono polje — ugovor se ne lomi). Trag na tiketu je sada **upsert** ključan
  na izvornu poruku (`knowledge-draft-created:<messageId>`), pa ni ponovni poziv ne može duplirati `SYSTEM_EVENT`;
  audit se u tom slučaju **ne** ponavlja (već je zapisan u transakciji koja je nacrt napravila).
- **Slug retry.** Pošto se slug alocira **unutar** transakcije, izgubljena slug trka više ne može izaći kao sirov
  unique konflikt: `SLUG_TAKEN` restartuje **cijelu** transakciju sa sljedećim slobodnim sufiksom
  (`slugAllocationAttempts`, 3 pokušaja) — isti ishod kao raniji unutrašnji retry, sada bez polovičnog stanja.
- **Portal** više ne tvrdi da je članak kreiran kad nije: `alreadyCreated` daje informativni toast
  „Nacrt za ovaj odgovor već postoji; nije napravljen novi.” (bs/en), a API tip je proširen istim opcionim poljem.

### Zašto brava, a ne unique indeks

Ispravno rješenje je unique indeks nad `(sourceTicketId, sourceMessageId)` (ili idempotency tabela). To je
**migracija**, a migracija bez izričitog odobrenja nije dozvoljena. Advisory brava daje isto **ponašanje za
pisce koji prolaze kroz ovaj kod** i pritom je vezana na transakciju (nema cleanup-a). Ostaje razlika koju treba
zatvoriti migracijom: pisac koji **ne** uzme bravu (ručni SQL, budući importer, druga aplikacija) i dalje može
napraviti duplikat — zato je preporuka za indeks dokumentovana kao sljedeći korak, ne kao „riješeno”.

### Cijena

- Jedan `set_config('lock_timeout')` + jedan `pg_advisory_xact_lock` po kreiranju nacrta (dva `$queryRaw`).
- Jedno `SELECT ... WHERE sourceTicketId = $1 AND sourceMessageId = $2 LIMIT 1` po kreiranju. Kolone **nemaju**
  indeks (i to bi bila migracija), pa je to pregled tabele po pozivu; akcija je agentska i rijetka (jedan
  nacrt po odgovoru), pa je prihvatljivo — indeks je naveden kao follow-up.
- Sve ostalo je nepromijenjeno: nema novih poziva prema tiketu ni auditu.

## Direktni testni dokaz

**Unit (`knowledge-portal.from-reply.spec.ts`, 5 → 8 testova):**

- **drugi submit istog odgovora** vraća **postojeći** nacrt (`alreadyCreated: true`, isti `id`, `DRAFT`), u
  bazi je **jedan** članak, na tiketu **jedan** `SYSTEM_EVENT`, a audit ima **tačno jedan** zapis
  (`knowledge.article.drafted_from_reply`) — bez ponavljanja;
- **trag na tiketu i audit se pišu unutar transakcije** koja nosi i članak (spy nad `$transaction`, `upsert` i
  `auditLog.create`) — nijedan od tri zapisa ne ostaje izvan nje;
- **brava je vezana na izvorni odgovor**, ne na modul: `$queryRaw` dobija identitet
  `knowledge-base.from-reply:ticket-1:msg-1`.

**PostgreSQL integracija (`knowledge-from-reply-atomicity.integration.spec.ts`, 2 testa, novi CI shard):**

- **dva pisca istog odgovora → tačno jedan nacrt**: jedan kreira, drugi poslije brave nađe isti `id`; u bazi je
  jedan red za izvornu poruku;
- **pad poslije inserta odnosi članak**: transakcija koja baci grešku poslije `knowledgeArticle.create` ne
  ostavlja red (`count = 0`), a retry zatim napravi **tačno jedan** nacrt.

**Ostalo:** runner guard `node --test scripts/run-isolated-integration.test.mjs` **23/23** (guard traži da svaki
`knowledge-base` integration spec bude u listi, pa novi shard ne može biti „tiho preskočen”); backend moduli
`knowledge-base`+`users`+`reports`+`teams` **81 suite / 465 testa** (2 integracione suite preskočene lokalno),
`knowledge-base/portal` **3 suite / 21 test**; frontend `tsc -b` čist, `eslint` čist na diranim fajlovima,
`vitest src/i18n` **48/48**, `vitest src/components/knowledge-base` **1/1**, `prettier --check` čist.

## CI i testni dokaz

CI run [`44945610188`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44945610188) na `cc54913` je
**success**:

- **Backend build + test** — uspješno (validate/generate/wiring/build/lint/puni `npm test`).
- **Backend PostgreSQL + Redis integration** — uspješno, uključujući korak „Run real PostgreSQL integration
  suites”, gdje je novi `knowledge-from-reply-atomicity` shard izvršen.
- **Frontend build + test** — uspješno (`tsc -b`, `vite build`, vitest, format provjere).
- **Backend container + supply chain**, **Docs guard**, **CI gate** — uspješno; `Perf smoke`
  ([`44945610175`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44945610175)) takođe **success**.
- **Skipped (po konfiguraciji):** `Read-only service-form pattern inventory`, `E2E critical flows`,
  `E2E install wizard` — puni E2E pokreće korisnik.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-08` (P2). Modul je time **9/19** (`01`–`08`, `11`).
- Ostaju otvoreni u `25-knowledge-base.md`: 10 nalaza, **P1: nema** (`09`, `10`, `12`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 300 zatvoreno / 396 otvoreno**; Val 7 **79/111**, otvoreno
  **32** (P1 0 / P2 18 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Rollback: revert `cc54913` vraća neatomarni, neidempotentni tok; nema
podataka za vraćanje (event i audit su samo zapisi).

**Preostali rizik (dokumentovan):**

1. **Nema unique indeksa** nad `(sourceTicketId, sourceMessageId)` — brava pokriva samo pisce koji idu kroz
   `createFromReply`. Preporuka: migracija sa unique indeksom (uz `WHERE "sourceMessageId" IS NOT NULL`) i
   parcijalnim indeksom za lookup; time bi baza sama čuvala invarijantu.
2. **Lookup je pregled tabele** (kolone bez indeksa) na rijetkoj agentskoj akciji; isti indeks iz tačke 1 ga
   rješava.
3. **Idempotentan ponovni poziv vraća postojeći nacrt** i kad klijent pošalje izmijenjen tekst — takva je
   semantika „jedan odgovor, jedan nacrt”; izmjena se radi kroz običan edit članka (koji ima revision token).

## Sljedeći paket

**W7.83 — `BA-knowledge-base-09` (P2): placement/category mutation nije atomska sa auditom/change-logom.**
