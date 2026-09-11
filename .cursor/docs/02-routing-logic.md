# Routing logika (kritično — čitaj prije diranja `RoutingService`)

Source of truth: `backend/src/modules/routing/` + `RoutingRule` u `backend/prisma/schema/catalog.prisma`.
Matrice: `.cursor/docs/matrices/routing-rules/` i `.cursor/docs/matrices/routing-fallback-and-coverage/`.

Routing rješava **grupu-handlera**. Ne dodjeljuje agenta. Ticket CRUD, Group Inbox i auto-assign **nisu** ovaj modul (Faza 4).

---

## Routing ključ

```
(originUnit + service) → group
```

Persistirano kao `RoutingRule`: `originUnitId` + `serviceId` → `groupId`.

- Jedno pravilo po paru. Unique: `@@unique([originUnitId, serviceId])`. Duplikat → `DUPLICATE_RULE`.
- Parent fallback **nije** drugi red u tabeli. Hodanje po OU lancu je samo u rezoluciji.
- Create validira da OU, servis i grupa postoje (`ORIGIN_UNIT_NOT_FOUND` / `SERVICE_NOT_FOUND` / `GROUP_NOT_FOUND`). FK `onDelete: Restrict`.

Ulaz rezolucije je `(originUnitId, serviceId)` koji caller predaje. Routing **ne** računa origin OU iz korisnika, agenta ili AD atributa. `originUnit` je OU **izvora tiketa**, nikad OU agenta. Mapiranje `User.organizationalUnitId` je identity sloj, ne ovaj engine. Ticket create (Faza 4) će predati `Ticket.originUnitId`; taj tok još ne postoji.

---

## Rezolucija (deterministička)

Kod: `resolveTicketRouting` → `resolveFromAncestorChain`.

1. Servis mora postojati; inače `SERVICE_NOT_FOUND`.
2. Origin OU mora postojati; inače `ORIGIN_UNIT_NOT_FOUND`.
3. Lanac ancestor-a se gradi po stvarnom `parentId` (origin prvi, zatim roditelj, do root-a). **Ne** po string `ouPath` nagađanju. Ciklus u `parentId` se prekida (`seen` set).
4. Učitaju se pravila za taj `serviceId` čiji je `originUnitId` u lancu.
5. Hodanje od origin-a prema root-u; **prvo** pronađeno pravilo pobjedi.

Isti `(originUnitId, serviceId)` uvijek daje isti `RoutingResolution`.

Nema silent dodjele proizvoljne / default / SuperAdmin grupe. Nema `fallbackGroupId`.

---

## Ishodi (`RoutingResolution.outcome`)

Tri first-class ishoda (`routingOutcomes`):

| `outcome` | Kada | `groupId` |
|---|---|---|
| `EXACT` | Pravilo na samom origin OU (`fallbackDepth = 0`) | `rule.groupId` |
| `PARENT_FALLBACK` | Nema exact; prvo pravilo na ancestoru (`fallbackDepth` = koraci gore) | `rule.groupId` |
| `UNROUTED` | Origin je root bez pravila, ili nijedan ancestor nema pravilo | **`null`** |

Audit polja (uvijek prisutna):

| Polje | Exact / parent fallback | Unrouted |
|---|---|---|
| `matchedRuleId` | id pogođenog pravila | `null` |
| `matchedOriginUnitId` | OU na kojem je pravilo | `null` |
| `fallbackDepth` | `0` (exact) ili index ancestora | `max(ancestors.length - 1, 0)` |
| `fallbackPath` | `ouPath` od origin-a do pogođenog OU, uključujući ga | cijeli ancestor `ouPath` lanac |
| `unroutedQueue` | `null` | `{ enabled, ownerRole }` |

API: `GET /routing/resolve?originUnitId=&serviceId=` vraća ovaj objekat.

---

## UNROUTED (first-class ishod, nije grupa)

`UNROUTED` je normalan rezultat rezolucije, ne greška i ne skriveni default.

- `groupId = null`. Nije fake grupa, nije SuperAdmin grupa, nije “default IT”.
- `unroutedQueue.ownerRole` (default `SUPER_ADMIN`) je **vlasnik queue-a**, ne handler grupa.
- Settings samo opisuju queue; **ne** mijenjaju `groupId` i **ne** dodjeljuju grupu:

| Key | Default | Uloga |
|---|---|---|
| `private.ticket.unroutedQueue.enabled` | `true` | Queue metadata (`unroutedQueue.enabled`) |
| `private.ticket.unroutedQueue.ownerRole` | `SUPER_ADMIN` | Queue metadata (`unroutedQueue.ownerRole`) |

Ako je `enabled = false`, ishod je i dalje `UNROUTED` sa `groupId = null`. Routing nikad ne “spasi” tiket proizvoljnom grupom.

Group Inbox (Faza 4) treba čitati ovaj ishod. Routing ga ne upisuje na tiket — ticket create još ne zove `resolve`.

RAW `fallbackGroupId` / `unroutedQueue.targetGroupId` **nisu** implementirani i ne smiju se uvesti kao silent assign.

---

## Coverage

Jedna ćelija po `(service, origin OU)`. Kod: `computeRoutingCoverage`. API: `GET /routing/coverage`. UI: routing stranica, kolone Exact rule / Resolution / Group / Fallback path.

Coverage **nije** četvrti `outcome`. Dva nezavisna signala:

1. **Exact rule na ćeliji** — `hasExactRule` (postoji red `RoutingRule` za baš taj origin + service).
2. **Rezolucija** — isti engine kao `resolve` (`EXACT` / `PARENT_FALLBACK` / `UNROUTED`).

| Pojam | Značenje |
|---|---|
| **Exact** | `hasExactRule = true` i `outcome = EXACT`. Pokriće je lokalno pravilo. |
| **Inherited** | `outcome = PARENT_FALLBACK`. Nema local rule; grupa dolazi s parent OU. UI label: Inherited / Naslijeđeno. |
| **Missing** | `hasExactRule = false`. Nema exact reda na toj ćeliji. Može biti inherited **ili** unrouted. Nije outcome. |
| **Unrouted** | `outcome = UNROUTED`, `groupId = null`. Nema rute ni na origin-u ni na ancestorima. |

Leaf bez vlastitog pravila, ali s pravilom na parentu: **missing** exact + **inherited** rezolucija.
Root (ili cijeli lanac) bez pravila: **missing** exact + **unrouted** rezolucija.

Nema silent rupa: rupa je vidljiva kao `UNROUTED`, ne kao nasumična grupa.

---

## Auto-assignment (IN prve isporuke — TicketAssignmentService)

Dva odvojena koraka:

| Korak | Šta | Status |
|---|---|---|
| **Routing → grupa** | `(originUnit + service)` → handler `groupId` ili `UNROUTED` | Implementirano (`RoutingService`) |
| **Assignment → agent** | Tiket u grupi → `Ticket.assignedUserId` (preuzimanje ili auto-assign) | Implementirano (`TicketAssignmentService`) |

Routing i dalje **ne** bira agenta. Auto-assign i group inbox žive u ticketing assignment sloju. Matrica: `.cursor/docs/matrices/ticket-group-inbox/`.

**Ne** dodavati auto-assign logiku u `RoutingService`. Routing staje na grupi (ili `UNROUTED`).

---

## Change log (settings i routing)

Uspješan `POST /routing/rules` zahtijeva `reason` i u istoj transakciji upisuje postojeći `ChangeLog` red. `diff` snima effective rezoluciju prije i poslije (originUnit, service, target group, fallback path/depth, UNROUTED + queue metadata). Rezolucija, parent fallback i unrouted ishod se ne mijenjaju. Nema config versioning/rollback.

---

## Šta ovaj modul namjerno nije

- Ticket CRUD / state machine / Group Inbox (Faza 4).
- Advanced routing engine `IF (OU + Service + Priority) THEN (Group + SLA + Priority override)` — RAW **OUT**. Ne proširivati `RoutingRule` uslovima.
- SLA, approvals, config versioning, drugi RBAC engine.
- Silent `fallbackGroupId` assign.
