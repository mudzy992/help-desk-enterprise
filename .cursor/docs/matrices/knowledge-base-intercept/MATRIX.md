# MATRIX — knowledge-base-intercept

## Cilj
Prije kreiranja tiketa vratiti rangirane KB prijedloge za odabrani servis. Ticket create ostaje moguć; intercept ne blokira HTTP create.

## Endpoint
`POST /knowledge-base/intercept` `{ serviceId, query? }` → `{ articles: [...] }`.

Prazan rezultat: `articles: []` (nema greške). `private.addons.kbIntercept=false` → prazna lista.

## Kandidati
Samo `status=PUBLISHED` i `serviceId` match. Draft/in-review/archived nisu u intercept-u.

## Authorization
Isti `canReadKnowledgeArticle` filter kao CRUD. INTERNAL published: authenticated. CONFIDENTIAL: AGENT/ADMIN u OU+service scope. RESTRICTED: ADMIN u scope. Service relevance nikad ne curi članak van classification/scope pravila.

## Ranking
Centralno `rankKnowledgeArticles` (jedan implementation). Detalji: `knowledge-base-feedback-ranking`.

## UX
Frontend ticket create mora pozvati intercept prije submit-a. “Pomoglo” je feedback; korisnik može odustati od create-a. Backend `POST /tickets` se ne mijenja i ne zabranjuje create.

## Namjerno NIJE
Blokiranje ticket create-a, semantic search, full ticket workspace.
