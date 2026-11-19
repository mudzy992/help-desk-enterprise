# Package closeout — W7.60

**Paket:** `search` nasljeđuje KB owner/reviewer scope bypass iz audita 25 (jedna odluka vidljivosti na svim površinama)<br>
**Nalaz:** `BA-search-06` (P2) — **zatvoren**<br>
**Kodni commit:** `61a2ccb`<br>
**Finalni testani SHA:** `61a2ccb`<br>
**CI:** [`44575893231`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44575893231) — zelen (13m50s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §5: article grana „nasljeđuje owner/reviewer authorization nalaze audita 25”. Audit 25 §3 je
tada opisao dvije delegacijske zaobilaznice: (1) `ownerUserId`/`ownerGroupId` daje write/read bez scope provjere,
pa član owner grupe ili premješteni vlasnik zadržava prava; (2) `reviewerUserId` daje read/review po jednakosti ID-a,
bez obzira na OU/service scope, deaktivaciju ili ukinutu permisiju.

Obje su popravljene **u centralnom predikatu**: `BA-knowledge-base-01` (W7.49 — `isKnowledgeDelegationInScope`,
globalni `USER` assignment ne pokriva nijednu OU) i `BA-knowledge-base-02` (W7.50 — reviewer prolazi isti scope
test). Ostaje pitanje koje ovaj paket rješava: `/search` **nije** dokaz da je popravka stigla do njega. Paleta je
najbrži put do naslova, a `search` je jedina površina koja odluku donosi **batch** loaderom
(`loadKnowledgeArticleVisibilities`), dok su detalj i feedback glasovanje sklapali iste činjenice kroz **drugi**
put (`loadKnowledgeArticleScope` + `loadOwnerGroupMemberUserIds` + `assertCanReadKnowledgeArticle`). Dvije
implementacije istog pravila su upravo mehanizam kojim modul ponovo naslijedi zaobilaznicu koju niko nije htio.

Acceptance: `search` mora odlučivati **istom** funkcijom kao i svi ostali read putovi, a delegacijski rubovi iz
audita 25 moraju biti dokazani **na granici `/search`**, ne samo na detalju.

## Implementacija

- **Jedan loader, jedan poziv predikata** (`load-knowledge-article-scope.ts`): `isKnowledgeArticleVisibleTo` je
  sada `loadKnowledgeArticleVisibilities(prisma, context, [article])` nad jednim redom. Nema više drugog načina da
  se skupe OU putanja, servis i članovi owner grupe.
- **Detalj po ID-u** (`get-knowledge-article.ts`) i **feedback glasovanje** (`submit-knowledge-feedback.ts`)
  koriste isti loader; uklonjena su oba lokalna sklapanja predikata (`assertCanReadKnowledgeArticle` ostaje
  izvezen za buduće pozivaoce, ali ga više nijedan read put ne zove direktno).
- Time važi invarijanta: **članak je vidljiv u `/search` ako i samo ako je vidljiv po ID-u**, na svakoj površini, i
  to po konstrukciji — ne po tome što je neko pregledao dvije kopije.
- **Nema keša i nema nove tabele delegacije**: revoke (premještaj u drugi OU, promjena service assignmenta,
  `reviewerUserId = null`, uklanjanje iz owner grupe) važi na **sljedećem** zahtjevu, bez invalidacije.
- **Bez migracije** — nema schema promjene.

### Namjerne odluke (trade-off)

1. **Ujediniti, a ne dodati provjeru u `/search`.** Dodatna provjera samo u searchu bila bi treća kopija pravila i
   bi garantirala da sljedeća izmjena predikata prođe kroz dvije površine a ne kroz treću. Zato se uklanja put,
   a ne dodaje.
2. **Batch loader je mjerodavan, iako je „skuplji” po redu.** Za jedan red to je par upita više nego ranije, ali
   detalj je jedan članak po zahtjevu, dok je dobitak to što batch put (200 kandidata u `/search` i listi) i
   pojedinačni put dijele istu logiku — upravo tamo gdje bi razlika bila najskuplja.
3. **Dead-code uklanjanje umjesto zadržavanja „kompatibilnog” puta.** `loadKnowledgeArticleScope` i
   `loadOwnerGroupMemberUserIds` ostaju izvezni jer ih koriste `create-knowledge-article.ts` i review-reminder
   posao — ali nijedan read-odluka ih više ne sklapa ručno.
4. **INTERNAL klasifikacija nije dio ovog paketa.** Audit 25 §3 treća primjedba — da je objavljeni `INTERNAL`
   vidljiv svakom prijavljenom korisniku bez OU/service scopea — je **proizvodno pravilo**, predmet
   `BA-knowledge-base-05`, ne delegacijska zaobilaznica. Ovaj paket ga ne mijenja; u parity specu je eksplicitno
   zapisan kao pravilo, da ga naredni paket ne „popravi” slučajno.

## Dokaz

- **`knowledge-base.visibility-parity.spec.ts` (3 testa, novi fajl):**
  - **parity matrica** — 8 actora (`requester` sa globalnim `USER`, scoped owner, scoped reviewer, `agent` IT,
    `agent` HR, `admin` IT, super admin i vlasnik scopeovan na drugi **servis**) × 7 oblika članka
    (`INTERNAL` objavljen, vlasnički `DRAFT`, recenzentski `DRAFT`, `RESTRICTED`, `CONFIDENTIAL` u drugom OU,
    `DRAFT` čiji vlasnik pripada drugom OU, group-owned `DRAFT`) = **56 poređenja** batch-vs-single; test tvrdi i
    da je 56 stvarno izvršeno (da matrica ne može tiho biti prazna);
  - **delegacijski rubovi** — u scopeu prolaze (owner, reviewer, scoped član grupe); premješten vlasnik, globalni
    `USER` član owner grupe i **uklonjen reviewer** padaju; isti odgovor daje i `getById` i `searchTitles`;
  - **klasifikacija i super admin** — `INTERNAL` široko, `CONFIDENTIAL` unutar OU scopea, `RESTRICTED` samo
    admin u scopeu, super admin bez scope pitanja — uvijek identično na oba puta.
- **`search-knowledge-article-titles.spec.ts` (+4 testa, „inherits the delegation model, not a bypass”):**
  vlasnik i reviewer **bez ijedne knowledge permisije** vide svoj nacrt u `searchTitles`; nakon premještaja
  vlasnika u HR grana pada na prazno (`incomplete: false`); nakon `reviewerUserId = null` grana pada i `getById`
  vraća `FORBIDDEN`; član owner grupe sa globalnim `USER` assignmentom ne dobija ništa, dok scopeovani član iste
  grupe dobija.
- Lokalno: `modules/knowledge-base` + `modules/search` + `app.module.spec.ts` = **27 suite / 153 testa** zeleno
  (knowledge-base 21 suite/95, search 58); `eslint` na oba modula čist; `tsc --noEmit` bez nove greške u
  promijenjenim fajlovima; `wiring:check` (99 controllera / 631 ruta) i `check-env-example` (93 varijable)
  nepromijenjeni — paket ne dira rute, guardove ni env.

## CI

[`44575893231`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44575893231) na `61a2ccb` —
**success** (17:19:17Z–17:33:07Z, 13m50s): backend build/lint/full Jest, PostgreSQL + Redis integracija, frontend
lint/format/testovi/build/bundle budget, Docs guard, container/supply-chain i CI gate. E2E install wizard, E2E
critical flows i read-only inventory `skipped` (E2E pokreće korisnik).

## Registar nalaza

- Zatvoreni: `BA-search-06` (P2).
- Ostaju otvoreni u `27-search.md`: 7 nalaza, **P1: nema** — P2: `BA-search-07` (query plan), `08`
  (partial/fail-closed); P3: `09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija), `12`
  (confidential/arhiva), `13` (E2E za `/search`).

## Migracija, rollout i rollback

Nema migracije ni konfiguracije. Rollout: nema akcije. Rollback: revert `61a2ccb` vraća prethodna dva puta
(vidljivost se ne mijenja po odluci, samo po broju implementacija).

**Preostali rizik:** (1) **batch je mjerodavan** — ako se u budućnosti doda read put koji ponovo sklapa činjenice
ručno, invarijanta pada; zato parity spec postoji kao izvršni čuvar, ali ga ne štiti od novog fajla koji
`canReadKnowledgeArticle` zove direktno (taj obrazac više ne postoji u `src`); (2) **INTERNAL široka vidljivost**
ostaje proizvodna odluka (`BA-knowledge-base-05`); (3) **scope revoke** važi na sljedećem zahtjevu — unutar
jednog zahtjeva nema dodatne provjere (nema keša, pa nema prozora dužeg od zahtjeva); (4) grant snapshot/expiry
na nivou članka (audit 25) i dalje traži novu tabelu i odobrenje; (5) query plan (`07`), partial ugovor (`08`) i
telemetrija (`11`) nisu dio paketa.

## Sljedeći paket

`BA-search-07` (P2) — nema query-plan/perf dokaza za `contains` nad imenom/e-mailom i KB naslovom. Prije bilo
kakve izmjene indeksa provjeriti stvarne planove na PostgreSQL-u; ako rješenje traži trigram indeks, to je
**migracija** i traži izričito odobrenje — bez njega paket ostaje na EXPLAIN dokazu i preporuci.
