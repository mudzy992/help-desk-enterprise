# W7.91 — `BA-knowledge-base-18`: rješavanje komentara ima aktera, audit i optimistic state

**Paket:** Val 7, `knowledge-base`, **P3**<br>
**Nalaz:** „Comment resolution nema audit, actor ni optimistic state”<br>
**Kod:** migracija `20271201150000_knowledge_feedback_resolution_actor` (`commentResolvedByUserId` + FK
`SetNull` + indeks), `prisma/schema/knowledge.prisma` i `identity.prisma` (imenovane relacije
`KnowledgeFeedbackAuthor`/`KnowledgeFeedbackResolver`), `knowledge-base/portal/knowledge-portal.service.ts`
(`resolveComment` vraća `KnowledgeCommentResolution`, compare-and-set `commentResolvedAt: null`, audit u istoj
transakciji), `knowledge-base/portal/knowledge-portal.controller.ts` (vraća rezoluciju), audit ugovor
(`audit-log.constants.ts`, `audit-action-compatibility-registry.ts`, `audit-action-schema-registry.ts`),
`common/database/database-runtime-contract.ts` (+ spec) schema sentinel; frontend
`services/knowledge-portal-api.ts` (`KnowledgeCommentResolution`), `knowledge-insights-panel.tsx` (pending
stanje, optimistično uklanjanje, „već riješeno” toast), `lib/audit/audit-log-{actions,entities,fields}.ts`,
i18n bs/en; testovi: `knowledge-portal.service.spec.ts` (**+4**), nova
`portal/knowledge-comment-resolution.integration.spec.ts` (**2**, PostgreSQL), `knowledge-insights-panel.spec.tsx`
(**2 → 4**), in-memory feedback delegat (`updateMany`, `findUnique` po `id`, nova kolona)<br>
**DB migracija:** **da** — aditivna (`ADD COLUMN` + FK + indeks), bez backfillа i bez destruktivnog SQL-a<br>
**CI:** vidi „CI i testni dokaz” (run se upisuje po završetku)

## Nalaz

„Označi riješenim” je bio običan `update`:

```ts
await this.prisma.knowledgeFeedback.update({
  where: { id: feedbackId },
  data: { commentResolvedAt: new Date() },
});
```

Tri posljedice, sve tihe:

1. **Nema aktera.** Red je pamtio *kad*, ali ne *ko*. Kurator koji dođe sedmicu kasnije (ili audit) nije mogao
   odgovoriti na jedino pitanje koje se postavlja kad nešto „nestane” iz liste za doradu.
2. **Nema dokaza.** `AuditLog` nije imao zapis — a audit §16 kaže da feedback/views ne trebaju audit zbog
   obima, *osim* rješavanja komentara niske ocjene, koje je odluka o sadržaju, ne telemetrija.
3. **Nema optimistic state.** Dva kuratora (ili dva taba) kliknu istovremeno: oba `update`-a prođu, drugi tiho
   prepiše `commentResolvedAt` (i, poslije ovog paketa, aktera). Niko ne sazna da je posao već bio urađen — a
   UI nije imao ni pending stanje, pa je dvostruki klik bio normalno ponašanje.

## Rješenje

**Akter u redu + audit u istoj transakciji + compare-and-set koji priznaje kad je posao već urađen.**

### Red pamti aktera

Migracija dodaje `KnowledgeFeedback.commentResolvedByUserId` (`TEXT NULL`, FK na `User` sa
`ON DELETE SET NULL`, indeks). `SetNull` je izbor, ne olakšica: brisanje korisnika ne smije obrisati komentar
čitaoca (red pripada autoru, ne rješavaču), a `ON DELETE CASCADE` na ovoj koloni bi uzeo i komentar. Zato se
dvije relacije na `User` sada eksplicitno zovu `KnowledgeFeedbackAuthor` (autor, `Cascade` — postojeće
ponašanje) i `KnowledgeFeedbackResolver` (rješavač, `SetNull`). Imena relacija ne mijenjaju bazu; mijenja se
samo nova kolona.

### Audit commit-uje sa činjenicom

```ts
return this.prisma.$transaction(async (transaction) => {
  const updated = await transaction.knowledgeFeedback.updateMany({
    where: { id: feedbackId, commentResolvedAt: null },
    data: { commentResolvedAt: resolvedAt, commentResolvedByUserId: context.actorUserId },
  });
  if (updated.count === 0) { /* vidi dolje */ }
  await this.audit(
    auditLogActions.knowledgeCommentResolved,        // 'knowledge.feedback.comment_resolved'
    auditLogEntityTypes.knowledgeFeedback,           // 'knowledge_feedback'
    feedbackId,
    context,
    { articleId: feedback.articleId, resolvedAt: resolvedAt.toISOString() },
    { transaction },
  );
  return { … alreadyResolved: false };
});
```

Zapis je `producer` scope (kao i ostali knowledge događaji — jedinicu nosi članak, feedback red je nema), a
schema allowlist je `['articleId', 'resolvedAt']`: **tekst komentara je namjerno odsutan** (može sadržavati
lične podatke — audit §8), a akter je već kolona samog audit reda (`actorUserId`).

Ako transakcija padne, nema ni reda ni audit zapisa; ako uspije, oboje postoje. To je razlika prema W7.83
kategorijama, gdje je audit bio post-write: ovdje je dokaz dio činjenice.

### Compare-and-set: prvi klik pobjeđuje, drugi sazna šta se desilo

`updateMany` sa `commentResolvedAt: null` u filteru je atomski po redu. Dva paralelna klika daju
`count: 1` i `count: 0`:

- pobjednik upisuje aktera, piše audit i vraća `alreadyResolved: false`;
- gubitnik **ne piše ništa** (ni drugi audit red — to bi tvrdio obradu koja se nije desila), pročita stvarno
  stanje i vraća `alreadyResolved: true` sa **stvarnim** `resolvedByUserId` i `resolvedAt`.

Time „ko je riješio” ima tačno jedan odgovor, a drugi kurator to vidi umjesto da misli da je on riješio.

### Frontend: pending stanje i priznanje

Panel sada:

- vodi `resolvingIds` — dugme je `disabled` + `aria-busy` i piše „Označavam…” dok zahtjev traje, pa dvostruki
  klik ne postoji;
- **optimistično** uklanja red iz liste kad server potvrdi (i zatim osvježi stranu sa servera, da se poklopi sa
  `hasMore`/`nextCursor` iz W7.90);
- kad odgovor kaže `alreadyResolved: true`, prikaže `toast` „Komentar je već označen riješenim — prikazujem
  stvarno stanje.” umjesto tihe promjene;
- greška i dalje ide u `ApiErrorText` sa request ID-em.

### Zašto ne drugačije

- **Zašto ne „samo dodaj audit post-write”?** Dvije nezavisne operacije znače prozor u kojem red postoji bez
  dokaza (i obrnuto). Pošto je ovo odluka o sadržaju, dokaz mora biti atomičan; transakcija je jedina
  konstrukcija koja to garantuje bez novog stanja u bazi.
- **Zašto ne zasebna tabela `KnowledgeCommentResolution`?** Jedan događaj po komentaru, bez istorije
  (unresolve ne postoji). Kolona na redu + audit red pokrivaju i trenutno stanje i istoriju; nova tabela bi
  duplirala oboje.
- **Zašto ne `409 ALREADY_RESOLVED`?** Odbijanje bi natjeralo UI da iz greške izvlači stanje, a nije greška —
  posao je urađen, samo ne od ovog aktera. `alreadyResolved` u 200-odgovoru nosi tačno ono što UI treba
  (akter + vrijeme) i idempotentno je.
- **Zašto `SetNull`, a ne zadržati id bez FK-a?** Bez FK-a bi brisanje korisnika ostavilo visi ID koji ništa ne
  znači i niko ga ne može provjeriti. `SetNull` + audit (bez FK-a na aktera) je kombinacija koja tačno kaže:
  red više ne zna ko je, dokaz još zna.
- **Zašto ne optimistic upis bez servera (local state)?** UI koji tvrdi „riješeno” prije odgovora bi lagao kod
  `alreadyResolved` i kod greške. Optimizam je samo u uklanjanju reda **poslije** potvrde; pending stanje je
  prije nje.

### Cijena

- jedan `UPDATE … WHERE commentResolvedAt IS NULL` + jedan audit insert po kliku (obe u transakciji);
- jedan dodatni `findUnique` samo u rijetkom slučaju (gubitnik trke);
- `commentResolvedByUserId` je `NULL` za sve postojeće redove — povijesni komentari ostaju bez aktera, i to je
  dokumentovano (nema backfillа: nemoguće ga je izvesti tačno).

## Direktni testni dokaz

**`knowledge-portal.service.spec.ts` (+4):**

- resolve upisuje aktera i `resolvedAt`, **i** audit red sa `action`, `entityType: knowledge_feedback`,
  `entityId`, `actorUserId` i metadata `{ articleId, resolvedAt }` — sve iz istog poziva;
- drugi resolve vraća `alreadyResolved: true`, **prvog** aktera i **isto** vrijeme, a broj audit redova ostaje
  1 (drugi klik ne piše dokaz koji bi tvrdio obradu);
- `Promise.all` dva resolve-a: tačno jedan `alreadyResolved: false`, tačno jedan audit red, jedan akter;
- čitalac bez prava pisanja: `FORBIDDEN`, red ostaje nerješen i **nema** audit reda.

**`knowledge-comment-resolution.integration.spec.ts` (novo, 2, PostgreSQL):** dva paralelna resolve-a kroz
stvarni servis nad stvarnom bazom daju jedan pobjednički upis, jedan audit red (`entityType`,
`actorUserId`, metadata `articleId`) i aktera u redu; brisanje korisnika koji je riješio postavlja
`commentResolvedByUserId` na `NULL` (`SetNull` dokazan), `commentResolvedAt` ostaje, a audit red i dalje nosi
aktera — dakle dokaz nadživi nalog.

**`knowledge-insights-panel.spec.tsx` (2 → 4):** tokom zahtjeva dugme je `disabled` i piše „Označavam…”, drugi
klik ne šalje drugi poziv, red nestaje poslije potvrde i **ne vraća se** kad osvježavanje vrati server truth;
`alreadyResolved` prikazuje info toast.

**In-memory klijent je ojačan, ne zaobiđen:** feedback delegat sada ima `updateMany` koji **primjenjuje filter**
(`commentResolvedAt: null`, `commentResolvedByUserId`), `findUnique` prima `{ id }` kao i `{ articleId_userId }`
(oba su unique selektori u Prisma-i) i nosi novu kolonu. Bez toga bi dva paralelna resolve-a „prošla” u testu
dok bi ih baza odbila.

**Lokalno:** backend **940 suite / 5.408 testova** (316 skipped: integracije bez baze), frontend **474 fajla /
1.892 testa**, `eslint`, `tsc`, `prettier`, `i18n:check` i `db:migration-policy:check` (122 migracije) zeleni.

## CI i testni dokaz

_(upisuje se po završetku runa)_

## Registar nalaza

`BA-knowledge-base-18` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 25](../audits/25-knowledge-base.md#16-tabela-nalaza). Zbirovi poslije zatvaranja: **309 zatvoreno /
387 otvoreno / 696**; Val 7 **88 / 23 (0/12/11)**, `knowledge-base` **18/19**.

## Migracija, rollout i rollback

**Migracija je aditivna i bez backfillа.** `ADD COLUMN` sa `NULL`, FK `SetNull` i indeks; nijedan postojeći red
se ne prepisuje, pa deploy ne blokira tabelu duže od DDL-a (Prisma `migrate deploy` u release jobu). Schema
sentinel (`expectedSchemaMigration`) je pomjeren na novu migraciju, pa aplikacija bez nje ne prolazi readiness
provjeru — to je namjerno: stari kod bi pisao `commentResolvedAt` bez aktera, a novi audit bi tvrdio da akter
postoji.

**Redoslijed deploya:** baza (migracija) → backend → frontend. Novi backend radi i sa starim frontendom
(odgovor je aditivan: `resolveKnowledgeComment` je ranije vraćao `void`, sada objekat koji stari UI ignoriše).

**Rollback:** vraćanje koda je sigurno (kolona ostaje, `NULL`-ovi su validni). Vraćanje migracije nije
potrebno; ako bi se radilo, `DROP COLUMN` je destruktivan i traži approval po politici migracija.

**Preostali rizik (dokumentovan):**

- **istorijski komentari nemaju aktera** (`NULL`) — nemoguće ih je rekonstruisati bez pogаđanja; audit za njih
  ne postoji i to je zapisano, ne prećutano;
- **`alreadyResolved` je 200, ne 409** — klijent koji želi strogu grešku mora je izvesti iz polja; to je izbor
  (idempotencija) i tako je dokumentovano u tipu i UI-ju;
- **brisanje korisnika briše vezu, ne dokaz** — ko je riješio vidi se u auditu, ali ne u redu članka;
- **audit red nosi `articleId`, ne `articleTitle`** — naslov se ne kopira u audit (mijenja se);
- **resolve i dalje traži `canWrite` nad člankom** (W7.90 feed radi isto), pa pravo na rješavanje prati pravo na
  uređivanje članka, ne posebnu dozvolu.

## Sljedeći paket

**W7.92 — `BA-knowledge-base-19` (P3):** deset suiteova je compile-blocked, a nedostaje concurrency/failure E2E
matrica za knowledge base — zadnji nalaz ovog modula.
