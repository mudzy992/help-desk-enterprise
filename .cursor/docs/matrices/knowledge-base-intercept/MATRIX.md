# MATRIX — knowledge-base-intercept

## Cilj
Prije kreiranja tiketa vratiti rangirane KB prijedloge za odabrani servis. Ticket create ostaje moguć; intercept ne blokira HTTP create.

## Endpoint
`POST /knowledge-base/intercept` `{ serviceId, query? }` → `{ articles: [...] }`.

Prazan rezultat: `articles: []` (nema greške). `private.addons.kbIntercept=false` → prazna lista.

## Resolve (pomoglo bez create)
`POST /knowledge-base/intercept/resolve` `{ serviceId, organizationalUnitId, articleId? }` → `{ id }`.

Svaki uspješan resolve = jedan “helped without create” događaj (`KnowledgeInterceptResolution`). Thumbs feedback ostaje odvojen i **ne** broji se kao resolution.

## KPI
`kbResolutionRate = kbHelpedCount / (kbHelpedCount + ticketsCreated)` u istom report window + OU scope. `null` kad je denominator 0. Target RAW ≥ 30%.

## Kandidati
Samo `status=PUBLISHED` i `serviceId` match. Draft/in-review/archived nisu u intercept-u.

## Authorization
Isti `canReadKnowledgeArticle` filter kao CRUD. INTERNAL published: authenticated. CONFIDENTIAL: AGENT/ADMIN u OU+service scope. RESTRICTED: ADMIN u scope. Service relevance nikad ne curi članak van classification/scope pravila.

## Ranking
Centralno `rankKnowledgeArticles` (jedan implementation). Detalji: `knowledge-base-feedback-ranking`.

## UX
Frontend ticket create mora pozvati intercept prije submit-a. “Pomoglo” (resolve) snima resolution pa korisnik odustaje od create-a. Backend `POST /tickets` se ne mijenja i ne zabranjuje create.

## Namjerno NIJE
Blokiranje ticket create-a, semantic search, full ticket workspace, brojanje thumbs-up-a kao KB resolution.
