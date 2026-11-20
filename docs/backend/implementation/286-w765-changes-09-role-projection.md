# W7.65 — `BA-changes-09`: role-specific projekcija

**Paket:** Val 7, audit 24 / `changes` — visibility izuzeci i minimalna projekcija<br>
**Nalaz:** `BA-changes-09` (P2) — „Requester/owner/CAB visibility izuzeci vraćaju puni plan, linkove, events i
vote komentare”<br>
**Kodni commit:** `dfaf726` (+ `bd66d0e`, `b61813f` tip, `405407a` supply-chain floor) · **CI:**
[`44689289402`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44689289402) (success)<br>
**DB migracija:** nema — projekcija je čisto čitanje

## Šta je nalaz tvrdio

`changeVisibilityWhere` je binarna: change je vidljiv ako je u OU scopeu `change.read` **ili** ako je gledalac
njegov requester, owner ili član CAB grupe. Ta druga grana je vraćala **cijeli** detalj — description/reason,
implementation/backout/test/communication plan, listu asseta (tuđi CMDB redovi sa tagom, imenom i OU-om), linked
problem (broj, naslov, status iz drugog modula), historiju sa field-level diffovima i sve CAB vote komentare.
CAB član **bez** `change.approve` dobijao je isto toliko ako ima `change.read`. Audit je tražio role-specific
projekcije i minimalne calendar/approval podatke.

## Šta je urađeno

**Vidljivost više nije boolean.** `changeDetailLevel` (`change-visibility.ts`) vraća jedan od četiri nivoa:

| Nivo | Ko ga dobija | Šta vidi |
| --- | --- | --- |
| `full` | change je u OU scopeu `change.read` | sve, kao i do sada (asset-i, problem link, svi planovi, outcome/review, event diffovi, komentari) |
| `participant` | requester ili owner **izvan** scopea | plan za koji odgovara (description, reason, impact, likelihood, sva četiri plana), outcome/review/cancelReason, template, window/status/version; **bez** asseta i problem linka |
| `voter` | CAB član izvan scopea **sa** `change.approve` | planovi potrebni za glasanje, window/status/timestamps; **bez** outcome/review, template-a, asseta i problema |
| `observer` | CAB član izvan scopea **bez** `change.approve` | samo lifecycle zapis (status, tip, rizik, window, OU, servisi, odgovorni, version, approvalRound) |

- Članstvo u CAB-u se sada provjerava **odvojeno od prava glasanja** (`isCabGroupMember`), jer se visibility
  izuzetak veže na članstvo, a ne na `change.approve`; bez toga read-only član ne bi bio prepoznat i dobio bi
  najširu projekciju. Nepoznat slučaj pada na `observer` (fail-closed), nikad na `full`.
- Odgovor nosi `detailLevel` i **`redactedFields`** — imena polja koja su skrivena, pa klijent može reći
  „skriveno” umjesto da prikaže prazan plan. Skriveni linkovi se ne učitavaju uopšte (nema `assetLinkAccess`
  ni problem read provjere za `participant`/`voter`/`observer`), pa projekcija štedi i upite.
- **Event history**: `projectChangeEventDetail` za sve nivoe osim `full` propušta samo lifecycle činjenice
  (`from`, `to`, `action`, `outcome`, `reason`, `round`, `decision`, `quorum`, `approvals`, `created`, `updated`,
  `deleted`, `frozen`) i odbacuje `changes` diff, `textChanged`, liste linkova i `voterSnapshot`.
- **Approval panel**: komentari glasova ostaju vidljivi `full` i `voter` nivou te autoru komentara; requester,
  owner i read-only CAB član dobijaju odluke i brojeve, ali `comment: null` uz `commentsRedacted: true`.
- **UI** (`change-detail-sections.tsx`): `ChangeDetail` tip dobija `detailLevel`/`redactedFields`, `TextBlock`
  prima `redacted`, a description/plan/asset/problem sekcije prikazuju `changes.detail.redactedForRole`
  (bs/en) umjesto praznog polja. „Nije uneseno” i „skriveno” su sada dvije različite poruke.

Nema promjene API ruta, šeme ni konfiguracije; odgovor je aditivan (`detailLevel`, `redactedFields`,
`commentsRedacted`) i restriktivan (polja mogu biti `null` tamo gdje su prije bila popunjena).

## Dokaz

- `change-detail-visibility.spec.ts` (10): matrica nivoa (in-scope pobeđuje, requester/owner → participant,
  CAB sa/bez prava → voter/observer, fallback → observer), projekcija kroz `get()` za sva četiri nivoa
  (full zadržava asset/problem, participant gubi linkove ali zadržava plan, voter gubi outcome/review,
  observer gubi sve tekstove), event redakcija i `projectChangeEventDetail` ponašanje.
- `change-approval-comment-visibility.spec.ts` (5): komentari vidljivi za `full` i `voter`, redaktovani za
  requestera i read-only CAB člana uz `commentsRedacted`, a vlastiti komentar uvijek vidljiv.
- Frontend: `change-detail-redaction.spec.tsx` (4) — plan se prikazuje kad smije, „skriveno” kad ne smije,
  „nije uneseno” ostaje razlikovno; `isRedacted` čita `redactedFields`.
- Changes modul: **19 suite / 108 testa**; frontend `components/changes` + i18n **15 fajlova / 72 testa**;
  `tsc`/`eslint`/`prettier` čisti.
- CI [`44689289402`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44689289402) **success**:
  backend build/lint/test, PostgreSQL + Redis integracija, frontend, docs-guard, container/supply-chain i gate.
  E2E i read-only inventory su `skipped`.

## Supply-chain napomena (isti paket)

Prvi CI run ovog paketa je pao na `npm audit`-u: novi high advisory **Effect ReDoS** (pogođeno ≤ 3.22.0) stiže
kroz `prisma` (devDependency) → `@prisma/config` → `effect@3.20.0`. Kod nije uzrok. Uz odobrenje vlasnika
dodat je `overrides.effect = "^3.22.5"` (isti major, advisory floor); `npm audit --omit=dev --audit-level=high`
ponovo vraća **0** ranjivosti, a `npm ci` instalira iz osvježenog locka (`405407a`). Gate nije preskočen.

## Preostali rizik

1. **`participant` i dalje vidi plan** — to je namjerno: requester ga piše, owner za njega odgovara. Ako politika
   zatraži da i plan bude skriven izvan scopea, to je nova odluka, ne bug.
2. **Servisi i OU ostaju vidljivi** svim nivoima (imena servisa u listi/detalju nisu CMDB zapis); service-level
   autorizacija nije dio ovog nalaza.
3. **Event redakcija uklanja `changes` diff** i za ownera izvan scopea — historija je time manje detaljna, ali
   lifecycle činjenice (status, razlog, odluka) ostaju.
4. **CAB roster** (imena i emailovi glasača) i dalje je vidljiv članovima grupe; to je njihov sopstveni sastav.
5. **Komentar se ne skriva od autora**, čak i kad je nivo `observer`/`participant` — autor ga je sam napisao.

## Sljedeće

Sljedeći P2 u auditu 24 je `BA-changes-10` (owner eligibility ne veže `change.manage` assignment za OU
konkretnog changea).
