# 360 — W2.26 `BA-users-02`: kreiranje računa je jedna odluka i jedan commit

**Paket:** `W2.26` · **Nalaz:** `BA-users-02` (P1) · **Datum:** 2026-11-26 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** users + notifications · **Povezano:** `BA-users-01`, `BA-users-03`, `BA-authentication-03`

## 1. Nalaz i šta je stvarno bilo pokvareno

`POST /users` je bio niz od tri commita i jedne e-mail pošiljke, u pogrešnom redu:

1. `user.create` + audit `user.created` (commit #1),
2. `issueTemporaryPasswordForUser` — hash + audit (commit #2), pa **odmah e-mail** sa lozinkom,
3. tek onda `assignUserRole` → `assertCanAssignRole` (commit #3).

Dakle, pitanje „smije li ovaj akter dodijeliti tu rolu?" postavljalo se **poslije** što su račun i
vjerodajnica već postojali, a e-mail je već mogao otići. Posljedice, redom po težini:

| Scenario | Stanje prije paketa |
| --- | --- |
| ADMIN pošalje `roleKey=SUPER_ADMIN` | račun i lozinka postoje, e-mail može otići, odgovor je 403 → trajni orphan račun sa poznatom lozinkom |
| pad u koraku role (DB/invalidacija) | isto: aktivan račun bez očekivane role, API prijavljuje neuspjeh |
| pad u koraku lozinke | račun postoji bez vjerodajnice; niko ne zna koju je lozinku sustav „zamislio" |
| pad audita u koraku 1 | jedini korak koji je zaista bio atomski |

Uz to, način dostave tajne nije bio nigdje zabilježen u istoriji računa: `temporaryPasswordDelivery` je
postojao samo u HTTP odgovoru.

## 2. Korekcija

### 2.1 Prvo autorizacija i validacija **cijelog** intenta, pa prvi upis

`createUser` sada radi sve provjere prije nego što otvori transakciju:

```ts
if (authorizationRoleNames[roleKey] === undefined) throw ROLE_NOT_FOUND;
assertCanAssignRole({ roleKey, actorIsSuperAdmin });   // 403 prije ijednog upisa
// OU postoji? e-mail slobodan? kanal dostave? HIBP-provjerena lozinka?
```

`assertCanAssignRole` je time pomjeren ispred `user.create` — to je direktno acceptance kriterij nalaza.
Generisanje i hashiranje lozinke su takođe prije transakcije: to je skup CPU rad (jedan HIBP poziv, jedan
bcrypt) koji ne zavisi od stanja baze, a odbijen kandidat ne smije ostaviti pola računa.

### 2.2 Jedan commit: račun + vjerodajnica + rola + namjera dostave + oba audita

```ts
await prisma.$transaction(async (transaction) => {
  const user = await transaction.user.create({ …hash (samo ui kanal)… });
  const roleId = await ensureSystemRole(transaction, roleKey);
  await createUserRoleWithinTransaction(transaction, { … });   // ista pravila kao assignUserRole
  if (channel === 'email') await enqueueTemporaryPasswordDelivery(outbox, transaction, { … });
  await recordUserChange(transaction, { action: user.created, … });   // audit posljednji
});
```

`assignUserRole` je razdvojen na pre-flight + `createUserRoleWithinTransaction` (novi fajl
`user-role-assignment.transaction.ts`), da bi **isti** kod — SuperAdmin invariant lock, provjera identiteta,
idempotentno postojeće davanje, audit `user.role_assign` — radio i u samostalnoj transakciji i u create
transakciji. Nijedan korak nije „poslije commita"; audit je posljednji, pa njegov pad vraća **sve**.

### 2.3 Dostava: `ui` u odgovoru, `email` kroz durable outbox — bez tajne u bazi

Kanal se određuje **prije** commita (`resolveTemporaryPasswordChannel`: e-mail add-on uključen + SMTP
konfigurisan + adresa dozvoljena policyjem + nije rezervisana test-domena), jer od njega zavisi šta
transakcija piše:

| Kanal | Šta commit piše | Šta se dešava poslije commita |
| --- | --- | --- |
| `ui` | hash lozinke (+ `mustChangePassword`) | lozinka se vraća u odgovoru, tačno jednom (kao i dosad) |
| `email` | **ništa tajno** + outbox namjera `users.temporary-password-delivery` | worker generiše lozinku, hashira je, upiše i pošalje e-mail |

Ključna odluka: **namjera ne nosi lozinku**. Upisati plaintext vjerodajnicu u `OutboxMessage` bilo bi
rješenje jednog defekta (tajna za neuspjelu operaciju) uz mnogo gori (tajna trajno u bazi, u tabeli koju čita
svaki operativni alat). Zato namjera traži *izdavanje* vjerodajnice, a izdaje je worker pod istim retry
budžetom kao svaki drugi durable side effect (8 pokušaja).

Worker (`TemporaryPasswordDeliveryDispatcher`) poštuje tri pravila:

1. **nema dostave za zatvoren račun** — obrisan/deaktiviran račun ne dobija ništa;
2. **ne pregazi tuđu lozinku** — ako je administrator u međuvremenu uradio reset, dostava odustaje
   (`updateMany` sa `localPasswordHash: null` uslovom);
3. **ne ostavlja lozinku koju niko nije dobio** — ako slanje padne, hash se vraća na `null` i pokušaj se
   ponavlja sa **novom** lozinkom. Time „račun ima lozinku" ostaje ekvivalentno sa „neko je za nju znao".

### 2.4 Degradirani režim je eksplicitan

Bez outboxa (skripte, unit konstrukcije) e-mail kanal se **ne glumi**: lozinka se upisuje i vraća u
odgovoru (`ui`), nikad se ne pravi račun bez vjerodajnice. Modul uvijek dostavlja outbox; install wizard ga
sada takođe prosljeđuje (`InstallTeamService`), pa je i wizard-ov e-mail kanal durable.

### 2.5 Audit

`user.created` sada nosi `temporaryPasswordDelivery: 'ui' | 'email'` — prva audit bilješka o tome kako je
tajna napustila sistem (allowlist proširen: `['after', 'roleKey', 'temporaryPasswordDelivery', 'via']`, sa
testom koji to pinuje).

## 3. Dokaz

### 3.1 Unit

| Spec | Šta dokazuje |
| --- | --- |
| `create-user.spec.ts` (12, prepisan) | jedan `$transaction` i **ništa** izvan njega (`outsideTransaction == []`); red `user.create → userRole.create → audit(role) → outbox → audit(user)`; zabranjeni `SUPER_ADMIN` grant, nepoznata rola, nepostojeća OU, dupli e-mail i neizdatljiva lozinka **ne otvaraju transakciju** i ne ostavljaju ni jedan upis; pad role/audita/outboxa vraća sve; `ui` daje hash + lozinku, `email` daje `null` + namjeru; degradirani režim vraća lozinku umjesto nedostupnog računa |
| `resolve-temporary-password-channel.spec.ts` (5) | kanal se poklapa sa onim što pošiljalac zaista radi (add-on, SMTP, policy, rezervisane domene) |
| `temporary-password-delivery.outbox.spec.ts` (5) | jedna namjera po računu, `maxAttempts=8`, payload **bez** tajne, strog kodek |
| `temporary-password-delivery.dispatcher.spec.ts` (7) | hash prije e-maila; neuspio e-mail ⇒ rollback hasha; ne pregazi reset; ništa za deaktiviran/obrisan račun; izgubljen claim; dead letter log |
| `audit-action-schema-registry.spec.ts` (+1) | `user.created` allowlist prima novo polje |

### 3.2 Integration (real PostgreSQL, `PRIVACY_IT_DATABASE_URL`)

`src/modules/users/user-provisioning.integration.spec.ts` (5, dodato u `integrationSpecs`):

1. **commit**: račun (`localPasswordHash: null`, `mustChangePassword`), tačno jedna `UserRole`, oba audita
   (`user.role_assign` + `user.created`), outbox red `PENDING` sa `maxAttempts=8` i **bez** tajne u payloadu;
   nijedan e-mail nije poslan iz request puta;
2. **zabranjena rola**: 403, nema novog računa, nema outbox reda, broj audit redova nepromijenjen;
3. **fault**: `Proxy` baca odmah poslije `INSERT` namjere prije commita ⇒ nema računa, nema namjere, nema
   audita, nema e-maila;
4. **dostava**: prvi e-mail padne ⇒ hash vraćen na `null`, namjera nije `SUCCEEDED`; poslije
   `nextAttemptAt=0` drugi prolaz upiše hash i pošalje e-mail, namjera `SUCCEEDED`;
5. **`ui` kanal**: hash + lozinka u odgovoru, **nula** namjera u outboxu.

Lokalno (bez baze): `users + install + audit-log + notifications` ⇒ **788 passed / 25 skipped**;
`authentication + authorization` ⇒ 780 passed / 13 skipped; `tsc` čist osim poznatog
`announcement-delivery.spec.ts:310`; `eslint` čist na svim dotaknutim fajlovima; `app.module` + DI specovi zeleni.

### 3.3 CI

PR #43, run `45956935765` — **svi poslovi zeleni**: `Backend build + test`, `Backend PostgreSQL + Redis integration`
(14m3s, uključuje novi spec), `Frontend build + test`, `Backend container + supply chain`, `Docs guard`,
`E2E critical flows` 27/27 bez flakea, `CI gate`. Push run `45956928588` ✓ sa integracijom `skipped` (CI ugovor),
Perf smoke `45956935587` ✓.

Prvi prolaz (`45955076835`) je pao u integraciji, i oba nalaza su bila stvarna defekta u **dokazu**:

| Nalaz | Popravka |
| --- | --- |
| audit role granta visi na `UserRole` redu (`entityId = userRole.id`), pa upit po user id vidi samo `user.created` | upit pokriva oba identiteta iz istog commita |
| pad SMTP-a je bio mockovan na `mailTransport`, ali je pošiljalac u cjelini mockovan — worker nikad ne vidi grešku i namjera se označi `SUCCEEDED` | pad je mock **odgovor pošiljaoca** (`sendTemporaryPasswordEmail → false`), što je i produkcijski oblik odgovora |

## 4. Šta paket mijenja u ponašanju

- **E-mail kanal je odgođen**: odgovor `POST /users` više ne čeka SMTP i nikad ne sadrži lozinku kad je kanal
  `email`. Ako slanje trajno padne (8 pokušaja), račun ostaje bez vjerodajnice i vidljiv je u
  `OutboxMessage` (dead letter + warning linija); put oporavka je postojeći, auditirani
  `POST /users/:id/reset-password`.
- **Nema više „fallback na UI" kad SMTP padne u toku slanja** — kanal se odlučuje prije commita. To je
  namjerno: odgovor koji je obećao e-mail ne smije tiho odati tajnu u tijelu odgovora.
- **Zabranjena rola više ne ostavlja račun** — ni u jednom scenariju.
- `InstallTeamService` prosljeđuje outbox, pa i wizard ima durable e-mail kanal.

## 5. Granica paketa

- **Ne** dira `resetUserTemporaryPassword`/`unlink` (isti inline obrazac, drugi nalaz) — samo dijele
  `prepareTemporaryPassword` i `resolveTemporaryPasswordChannel`.
- **Ne** uvodi novu šemu ni migraciju: koristi postojeći transactional outbox (`OutboxMessage`).
- **Ne** mijenja HTTP kontrakt: `temporaryPasswordDelivery: 'ui' | 'email'`, `temporaryPassword: string | null`.
- Sinkroni deo ostaje sinhron: `ui` kanal uvijek vraća tajnu u odgovoru, pa E2E (rezervisane domene) i
  dalje čita lozinku iz odgovora.

## 6. Reference

- Kod: `backend/src/modules/users/{create-user.ts,user-role-assignment.transaction.ts,assign-user-role.ts,`
  `temporary-password-delivery.outbox.ts,temporary-password-delivery.dispatcher.ts,`
  `send-temporary-password-email.ts,issue-temporary-password-for-user.ts,is-reserved-no-email-address.ts}`,
  `backend/src/modules/audit-log/audit-action-schema-registry.ts`,
  `backend/src/modules/install/install-team.service.ts`.
- Audit: `docs/backend/audits/04-users.md` §`BA-users-02`.
