# 359 — W2.25 `BA-groups-02`: opozvano članstvo prestaje važiti odmah

**Paket:** `W2.25` · **Nalaz:** `BA-groups-02` (P2) · **Datum:** 2026-11-26 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** groups + tickets/websocket/platform · **Povezano:** `BA-groups-08`, `BA-authorization-01`

## 1. Nalaz i šta je stvarno bilo pokvareno

Audit je tvrdio: „opozvano članstvo ostaje efektivno do 30 s za HTTP i do 5 min za WebSocket group room".
Rekognoskacija je popravila premisu prije ijedne izmjene — pet minuta **nije** trenutno stanje:

| Tvrdnja iz nalaza | Stvarno stanje prije paketa |
| --- | --- |
| group room se revalidira svakih 5 min | sweep u `socket-room-revalidation.ts` je **već 30 s** (5 min je bio opis iz starije faze) |
| HTTP kasni 30 s | tačno: `loadActorGroupMemberships` je process-local `WeakMap` sa TTL-om od 30 s, a `invalidateActorGroupsCache()` pogađa **samo instancu koja je pisala** |
| socket kasni zbog sweepa | tačno, ali iz drugog razloga: membership mutacija **nije slala nikakav ciljani event**, pa je jedini put do room leave-a bio periodični sweep |

Tri stvarna defekta, dakle:

1. **Nema trenutnog ciljanog izbacivanja iz group rooma** — commit uklanjanja člana nije proizveo nikakav
   distribuirani događaj, pa je petlja bila „čekaj sweep".
2. **HTTP odluka nije provjeravala reviziju** — keširani snapshot se servirao do isteka TTL-a, bez obzira što je
   baza već rekla drugačije. Isti obrazac kao `W2.11` za OU stabla, ali za članstva.
3. **`authzVersion` se povećavao poslije transakcije članstva** — između commita reda i bumpa postoji prozor u kojem
   je članstvo obrisano, a svaka instanca (uključujući onu koja je pisala) još računa sa starom verzijom.

## 2. Korekcija

### 2.1 Revizija je `User.authzVersion`, i podiže se **unutar** transakcije članstva

`User.authzVersion` već postoji i već je dio keš ključa autorizacije. Umjesto nove kolone/šeme, članstvo ga koristi
kao **reviziju članstva** i podiže ga u istoj transakciji koja mijenja red:

```ts
const { authzVersion } = await prisma.$transaction(async (transaction) => {
  await transaction.groupMember.delete({ where: { id: existing.id } });   // 1. membership
  await recordGroupChange(transaction, { … });                            // 2. audit
  const updated = await transaction.user.update({                         // 3. fence
    where: { id: userId },
    data: { authzVersion: { increment: 1 } },
    select: { authzVersion: true },
  });
  await enqueueGroupRoomRevoke(outbox, transaction, {                     // 4. durable revoke
    subjectId: userId, groupId, revision: updated.authzVersion,
  });
  return { authzVersion: updated.authzVersion };
});
invalidateActorGroupsCache();
await invalidatePrincipal(userId, authzVersion);   // samo pointer + socket, bez drugog bumpa
```

Vrijedi za `add`, `remove` i (batch) `delete`. Nijedan korak nije „poslije commita": ako padne bilo koji, pada sve.

### 2.2 Keš članstava servira snapshot samo pod revizijom pod kojom je pročitan

`loadActorGroupMemberships` sada traži objavljenu verziju iz request scope-a:

```ts
const published = readPublishedActorAuthzVersion();
if (published === undefined) return read();          // ne može se dokazati svježina → čitaj bazu
const authzVersion = await published;                // (odbijeno čitanje takođe → baza)
if (entry.authzVersion !== authzVersion) return read();
```

Verziju **ne čita nova upita**: `SessionRevocationStore.check()` već izvršava
`SELECT … u."authzVersion" …` na svakom zahtjevu, pa ta ista vrijednost ide u request scope preko
`publishActorAuthzVersion()` (`authz-version-probe.ts`, isti obrazac kao `catalogue-revision-probe.ts`, prvi publish
pobjeđuje). Posljedica: **nulti dodatni upit** po zahtjevu, a keš prestaje da bude izvor istine.

### 2.3 Ciljani socket revoke je durable događaj, ne `emit`

`removeGroupMember` piše namjeru u postojeći transactional outbox (topic `groups.membership-revoke`, dedupe
`group:<id>:<subject>:<revision>`, 20 pokušaja). `GroupRoomRevokeDispatcher` je običan outbox potrošač: claim →
publish na postojeći kanal `servicedesk:auth:socket:invalidate` kao **novi `kind: 'group'`** → `SUCCEEDED`. Redis pad
je **retry**, ne izgubljen revoke; dead letter je warning linija, a 30 s sweep ostaje safety net.

Pretplatnik razlikuje dvije stvari koje su dosad bile jedna:

| event | efekat |
| --- | --- |
| `token`/`session`/`user`/`users` | diskonekcija sesije (nepromijenjeno) |
| **`group`** | `subject` izlazi iz `group:<id>` na **svakoj** instanci; sesija ostaje |

Ako `leave()` ne uspije, socket se **diskonektuje** (fail closed) — nepotvrđena pretplata ne smije nadživjeti revoke.

## 3. Dokaz

### 3.1 Unit (novo / izmijenjeno)

| Spec | Šta dokazuje |
| --- | --- |
| `src/common/cache/scope-catalog-cache.authz-version.spec.ts` (novo, 6) | dvije „instance" (dva Prisma klijenta, jedan „DB") sa **zagrijanim** snapshotom; poslije commita prvi zahtjev druge instance vraća `[]` bez čekanja; bez objavljene verzije keš se ne koristi; kasni in-flight read ne truje keš |
| `src/modules/groups/group-membership-durable-revoke.spec.ts` (novo, 5) | red transakcije `membership → audit → authz-version → revoke-intent → commit`; hook dobija **committed** verziju; audit/membership pad ne ostavlja ni bump ni namjeru |
| `src/modules/groups/group-room-revoke.outbox.spec.ts` (novo, 4) | dedupe ključ po reviziji, strog kodek (`GROUP_ROOM_REVOKE_PAYLOAD_INVALID`), enqueue na transakciji pozivaoca, `maxAttempts=20` |
| `src/modules/websocket/group-room-revoke.dispatcher.spec.ts` (novo, 6) | publish je tačno `kind:'group'` event na zajedničkom kanalu; Redis pad ⇒ `retry`, ne `succeeded`; dead letter se objavljuje; bez Redisa nema petlje |
| `src/modules/websocket/socket-session-invalidation-subscriber.spec.ts` (+4) | leave bez diskonekcije, drugi članovi netaknuti, neuspio `leave` ⇒ diskonekcija, `group` kroz session put ne radi ništa |
| `src/modules/groups/groups.service.spec.ts` (izmijenjeno) | servis **objavljuje** commitovanu verziju (`notifyUserChanged`) i ne bumpuje drugi put |
| `src/modules/edge-extension/edge-extension.service.spec.ts` (ispravljeno) | stari test je **tvrdio** da se zastario snapshot servira (3 poziva); sada tvrdi `[]` i 4 poziva — finding je bio u testu |

### 3.2 Integration (real PostgreSQL, `PRIVACY_IT_DATABASE_URL`)

`src/modules/groups/group-membership-revoke.integration.spec.ts` (novo, 4, dodano u `integrationSpecs`):

1. **commit**: brisanje članstva + bump + outbox red (`PENDING`, `maxAttempts=20`, payload sa novom revizijom)
   u jednoj transakciji;
2. **dvije HTTP instance sa zagrijanim stanjem**: prvi zahtjev poslije commita — na instanci koja **nije** pisala —
   vraća `[otherGroupId]`, bez sleepa; kontrolni assert dokazuje da je snapshot zaista bio zagrijan (stara verzija
   ga još servira — to je finding);
3. **fault**: `Proxy` nad transakcijom baca odmah poslije `INSERT` namjere, prije commita ⇒ članstvo ostaje,
   verzija nepromijenjena, **nema** outbox reda; ponovljeni poziv prolazi i bumpuje tačno jedanput;
4. **retry/fault dostave**: prvi publish padne ⇒ red nije `SUCCEEDED`, `lastError` nosi uzrok, pokušaj zabilježen;
   poslije `nextAttemptAt=0` drugi drain daje `SUCCEEDED` i tačno jedan `group` event na kanalu.

Lokalno: `npx jest src/modules/groups src/modules/websocket src/common/cache src/modules/edge-extension src/modules/authentication`
⇒ **655 passed / 31 skipped** (11 skipped suite-ova su DB-gated; integration dokaz je CI). `tsc` čist osim poznatog
`announcement-delivery.spec.ts:310`; `eslint` čist na svim dotaknutim fajlovima.

### 3.3 CI

PR #42, run `45903010971` — **svi poslovi zeleni**: `Backend build + test`, `Backend PostgreSQL + Redis integration`
(18m8s, uključuje novi spec), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`,
`E2E critical flows` 27/27 bez flakea, `CI gate`. Push run `45903003104` ✓ sa integracijom `skipped` (CI ugovor),
Perf smoke `45903010749` ✓.

Dva crvena prolaza prije toga nisu bila šum — svaki je našao stvarni defekt u dokazu:

| Run | Nalaz | Popravka |
| --- | --- | --- |
| `45900096760` | install double nije imao `User.authzVersion`, pa je wizard (dodaje osnivača u seedovanu grupu kroz `addGroupMember`) padao na `transaction.user.update is not a function` | `update`/`increment` u in-memory delegatu + `authzVersion` u tipu |
| `45900096760` | dva notifications speca su **tvrdila** da se zastario snapshot servira poslije revoke-a — to je bio finding, ne zaštita | tvrde prazan, tačan snapshot; isolation tvrdnje zadržane |
| `45900096760` | integracijski dokaz: „warmth" je bio pretpostavka, kontrolni assert je tražio zastario odgovor (koji više ne postoji), a fake Redis nije imao `status:'ready'` pa shared publisher nikad nije ni pozvao `publish` | warmth se dokazuje identitetom referentnog niza; kontrola sa starom verzijom očekuje prazan rezultat; fake ima `status:'ready'`, a `lastError` nosi klasu kvara |
| `45901278815` | retry test je mjerio cijeli fajl (3 preostale namjere iz prethodnih testova) umjesto svoje jedne | prije testa preostale namjere se označe `SUCCEEDED`, pa `drain` vidi tačno jednu due namjeru |

## 4. Šta paket mijenja u ponašanju

- `PrincipalInvalidationHook` dobija **drugi, opcioni** argument `committedAuthzVersion`. Kada je prisutan, hook
  pomjera keš pointer i objavljuje socket obavijest, ali **ne** bumpuje ponovo. Bez njega ponašanje je staro.
- Keš članstava je od sada „snapshot + revizija"; worker/socket/skript putanje bez request scope-a čitaju bazu
  (nikad ne serviraju snapshot koji ne mogu dokazati).
- Socket invalidation kanal dobija `kind: 'group'`; stari parser odbija nepoznate kind-ove, pa stare instance u
  rolling deploy-u **ignorišu** novi event (bez crasha) — one i dalje imaju 30 s sweep, a nova instance ga primjenjuje
  odmah. Rolling deploy je zato siguran, ali nije „odmah" dok sve instance nisu nove; to je zapisano u §6.

## 5. Granica paketa

- **Ne** uvodi novu šemu, novu Redis strukturu ni novi kanal.
- **Ne** dira odluku o tome *šta* grupa dozvoljava (`BA-authorization-01`), samo **kada** se odluka ponovo računa.
- `deleteGroup` i dalje obavještava članove kroz postojeći `invalidateUsers` (grupa prestaje postojati, pa nema
  room-a iz kojeg treba izaći); ciljani per-member revoke event ostaje na `remove`.
- Sweep ostaje 30 s i **nije** uklonjen: on je reconciliation za izgubljene evente i za instance iz starije verzije.

## 6. Operativne napomene

- Dead letter: `group_room_revoke_dead_letter topic=groups.membership-revoke sweep_fallback=1` u logu; metrika
  outboxa već pokriva broj pokušaja. Namjere se ne brišu — vidljive su u `OutboxMessage` sa `maxAttempts=20`.
- Ako Redis nije konfigurisan (single-instance deployment), dispečer ne pokušava publish i ne troši pokušaje; ta
  instanca ionako drži sve socket-e, a njen sweep primjenjuje isti zaključak.
- Revizija članstva je i `authz` keš ključ: uklanjanje člana sada **istovremeno** invalidira i autorizacijske odluke
  (to je nusefekat koji nalaz `BA-authorization-01` traži, ne regresija).

## 7. Reference

- Kod: `backend/src/common/request-context/authz-version-probe.ts`,
  `backend/src/common/cache/scope-catalog-cache.ts`, `backend/src/modules/authentication/session-revocation.store.ts`,
  `backend/src/modules/groups/{add,remove}-group-member.ts`,
  `backend/src/modules/groups/group-room-revoke.outbox.ts`,
  `backend/src/modules/websocket/{group-room-revoke.dispatcher.ts,socket-session-invalidation-subscriber.ts}`,
  `backend/src/common/security/socket-session-invalidation.ts`.
- Audit: `docs/backend/audits/06-groups.md` §`BA-groups-02`.
