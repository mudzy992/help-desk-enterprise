# W7.87 — `BA-knowledge-base-14`: eksplicitna retention/anonymization matrica za bazu znanja

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Privacy/retention ne pokriva slobodni tekst, source, comments, notifications i change-log”<br>
**Kod:** `privacy/retention/knowledge-content-retention.executor.ts` (novo), `privacy/anonymization/knowledge-mentions.ts`
(novo: `knowledgeScrubbableColumns`, `knowledgeMentionTokens`, `knowledgeArticleMentionWhere`,
`collectKnowledgeMentions`), `privacy/anonymization/scrub-knowledge-mentions.ts` (novo: `scrubKnowledgeMentions`),
`privacy/anonymization/anonymization-executor.ts` (preview + execute kroz novi scrubber, novi brojači),
`privacy/privacy.constants.ts` (`knowledgeContent` u `retentionCategories` i
`retentionCategoriesRequiringDryRun`), `privacy/retention/retention-executors.ts` (registracija),
`privacy/retention/retention-plan.ts` (red izvršavanja), `privacy/privacy-configuration.loader.ts` (tri mape),
`privacy/notices/compose-privacy-email.ts` i `privacy/record/processing-record.service.ts` (bs/en oznake),
`settings/setting-keys.ts` + `settings/definitions/privacy-settings.ts`
(`private.privacy.retention.knowledgeContentDays`, default **0**, minimum **180**); testovi: novi
`knowledge-content-retention.executor.spec.ts` (**5**), novi `scrub-knowledge-mentions.spec.ts` (**5**),
`retention.integration.spec.ts` (+**1** DB slučaj, +`knowledgeContent: 0` u `configuration()`),
`anonymization.integration.spec.ts` (KB fixtures + assertions u execute slučaju),
`tickets/attachments/attachments.constants.spec.ts` (11 ključeva); frontend: `services/privacy-api.ts` (union),
`i18n/locales/{bs,en}/common.json` (kategorija, hint, dvije mape postavke, `privacy.counts.*`) i
`i18n/settings-registry-coverage.spec.ts` (520 → **521**)<br>
**DB migracija:** nema<br>
**CI:** [`45034422138`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45034422138) — **success** na `7a902b0` (E2E i inventory poslovi `skipped`, kako je konfigurisano)

## Nalaz

Audit 25 §11 je opisao tačno jednu vezu koju je anonymizacija dirala: `KnowledgeFeedback.userId` i, uz nju, komentar
te osobe. Sve ostalo je ostajalo:

1. **Slobodni tekst članka.** `title` i `body` mogu imenovati bilo koga — osobu koja nije vlasnik, nije pregledalac i
   nije učesnik izvornog tiketa (kolega citiran u uputstvu, menadžer u primjeru, korisnik iz odgovora agenata). Scrub
   je pokrivao feedback komentar, ne i tekst članka. Pošto `knowledge_article_search_vector_refresh` trigger visi na
   `UPDATE OF title, body`, nepromijenjen tekst je ostajao i **pretraživ** — erase je bio nepotpun i kroz `GET /search`.
2. **Komentari drugih ljudi.** Tuđi komentar koji imenuje osobu („Amra Petrović je potvrdila da radi”) nije bio ni
   selektovan, jer je selekcija bila `userId` — dakle samo sopstveni komentari.
3. **Pokazivači na izvor.** `sourceTicketId`/`sourceMessageId` drže vezu na tiket iz kojeg je draft napravljen. Kad je
   tiket erase-ovan, pointer je ostajao kao most prema pseudonimiziranoj historiji.
4. **Replike.** In-app notifikacija o članku (`payload.articleId`) nosi kopiju naslova i tijela; `ChangeLog` za
   `knowledge_article` nosi snapshot naslova (`toKnowledgeArticleSnapshot`). Nijedna nije bila u scrubu.
5. **`KnowledgeInterceptResolution`.** Red po pregledu portala (koji je članak ponuđen uz koji tiket) je lični trag
   osobe; nije se brisao.
6. **Retention.** Nije postojao nijedan period za bazu znanja. Arhivirani članak — dakle onaj koji je izašao iz portala
   — držao je tekst, komentare, dnevne preglede, change-log i notifikacije zauvijek. Za razliku od tiketa, problema i
   promjena, nije bilo ni kategorije, ni postavke, ni izvršnog koda.

Nalaz je P2 jer je riječ o **nepotpunom erase-u** (GDPR čl. 17) i o **neograničenom čuvanju** sadržaja koji više nije
u upotrebi, a ne o curenju po sebi.

## Rješenje

**Jedna eksplicitna matrica, dva izvršna puta: retention za arhivirano, anonymizacija za osobu.**

### Matrica

| Reader | Šta nosi | Retention (`knowledgeContent`) | Anonymizacija |
| --- | --- | --- | --- |
| `KnowledgeArticle.title`, `.body` | slobodni tekst, imena, adrese, loginovi | marker nakon perioda od `archivedAt` | scrub tokena; trigger osvježi `searchVector` |
| `KnowledgeArticle.slug`, `.status`, `.classification`, `categoryId`, `isFaq`, `faqOrder`, `serviceId`, `organizationalUnitId`, `ownerUserId`, `reviewerUserId`, `ownerGroupId`, `publishedAt`, `archivedAt`, `reviewDueAt`, `lastReviewedAt`, `viewCount`, `ratingCount`, `ratingSum` | skeleton i brojači | **ostaje** | ostaje (veza na pseudonim) |
| `KnowledgeArticle.sourceTicketId`, `.sourceMessageId` | pokazivač na tiket/message iz kojeg je draft | `null` | `null` kad tiket pripada osobi |
| `KnowledgeFeedback.comment` | slobodni tekst („šta nedostaje”) | `null` | sopstveni ⇒ `null`; tuđi koji imenuje osobu ⇒ scrub |
| `KnowledgeFeedback.rating`, `.isHelpful`, `.commentResolvedAt` | ocjena i „riješeno” | ostaje | ostaje |
| `KnowledgeArticleView` (dan, views, uniqueViewers) | dnevna telemetrija | redovi sa `day < cutoff` se brišu; agregat `viewCount` ostaje | ostaje (nije lični podatak) |
| `Notification` sa `payload.articleId` | kopija naslova/tijela | `body` ⇒ `null` | scrub `title`, `body`, `payload`; pointer ostaje za deep link |
| `ChangeLog` (`entityType = knowledge_article`) | snapshot naslova i razlog | `reason` ⇒ marker, `diff` ⇒ `{ redacted: marker }` | scrub `reason` i `diff` |
| `KnowledgeInterceptResolution` | koji je članak ponuđen uz koji tiket | nije obuhvaćeno (nema teksta) | `deleteMany({ userId })` |
| `KnowledgeCategory`, `Problem` veze | šifrarnik / cross-domain | ostaje | ostaje |

Period se računa od `archivedAt` — trenutka kad je članak izašao iz portala — ne od `updatedAt` (svaki touch bi
pomjerio rok) ni od `publishedAt` (članak može godinama biti aktivan). `DRAFT`/`IN_REVIEW`/`PUBLISHED` članci se **ne**
dižu retentionu: oni su u upotrebi, a njihov sadržaj pokriva anonymizacija. Pravna blokada vlasnika ili pregledača
(`ownerUser.legalHoldAt` / `reviewerUser.legalHoldAt`) čuva članak netaknut, isto kao problem i change executor.

### Retention

`createKnowledgeContentRetentionExecutor(prisma)` poštuje isti ugovor kao problem/change executor: `preview(cutoff)`
broji i vraća najstariji/najnoviji `archivedAt`, `executeBatch(cutoff)` radi seriju od **100** članaka po pozivu i
vraća `done` kad serija nije puna. `refs` su **slugovi** — operator u izvještaju vidi koji je članak redaktovan, a ne
njegov tekst. Idempotencija nema novu kolonu: članak je „gotov” kad mu je `title` marker, a `dueWhere` i `updateMany`
oba nose `title: { not: marker }`, pa drugi prolaz ne piše ništa (i ne pomjera `updatedAt`).

Replicas se pronalaze po pokazivaču, nikad skeniranjem teksta: notifikacije kroz `payload.articleId`, change-log kroz
`entityId`, komentari kroz `feedback.articleId`, dnevni pregledi kroz `view.day`. Sve u **jednoj transakciji** po
seriji, pa djelimično redaktovan članak ne postoji.

Postavka `private.privacy.retention.knowledgeContentDays` ima default **0** (isključeno — retention je opt-in) i
minimum **180** dana, isti prag kao problem/tiket sadržaj; kategorija je u `retentionCategoriesRequiringDryRun`, pa
`EXECUTE` bez prethodnog `DRY_RUN` odbija `RETENTION_DRY_RUN_REQUIRED`. Kategorija ulazi u plan **prije** `audit`
(red: sessions, emailDeliveries, requestRegister, statusIncidents, assetTransfers, attachments, ticketContent,
problemContent, changeContent, **knowledgeContent**, audit), pa se izvršava u istom noćnom prolazu, a `audit` ostaje
posljednji.

### Anonymizacija

`collectKnowledgeMentions` je jedno mjesto gdje se **čita** ono što scrub **piše**, pa preview i execute vide iste
redove (operatorov broj je stvarni broj):

- članci: `OR(ownerUserId, reviewerUserId, sadržaj imenuje osobu)` — `knowledgeArticleMentionWhere` gradi isti
  superset filtar kao problem/change (svaki token scrubbera je i filter; SQL substring je širi od word-boundary
  regexa, a red bez zamjene se preskače);
- komentari: `OR(userId, sadrži token)` uz `comment != null`;
- notifikacije: `payload.articleId IN (pogođeni članci)`;
- change-log: `entityType = knowledge_article AND entityId IN (pogođeni članci)`;
- izvorni pokazivači: članci sa `sourceTicketId IN (tiket osobe)`.

`scrubKnowledgeMentions` onda piše: scrub `title`/`body` (trigger rebuild `searchVector`), sopstveni komentar ⇒ `null`,
tuđi komentar ⇒ scrub, notifikacija ⇒ scrub `title`/`body`/`payload`, change-log ⇒ scrub `reason`/`diff`, izvorni
pokazivači ⇒ `null`, intercept redovi ⇒ `deleteMany`. Sve je idempotentno jer svaki korak traži red koji još nešto
sadrži. U izvještaju erase-a šest novih brojača zamjenjuje jedan stari `knowledgeComments`: `knowledgeArticles`,
`knowledgeFeedbacks`, `knowledgeNotifications`, `knowledgeChangeLogs`, `knowledgeSourceLinks`, `knowledgeIntercepts`.

U preview-u se sopstveni komentar broji kao **najmanje jedna** zamjena (briše se bez obzira na to da li sadrži ime),
tuđi samo ako scrub zaista nešto zamijeni — inače bi preview prijavio manje od execute-a.

### Zašto ne drugačije

- **Zašto ne `deletedAt`/`redactedAt` kolona na članku?** Marker u `title` je isti ugovor kao problem/change/tiket
  retention (jedan obrazac, jedan test), a trigger na `title, body` već radi ono što treba; nova kolona bi tražila
  migraciju i drugi izvor istine.
- **Zašto ne brisanje arhiviranog članka?** Izgubili bi se slug (deep linkovi i bookmarki), brojači pregleda i ocjena
  i audit trag; retention politika je redakcija sadržaja, ne brisanje reda. (Brisanje članka je zaseban nalaz
  `BA-knowledge-base-15` — hard delete i tombstone politika.)
- **Zašto ne retention za `PUBLISHED`?** Članak u upotrebi nije „više ne treba”; period bi gasio aktivnu bazu znanja.
  Arhiviranje je već eksplicitan čin i `archivedAt` je tačan početak roka.
- **Zašto ne `deleteMany` feedback redova?** Ocjena i „riješeno” su agregat koji izvještaji koriste; briše se samo
  slobodni tekst (lični podatak), ne i činjenica glasanja.
- **Zašto ne scrub notifikacije bez pokazivača?** Notifikacija bez `payload.articleId` nije kopija članka; njen tekst
  pokriva ticket/problem/change scrub koji je već tamo. Skeniranje po tekstu bi pogodilo tuđe notifikacije.

### Cijena

- Novi period je **opt-in** (0), pa nema promjene ponašanja dok ga administracija ne uključi; minimum 180 sprečava
  „retention na 7 dana” greškom.
- Retention je jedan `count` + jedan `findMany` (limit 5.000 za opseg datuma) u preview-u i po seriji od 100 u
  execute-u, plus po jedan `updateMany`/`deleteMany` na pet tabela — bez novih indeksa (`status`, `archivedAt` i
  `articleId` indeksi postoje).
- Scrub je jedan `findMany` po readeru (pet upita) i po jedan `update` za svaki pogođeni red; tipična baza znanja ima
  malo članaka koji imenuju konkretnu osobu, pa je stvarni broj upisa mali.
- `knowledgeContent` ulazi u dry-run obavezu, pa operator mora dva puta (preview + execute), kao za tiket/problem/change
  sadržaj.

## Direktni testni dokaz

**`knowledge-content-retention.executor.spec.ts` (novo, 5):** preview broji samo arhivirane, dospjele i neredaktovane
članke i nosi `oldestAt`/`newestAt`; `where` sadrži `status ARCHIVED`, `archivedAt lt`, `title not marker` i oba
`legalHoldAt: null` uslova; execute radi jednu transakciju, `title`/`body` ⇒ marker, `sourceTicketId`/`sourceMessageId`
⇒ `null`, a skeleton kolone (`slug`, `status`, `classification`, `categoryId`, `serviceId`, `organizationalUnitId`,
`ownerUserId`, `viewCount`, `ratingCount`, `ratingSum`, `archivedAt`) nisu u `data`; replicas: komentari ⇒ `null`,
`day < cutoff` pregledi se brišu, change-log ⇒ marker + `{ redacted }`, notifikacije ⇒ `body: null`; prazna serija ⇒
`done` bez transakcije; serija od 100 ⇒ `done: false`.

**`scrub-knowledge-mentions.spec.ts` (novo, 5):** članak koji osobu imenuje u naslovu/tijelu se scrubuje, članak bez
toga se ne dira; sopstveni komentar ⇒ `null`, tuđi ⇒ scrub (i dalje nosi ocjenu); notifikacija (body i payload) i
change-log (reason i diff) se scrubuju; izvorni pokazivači za tiket osobe se čiste, intercept redovi se brišu; kad
nema šta da se mijenja, vraća se nula u svih šest brojača.

**`retention.integration.spec.ts` (+1, PostgreSQL-gated):** dva arhivirana članka (dospjeli i nedavni) i treći pod
blokadom vlasnika; `DRY_RUN` prijavljuje **1** i ne mijenja tekst; `EXECUTE` redaktuje samo dospjeli — marker u
`title`/`body`, `sourceTicketId`/`sourceMessageId` `null`, `slug`/`status`/`viewCount`/`ratingCount`/`ratingSum`/`OU`
netaknuti; komentar ⇒ `null` uz zadržanu ocjenu; stari dnevni pregled obrisan, novi ostaje; change-log ⇒ marker; kopija
notifikacije ⇒ `body: null` uz zadržan `payload.articleId`; nedavni i blokirani članak netaknuti; drugi `EXECUTE` ⇒
**0**.

**`anonymization.integration.spec.ts` (dopunjeno, PostgreSQL-gated):** članak u vlasništvu osobe sa imenom u
naslovu/tijelu, sopstveni i tuđi komentar, notifikacija, change-log i `KnowledgeInterceptResolution`; poslije
`execute` članak zadržava slug i vlasnika, tekst ne sadrži ime, sopstveni komentar je `null`, tuđi je scrubovan (ocjena
5 ostaje), notifikacija i change-log ne sadrže ime, intercept redova nema, a `report` nosi
`knowledgeArticles`/`knowledgeFeedbacks`/`knowledgeSourceLinks`/`knowledgeIntercepts`.

**Frontend/guard:** `privacy-api.ts` union dobija `knowledgeContent`, bs/en nose naziv i hint kategorije, obje mape
postavke (`settings.registry.keys` i `settings.registry.help`) i `privacy.counts.*` nove brojače;
`settings-registry-coverage.spec.ts` 520 → **521**; `attachments.constants.spec.ts` očekuje 11 kategorija.

**Lokalno:** backend `src/modules/privacy` **133 prošlo / 27 skipped**, cijeli backend unit set **937 suiteova /
5.377 testova prošlo / 307 skipped**, frontend **473 fajla / 1.888 testova**, `eslint` zelen za `privacy`, `settings` i
`attachments`. Integracijski specovi su `skipped` bez `PRIVACY_IT_DATABASE_URL`; dokaz za njih je CI.

## CI i testni dokaz

CI [`45034422138`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45034422138) na `7a902b0` je **success** za `Detect changes`, `Backend build + test` (uključujući
type-check sa stvarno generisanim Prisma klijentom i full Jest), `Backend PostgreSQL + Redis integration`
(oba dopunjena integraciona speca su se izvršila), `Frontend build + test`, `Docs guard`, `Backend container +
supply chain` i `CI gate`. `E2E critical flows`, `E2E install wizard` i `Read-only service-form pattern inventory`
bili su `skipped`, kako je konfigurisano za push na ovu granu; nema E2E/spec sign-offa iz ovog runa i nema mjerenja
performansi (`Perf smoke` nije pokrenut za ovaj put fajlova).

## Registar nalaza

`BA-knowledge-base-14` je u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli [audita 25](../audits/25-knowledge-base.md#14-tabela-nalaza)
prebačen u `zatvoreno`. Zbirovi poslije zatvaranja: **305 zatvoreno / 391 otvoreno / 696**; Val 7 **84 / 27 (0/13/14)**,
`knowledge-base` **14/19**.

## Migracija, rollout i rollback

Migracije nema. Postavka je default **0**, pa se ništa ne mijenja dok je administracija ne uključi; uključivanje ide
kroz `PATCH /settings/private.privacy.retention.knowledgeContentDays` (minimum 180), a prvi noćni prolaz radi
`DRY_RUN` i tek sljedeći `EXECUTE` (kategorija je u `retentionCategoriesRequiringDryRun`). Rollback je vraćanje na
**0** — već redaktovani članci ostaju redaktovani (marker je nepovratan, kao i kod tiketa, problema i promjena), pa se
odluka o uključivanju donosi svjesno.

**Preostali rizik (dokumentovan):**

- retention pokriva **arhivirane** članke; članak koji ostane `PUBLISHED` a nikad se ne pregleda nije obuhvaćen
  periodom (naslijedio bi ga zaseban freshness/publish nalaz, ne ovaj paket);
- `KnowledgeArticleView` se čisti samo za dane starije od cutoff-a; agregat `viewCount` je zauvijek (nije lični
  podatak);
- brojač `knowledgeArticles` se sabira sa problem scrubom (oba pišu u isti ključ izvještaja) — namjerno, jer je
  pitanje „koliko je članaka dirnuto”, ne „koliko po modulu”;
- notifikacija zadržava `payload.articleId` i `articleSlug` (deep link); to nije lični podatak, ali ostaje veza na
  redaktovan članak;
- `KnowledgeInterceptResolution` se **briše** u anonymizaciji, ali nije dio retention perioda (nema teksta, pa nema
  šta da se redaktuje);
- izvoz podataka (ACCESS) nije proširen na članke/komentare osobe — to je zasebno pravo i zaseban nalaz, ne ovaj
  paket; ovdje je dokumentovano kao svjesno ograničenje.

## Sljedeći paket

**W7.88 — `BA-knowledge-base-15` (P2):** hard delete članka kaskadno briše feedback i views bez formalne
tombstone/retention politike — treba odluka o tombstone-u (ili zabrani hard delete-a objavljenog članka) i audit
trag brisanja.
