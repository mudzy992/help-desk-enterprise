# 374 — W2.37: jedan RFC 4514 čitač/pisač DN-a (`BA-organizational-units-07`)

**Paket:** `W2.37` · **Nalaz:** `BA-organizational-units-07` (P2) · **Datum:** 2026-11-28 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** organizational-units + directory-sync · **Povezano:** `W2.36c` (katalog ↔ stablo), `W2.36` (tree oblik)
**DB migracije:** ne · **API:** bez promjene ruta; DN ugovor je proširen (vidi §3)

## 1. Nalaz i stvarno stanje koda

Audit je tvrdio: parser radi `split(',')`, rewrite radi string suffix, nema escaped separatora,
multi-valued RDN ni hex pravila, a descendant rewrite ne ponavlja validaciju dužine. Provjera koda
prije paketa — sve četiri tvrdnje su tačne, i to u **dva** parsera odjednom:

| Mjesto | Ponašanje prije | Posljedica |
| --- | --- | --- |
| `organizational-units/normalize-distinguished-name.ts` | `split(',')`, zabranjuje `,` u vrijednosti | `OU=Korisnici\, Inc.,DC=local` (validan AD DN) odbijen |
| `directory-sync/normalize-directory-distinguished-name.ts` | ista kopija pravila | isti DN odbijen i kao read scope |
| `directory-sync/ldaps/distinguished-name.ts` | vlastiti parser (unescape regexom), `endsWith(',<base>')`, `parentDistinguishedName` regex `(?<!\\),` | LDAPS put i API put **ne slažu se** o istom imenu (`BA` nalaz: „manual i synced katalog mogu imati različitu semantiku") |
| `rewrite-descendant-distinguished-name.ts` | `slice(0, -oldAncestor.length)` | rename s escaped comma vrijednošću reže unutar vrijednosti; dužina se ne mjeri poslije rewritea |
| `is-forest-root-distinguished-name.ts` | `split(',').every(startsWith('DC='))` | `CN=A+DC=local` i `DC=local,OU=A` klasifikovani kao forest root |
| `is-descendant-distinguished-name.ts` | `endsWith(',<parent>')` | parent s escaped comma nikad ne prepoznaje svoje potomke |

## 2. Korekcija: jedan modul, dva tanka adaptera

Novi `backend/src/common/ldap/rfc4514-distinguished-name.ts` je jedini DN čitač/pisač:

- `parseDistinguishedName` — RDN niz; podržava escapes (`\,` `\+` `\"` `\\` `\<` `\>` `\;` `\=` `\ ` `\#`),
  heksadecimalne bajt-escape (`\C4\8D` → `č`), quoted vrijednosti (RFC 2253), `#hexstring` BER oblik,
  multi-valued RDN (`OU=A+CN=B`) i UTF-8; beznačajni razmaci oko separatora se ignorišu.
- `formatDistinguishedName` / `escapeDistinguishedNameValue` / `formatDistinguishedNameAttribute` —
  kanonski izlaz i escape po RFC 4514 §2.4 (vodeći `#`/razmak, prateći razmak, `,+"\<>;=`, kontrolni znaci kao `\XX`).
- `createCanonicalDistinguishedName` — oblik koji se **čuva** (tipovi velikim slovima, vrijednosti escape-ane, bez razmaka).
- `createDistinguishedNameComparisonKey` — **jedan** usporedni ključ (case-folded kanonski oblik) za manual i sync tok.
- `isDistinguishedNameWithinBase`, `isStrictDistinguishedNameDescendant`, `rewriteDistinguishedNameAncestor`
  — poređenje i rewrite idu po **RDN granicama**, ne po stringu.

Adapterski sloj ostaje tanak i zadržava svoje error kodove:

- `organizational-units/*` → `OrganizationalUnitError('INVALID_DISTINGUISHED_NAME')`
- `directory-sync/*` → `DirectorySyncError('INVALID_SCOPE')`

`ldaps/distinguished-name.ts` sada samo projicira zajednički parser na svoj stari ugovor
(`{type, value}` dijelovi, multi-valued RDN se ravna u jedan dio po atributu), pa `map-ldaps-entries`,
`build-directory-sync-plan`, `resolve-user-organizational-unit` i `assets/directory/*` ne mijenjaju potpis.

## 3. Podržani subset (eksplicitno, jer puna podrška nije cilj)

**Podržano:** escaped separatori i specijali, heksadecimalni bajt-escape, Unicode, quoted vrijednost,
multi-valued RDN, `#hexstring`, numerički OID tipovi, razmaci oko `,`/`+`/`=`.

**Odbijeno i dalje, s istim kodom:**

| Pravilo | Zašto |
| --- | --- |
| `/` u vrijednosti | `ouPath` koristi `/` kao separator; vrijednost se ne bi mogla vratiti kroz API |
| prazna vrijednost (`OU=,DC=local`) | jedinica bez imena; parser je dozvoli, normalizator odbija |
| tip van `OU/DC/CN/O` | API ugovor (RAW §5) |
| DN iznad 1024 znaka, **prije i poslije** escape-anja | escape može narasti preko limita |
| nepoznat escape (`\q`), nezatvoren quote, neparan/nedozvoljen hex | sintaksa nije DN |

**Dokumentovano ograničenje:** `#hexstring` se **ne dekodira** (nema BER čitača u stacku). Vrijednost se
čuva i poredi kao heksadecimalni payload — deterministički, ali nije čitljiva; OU ugovor je takvu vrijednost
nikada ne proizvodi.

## 4. Utjecaj na postojeće ponašanje

- `OU=Korisnici,DC=local` — kanonski oblik **nepromijenjen** (svi postojeći testovi prolaze bez izmjene).
- `ou=korisnici, dc=LOCAL` → `OU=korisnici,DC=LOCAL` (tip velikim slovima, vrijednost kako je napisana); usporedba
  je case-insensitive kroz ključ, ali **pohranjeni oblik nije** case-folded — `BA-organizational-units-04`
  (case-insensitive identitet u bazi) ostaje otvoren i traži migraciju.
- `isForestRootDistinguishedName('')` vraća `true` kao prije (prazan scope = „nije zadano"), ali
  `DC=local,OU=A` više nije forest root.
- `parentDistinguishedName` vraća **kanonski** ostatak DN-a umjesto sirovog substringa.
- Ime OU-a kreirano iz UI-a ne mijenja se: `normalizeManualOrganizationalUnitName` već zabranjuje `,+/\"<>;=`,
  pa escape u praksi radi za DN-ove koji dolaze iz AD-a ili iz API poziva.

## 5. Dokaz

| Test | Šta dokazuje |
| --- | --- |
| `common/ldap/rfc4514-distinguished-name.spec.ts` **9** | escapes (`,` `+` `\` `=`, `\C4\8D`), Unicode round-trip, multi-valued RDN, quoted i `#hex`, kanonski oblik vs. usporedni ključ, escape pravila, 12 malformisanih ulaza s tačnim `reason` |
| `organizational-units/distinguished-name-contract.spec.ts` **12** | normalizator prihvata escaped/quoted/hex/multi-valued, odbija `/`, praznu vrijednost, nepoznat tip i predugačko **poslije** escape-anja; descendant kroz parent s escaped comma; rewrite po RDN granicama, rewrite samog pretka, nevezanog imena i **prekoračenje limita** |
| `directory-sync/directory-name-contract.spec.ts` **5** | scope normalizator (escaped/quoted/Unicode/multi-valued), `within-base` case-folded i RDN-aware (`DC=localnext` nije unutar `DC=local`), forest root po RDN, gradnja katalog DN-a s escape-anim imenom i RDN-aware root rewrite |
| `parse-directory-read-scope.spec.ts` +**1** | manual scope `ou=korisnici\, inc., dc=local` se čita kao jedna vrijednost |
| `ldaps/ldaps-pure.spec.ts` +**1** | vrijednost koja završava escape-anim backslashom ne guta separator; multi-valued RDN se ravna; `isDistinguishedNameWithin` case-folded |

Lokalno: `src/modules/directory-sync|organizational-units|install|assets|authorization` + `src/common/ldap`
**154 suite / 831 test** (16 suite / 57 testova skipped — PostgreSQL-only), `nest build` čist, `eslint` 0 grešaka.

## 6. Šta ovaj paket ne rješava

- **`BA-organizational-units-04`** — jedinstvenost DN-a u bazi po case-folded ključu traži migraciju
  (`functional index`/`citext`); novi usporedni ključ je preduslov, ne zamjena.
- **`BA-organizational-units-08`** — operativne granice stabla i rewritea.
- Proizvoljan **numerički OID** tip prolazi parser, ali normalizatori ga odbijaju jer API obećava samo
  `OU/DC/CN/O`; proširenje bi bilo promjena javnog ugovora, ne bugfix.
