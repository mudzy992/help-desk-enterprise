# Modul 5: Admin i settings

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena. Nijedan kod nije mijenjan (čeka se potvrda obima refaktorisanja).

Provjere izvršene u sandboxu:
- Čitanje u cijelosti: `pages/admin-page.tsx`, `pages/settings-page.tsx`, `lib/settings/use-settings-registry.ts`, `lib/settings/settings-realtime-store.ts`, `lib/settings/use-admin-module-read-only.ts`, `lib/settings/is-admin-module-read-only.ts`, `lib/settings/read-setting-entry.ts`, `lib/admin/parse-admin-tab.ts`, `lib/admin/admin-security-tab.ts`, `components/admin/admin-ops-panel.tsx`, `components/admin/admin-security-panel.tsx`, `components/admin/admin-security-settings-cards.tsx`.
- Čitanje dijelova: `components/admin/ops-health-card.tsx` (redovi 109–151, 779–795, pregled komponenti), `components/admin/admin-audit-log-card.tsx` (50–100), `components/admin/admin-security-audit-card.tsx` (74–112).
- Provjera pristupa na rutama: `app/router.tsx` (171–219), `lib/session/route-access.ts` (28–38, 154–160).
- Provjera read-only moda na serveru: `backend/src/modules/authorization/evaluate-admin-read-only-access.ts`, `admin-read-only.interceptor.ts`, `enforce-admin-read-only-mode.ts` (nazivi i logika); na frontendu `lib/map-api-error.ts` (ključ `READ_ONLY_MODE`).
- Provjera upotrebe: `useSettingsRegistry()` (4 mjesta), `useAdminModuleReadOnly()` (1 mjesto), `embedded` prop na stranicama (4 + settings), `bumpSettingsGeneration()` (3 mjesta).
- Brojanje i18n ključeva `admin.*` i `settings.*` u `bs` i `en`.
- Pregled e2e testova koji dodiruju admin tabove (`grep` po `/admin`).
- Komentari sa internim oznakama „Paket …“ (brojanje u fajlovima modula).
- **Nije pokrenut pregledač i nije pisan test.** Nalazi S2 i S3/S4 potvrđeni su čitanjem koda. Reprodukovati ih u pregledaču prije ispravke (vidi listu na kraju).

**Nije pročitano u punom obimu:** `components/admin/ops-health-card.tsx` (850 linija, pregledani samo dijelovi), `components/admin/admin-security-metrics-card.tsx`, `components/admin/security-rate-limits-card.tsx`, `components/admin/admin-audit-export-card.tsx`, `components/admin/admin-support-bundle-card.tsx`, `components/settings/email-templates-editor.tsx`, `components/settings/setting-detail-dialog.tsx`, `components/settings/settings-registry-panel.tsx` (samo pristup i prop `canWrite`), `components/settings/smtp-email-settings-card.tsx`, `components/settings/branding-settings-card.tsx`, `pages/teams-admin-page.tsx`.

---

## Modul

**Admin i settings** je područje za administratore (`ADMIN`, `SUPER_ADMIN`). Obuhvata:
- stranicu `/admin` sa sedam tabova: `org` (organizacione jedinice), `groups`, `users`, `permissions`, `settings` (postavke), `ops` (operacije i zdravlje sistema) i `security` (sigurnost, samo SUPER_ADMIN)
- stranicu `/settings`, koja je samo preusmjerenje na `/admin?tab=settings`
- postavke po registru (`/settings/registry`): brending, SMTP, prijava (auth provider), email šabloni, inbound email, sistemske postavke, add-on-i, nerutirani red, sigurnosne postavke
- operacije: zdravlje sistema, alarmi, audit log, izvoz audit loga i provjera lanca, paket za podršku, metrike sigurnosti
- sigurnost (SUPER_ADMIN): ograničenja prijava, politika sesija, HIBP, masovni reset lozinki, dnevnik sigurnosnih događaja

Granica modula: `pages/admin-page.tsx`, `pages/settings-page.tsx`, `components/admin/` (18 fajlova), `components/settings/` (21 fajl), `lib/admin/` (5 fajlova), `lib/settings/` (24 fajla), `services/settings-api.ts`, `services/config-versions-api.ts` i rute `/admin`, `/settings` i `/admin/queue` u `app/router.tsx`.

**Pitanje za odluku o obimu (vidi kraj izvještaja):** stranice `/admin/teams`, `/admin/config-versions`, `/admin/workflow` i `/admin/email-templates` su u routeru pod „admin“ prefiksom, ali nijedna nije među 14 oblasti iz plana. Nisu obrađene u ovom modulu.

---

## Povezani fajlovi i folderi

| Fajl ili folder | Uloga |
|---|---|
| `frontend/src/pages/admin-page.tsx` (160) | Ljuska sa tabovima, čitanje `?tab=`, zaštita tabova |
| `frontend/src/pages/settings-page.tsx` (122) | Stranica postavki (ugrađena u tab `settings`) |
| `frontend/src/pages/legacy-admin-redirect.tsx` | Preusmjeravanje starih ruta (`/users`, `/settings`, `/admin/queue`, …) |
| `frontend/src/pages/groups-page.tsx`, `users-page.tsx`, `permissions-page.tsx`, `organizational-units-page.tsx` | Tabovi admin stranice, rade u `embedded` režimu |
| `frontend/src/components/admin/` (18) | Operacije, audit, sigurnost, zdravlje sistema |
| `frontend/src/components/settings/` (21) | Kartice postavki, dijalozi za izmjenu, registar |
| `frontend/src/lib/admin/` (5) | `parseAdminTab`, pravila za sigurnosni tab, mapiranje grešaka |
| `frontend/src/lib/settings/` (24) | Hook registra, store za generaciju, read-only pravila, helperi za čitanje postavki |
| `frontend/src/lib/session/route-access.ts` | `canOpenAdminArea`, `canOpenTeamsAdminPage` |
| `frontend/src/app/router.tsx` | Rute `/admin`, `/settings`, `/admin/*` sa `RequireAccess` |
| `frontend/src/lib/realtime/helpdesk-socket-host.tsx` | Šalje `bumpSettingsGeneration()` pri događaju sa servera |
| `frontend/src/services/settings-api.ts`, `audit-log-api.ts`, `security-api.ts`, `support-bundle-api.ts` | HTTP pozivi |
| `frontend/src/components/services/service-catalog-read-only-banner.tsx`, `pages/services-page.tsx` | Jedini primjer prikaza read-only moda u UI-ju |
| `frontend/src/i18n/locales/{bs,en}/common.json` | Prijevodi `admin.*` (763 / 756 ključeva) i `settings.*` (1315 / 1314) |
| `backend/src/modules/authorization/` (read-only mod) | Serverska zabrana zapisa za zaključane module |
| `backend/src/modules/settings/` | Registar postavki i definicije |
| `e2e/tests/11-email-templates.spec.ts`, `21-status-monitoring.spec.ts`, `35-ops-health.spec.ts`, `36-notifications-email.spec.ts`, `41-admin-identity-ux.spec.ts`, `47-rate-limits-configurable.spec.ts` | E2E tokovi za admin tabove |

---

## Trenutna implementacija

**Zaštita pristupa, četiri nivoa:**
1. Ruta `/admin` je obavijena u `RequireAccess` sa `canOpenAdminArea` (`router.tsx:212`). Pravilo: `isSuperAdmin === true` ili uloga `ADMIN` ili `SUPER_ADMIN` (`route-access.ts:28–38`).
2. `AdminPage` ponovo računa isto pravilo (`admin-page.tsx:30–33`) i daje `renderRestrictedTab` za tabove `org`, `groups`, `users`, `permissions` i `ops`.
3. Tab `settings` **nije** obavijen u `renderRestrictedTab`. Umjesto toga `SettingsPage` sam provjerava isto pravilo (`settings-page.tsx:31–34`) i prikazuje `EmptyState`.
4. Tab `security` se nudi samo SUPER_ADMIN-u (`admin-page.tsx:133`). Ako ADMIN ipak dođe direktnim linkom, `AdminSecurityPanel` prikazuje prazan prikaz „nema pristupa“ i ne šalje zahtjev (`admin-security-panel.tsx:39–46`).

**Postavke po registru:**
- `useSettingsRegistry()` (`use-settings-registry.ts`) učitava registar pri mountu i pri svakoj promjeni `settingsGeneration`. Vraća `entries`, `isLoading`, `pendingKey`, `errorKey`, `save` i `saveMany`.
- `save` i `saveMany` pozivaju server, zatim `bumpSettingsGeneration()` i `await reload()` (`use-settings-registry.ts:75–109`).
- `bumpSettingsGeneration()` je i na serveru (socket događaj, `helpdesk-socket-host.tsx:40`). Svaka instanca hooka tada ponovo učitava registar.
- Pisanje je kontrolisano prop-om `canWrite` (`isSuperAdmin || hasPermission(settingsWrite)`, `settings-page.tsx:35–36`). Kartice dobijaju `canWrite` kao prop i ne provjeravaju sesiju same.

**Read-only mod:**
- Na serveru radi `AdminReadOnlyInterceptor`. Za mutaciju admin rute, ako je modul zaključan (`private.readOnlyMode.activeModulesCsv`), a korisnik nije „bypass“ uloga, vraća se 403 sa porukom „Admin module is read-only“ (`evaluate-admin-read-only-access.ts:11–35`).
- Na frontendu se greška mapira u `errors.readOnly` (`map-api-error.ts:29`).
- Frontend **prikazuje** zaključano stanje samo na jednom mjestu: `services-page.tsx` preko `useAdminModuleReadOnly("service_catalog")` i `ServiceCatalogReadOnlyBanner`. Admin i settings stranice ga ne koriste (vidi S1).

**Operacije (`admin-ops-panel.tsx`):**
- Svaka kartica ima svoje pravo, sa mješavinom `hasPermission` i `hasRole` (`admin-ops-panel.tsx:31–50`).
- Zdravlje sistema (`ops-health-card.tsx`) se osvježava na 30 s, samo kad je browser tab vidljiv (`document.visibilityState`, `:109`, `:145–151`), sa `inFlight` zaštitom (`:127–131`). Interval se čisti pri unmountu.
- Audit log (`admin-audit-log-card.tsx`) koristi kursor (`nextCursor`) i „učitaj više“.
- Lista sigurnosnog dnevnika (`admin-security-audit-card.tsx`) takođe koristi kursor i filtere po akciji i korisniku. Pretraga korisnika ima `sequence` zaštitu (`:107–112`).
- Izvoz audit loga, provjera lanca i paket za podršku su u jednoj kartici (`admin-audit-export-card`, `admin-support-bundle-card`). Paket za podršku traži ulogu `SUPER_ADMIN`.

**Sigurnost (SUPER_ADMIN):**
- `AdminSecuritySettingsCards` (`admin-security-settings-cards.tsx`) sadrži ograničenja prijava (dijalog), politiku sesija, HIBP, masovni reset lozinki (sa `IdentityConfirmDialog`) i pokazivač u tabu postavki.
- Sve izmjene idu kroz dijalog sa razlogom. Masovni reset traži potvrdu identiteta. Ovo je dobro rješenje.

**Lokalizacija:** `bs` ima 763 ključa za `admin.*`, a `en` 756. Razlika su `_few` oblici za bosanski plural (ispravno). Za `settings.*` je 1315 / 1314, takođe ista razlika (`settings.emailTemplates.modifiedCount_few`).

---

## Realno/željeno stanje

| Oblast | Realno stanje | Željeno stanje |
|---|---|---|
| Pristup admin area | Pravilo je u 4 fajla, sa dvije logike (role i permission) | Jedan predikat u `lib/session`, koristi ga ruta i stranice |
| Read-only admin/settings | Server blokira zapise, ali UI izgleda aktivan. Klik daje grešku | UI pokazuje zaključano stanje (banner, onemogućena dugmad) kao na uslugama |
| Registar postavki | Svaka instanca hooka učitava registar. Snimanje pokreće dva GET-a | Jedan izvor (React Query ključ), invalidacija po snimanju |
| Audit liste (kursor) | Odgovor kasnog zahtjeva može dopisati stare redove u novi filter | Svaki zahtjev provjerava da je još aktuelan (`sequence` ili `AbortController`) |
| Tabovi admin stranice | Tabovi `org/groups/users/permissions/ops` imaju `renderRestrictedTab`, `settings` nema | Isti obrazac za sve tabove |
| Standalone režim stranica | Četiri stranice i `SettingsPage` imaju granu za samostalni prikaz, koja se ne koristi | Ukloniti granu ili vratiti rutu |
| Testovi | 17 spec fajlova u ovim folderima, uglavnom za helpere. Nema testova za stranice ni za kartice operacija | Testovi za stranice i kartice koje sadrže pravila pristupa i pisanja |
| E2E | Tabovi `settings`, `ops`, `security`, `groups` i email šabloni su pokriveni | Dodati tok read-only i provjeru prava po ulozi |

---

## Gap analiza

1. **Read-only mod nije vidljiv u adminu.** Admin koji radi u zaključanom modulu vidi aktivna dugmad i snima. Server odbija, a poruka je generička („Admin module is read-only“). Ovo nije sigurnosna rupa, jer je server ispravno zaštićen, ali je korisničko iskustvo pogrešno, a zaključavanje se ne može uočiti dok se ne proba.
2. **Pravila pristupa su ponovljena.** `canOpenAdminArea` (route-access), `canOpen` (admin-page i settings-page) i `canSupportBundle` (`hasRole`, admin-ops-panel) su različiti zapisi iste ideje. Rezultat je da se mogu razići.
3. **Dvije vrste zaštite na istoj stranici.** Tabovi koriste `renderRestrictedTab`, a `settings` koristi zaštitu unutar komponente. Oboje radi, ali se mijenjanje jednog zaboravlja lako.
4. **Mrtav kod.** `embedded` grane u pet stranica se nikad ne koriste van admin stranice (rute su preusmjerene). `AdminSecuritySettingsCards isSuperAdmin` dobija konstantu `true`, pa su uslovi `isSuperAdmin ? … : null` uvijek tačni.
5. **Greške bez poruke.** Lista organizacionih jedinica u operacijama se učitava sa `.catch(() => setUnitOptions([]))`, pa je select prazan bez objašnjenja. Padaju i dvije druge provjere bez poruke.
6. **Testovi.** Nema testova za `admin-page` (pravila tabova), `settings-page` (write/read pravila), `admin-ops-panel` (matrica prava), `ops-health-card` (850 linija), `admin-audit-log-card` i `admin-security-audit-card` (kursor i filteri).
7. **Veličina komponenti.** `ops-health-card.tsx` ima 850 linija i devet komponenti u jednom fajlu (`:117`, `:369`, `:384`, `:484`, `:490`, `:578`, `:619`, `:694`, `:731`, `:779`).
8. **Komentari sa internim oznakama.** Oko 43 komentara sadrže oznake poput „Paket 5.4.0-e.3 (owner's live review)“. To je istorija projekta, a ne objašnjenje koda. Trebalo bi da stoje u commit porukama ili dokumentaciji.

---

## Mišljenje tima i preporuka

*Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima.*

Ovaj modul ima dobru sigurnosnu osnovu. Pravila su na serveru (read-only interceptor), route guard-ovi postoje, tab dnevnika je samo za SUPER_ADMIN, a masovni reset lozinki traži potvrdu identiteta. Greške koje postoje su uglavnom **u UI-ju i održavanju**: admin ne vidi zaključano stanje, pravila su ponovljena, a dio koda je mrtav. Najveći rizik je da se pravilo promijeni na jednom mjestu i zaboravi na ostalima.

Preporuka za redoslijed:
1. **Testovi prije promjena (S14).** Napisati testove za pravila pristupa, matricu prava u operacijama i tabove. Bez njih se promjene u ostalim tačkama ne mogu provjeriti.
2. **Jedan predikat za admin pristup (S5).** `canOpenAdminArea` i ostali se spajaju u `lib/session`. Ruta, `AdminPage` i `SettingsPage` koriste isti poziv.
3. **Read-only u UI-ju (S1).** Koristiti postojeći `useAdminModuleReadOnly` na stranici admina i u karticama postavki. Prikazati banner i onemogućiti kontrole. Server ostaje izvor istine.
4. **Race u listama (S3, S4).** Prvo reprodukovati u pregledaču (dvije brze promjene filtera). Ako se potvrdi, dodati `sequence` provjeru kao u pretrazi korisnika.
5. **Registar postavki (S2, S6).** Pretvoriti `useSettingsRegistry` u React Query ključ. Tada se duplo učitavanje i pogrešan `pendingKey` rješavaju na jednom mjestu.
6. **Čišćenje (S7, S11, S12).** Ukloniti mrtve grane i literale, razdvojiti `ops-health-card.tsx` po komponentama, a interne oznake prebaciti iz komentara.

Refaktor se ne radi bez potvrde obima.

---

## Otkriveni bugovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Predložena popravka |
|---|---|---|---|---|
| S1 | Srednja | `pages/admin-page.tsx:153`; `pages/settings-page.tsx:48–119`; `components/admin/admin-security-settings-cards.tsx:36–52`; `lib/settings/is-admin-module-read-only.ts:32–58` | Read-only mod za module `admin`, `settings` i `security` nije vidljiv u UI-ju. Dugmad su aktivna, a server vraća 403 `READ_ONLY_MODE` tek pri snimanju. Hook `useAdminModuleReadOnly` postoji, ali ga koristi samo `services-page.tsx:41`. Frontend takođe ne čita `private.readOnlyMode.bypassRolesCsv`: server dozvoljava zaobilaženje za te uloge i za SUPER_ADMIN sa `isLocalOnly` (`evaluate-admin-read-only-access.ts`, `canBypassReadOnlyMode`). Ako bi UI samo prikazao zaključavanje, prikazao bi pogrešno stanje upravo onima koji smiju pisati. | Čitati `bypassRolesCsv` i `isLocalOnly` (ili dodati polje `canEdit` u odgovor servera). Zatim `useAdminModuleReadOnly("settings")` i `("admin")` na stranici; banner kao `ServiceCatalogReadOnlyBanner`; `canWrite && !isLocked` u karticama. |
| S2 | Niska | `lib/settings/use-settings-registry.ts:71–73, 75–89`; `lib/realtime/helpdesk-socket-host.tsx:40` | Snimanje pokreće dva zahtjeva za registar: `await reload()` (red 81) i efekat na `settingsGeneration` koji reaguje na `bumpSettingsGeneration()` (red 80). Svaka instanca hooka reaguje na isti događaj. Iz koda, nije mjereno. | Jedan izvor (React Query ključ) i invalidacija po snimanju. Provjera u Network tabu: broj GET `/settings/registry` nakon jednog snimanja. |
| S3 | Srednja (za provjeru) | `components/admin/admin-audit-log-card.tsx:50–98` | `loadMore` dopisuje redove (`:90`) bez provjere da je filtar (`organizationalUnitId`) i dalje isti. Ako se OU promijeni dok je zahtjev u toku, stari redovi se dopišu novom listi. | `sequence` ili `AbortController`, kao u pretrazi korisnika (`admin-security-audit-card.tsx:107–112`). |
| S4 | Srednja (za provjeru) | `components/admin/admin-security-audit-card.tsx:74–105` | `load` nema zaštitu od preklapanja. Promjena filtera (`action`, `userId`) u toku učitavanja može prepisati rezultate novijeg filtera starijim odgovorom. | Ista zaštita kao u S3. |
| S5 | Srednja | `lib/session/route-access.ts:28–38`; `pages/admin-page.tsx:30–33`; `pages/settings-page.tsx:31–34`; `components/admin/admin-ops-panel.tsx:42–50` | Isto pravilo za admin pristup je zapisano na tri mjesta. Operacije koriste mješavinu `hasPermission` i `hasRole`, a paket za podršku samo `hasRole(superAdmin)`. | Predikat `canOpenAdminArea` u `lib/session`; pravila za operacije u jednoj funkciji sa testovima (matrica uloga i prava). |
| S6 | Niska | `lib/settings/use-settings-registry.ts:92–109` | `saveMany` postavlja `pendingKey` na prvi ključ (`entries[0]`). Pri snimanju više ključeva spinner se prikazuje samo na jednoj stavci. | Pending kao skup ključeva ili kao jedan token za cijeli zahtjev. |
| S7 | Niska | `pages/settings-page.tsx:41–47`; `pages/groups-page.tsx:118`; `users-page.tsx:123`; `permissions-page.tsx:16`; `organizational-units-page.tsx:70`; `components/admin/admin-security-panel.tsx:51`; `admin-security-settings-cards.tsx:38,45,52` | Mrtva grana samostalnog prikaza (`embedded ? null : …`), jer rute preusmjeravaju na `/admin`. `AdminSecuritySettingsCards isSuperAdmin` dobija konstantu `true`, pa su uslovi uvijek tačni. | Ukloniti granu ili prop; ukloniti konstantni prop. |
| S8 | Niska | `pages/admin-page.tsx:147–154` | Tabovi `org`, `groups`, `users`, `permissions`, `ops` koriste `renderRestrictedTab`, a `settings` ne koristi. Zaštita postoji u `SettingsPage`, ali se obrazac razlikuje. | Isti obrazac za sve tabove (vidi S5). |
| S9 | Niska | `components/admin/admin-ops-panel.tsx:61–69` | `.catch(() => setUnitOptions([]))`: greška se ne prikazuje. Select je prazan, a izvoz kasnije javlja „treba organizaciona jedinica“, bez objašnjenja zašto. | Poruka o grešci uz select i ponovni pokušaj. |
| S10 | Niska | `components/admin/admin-ops-panel.tsx:131–155` | Select za organizacionu jedinicu stoji između kartica zdravlja i audit loga, a kontroliše i audit log i izvoz u kartici ispod. Odnos nije vizuelno jasan. | Premjestiti select u zaglavlje sekcije „Audit“, uz tekst koji kaže šta mijenja. |
| S11 | Niska | `components/admin/ops-health-card.tsx` (850 linija) | Jedan fajl sa devet komponenti (`:117–779`). Teško se testira i pregleda. | Razdvojiti: `ops-health/` sa `ComponentGrid`, `AlertList`, `QueueTable`, `SchedulerTable`, `ChannelSummary`, `AlertHistory`. |
| S12 | Niska | `pages/admin-page.tsx:130–132`; `components/admin/admin-ops-panel.tsx:41,46`; `components/admin/admin-security-panel.tsx:10–24`; `components/admin/admin-security-metrics-card.tsx:15,63,153`; `components/settings/` i `lib/settings/` | Oko 43 komentara sa internim oznakama „Paket …“ i „owner's live review“. To je istorija, a ne opis koda. | Prebaciti u commit poruke ili u dokumentaciju; u kodu ostaviti kratko objašnjenje pravila. |
| S13 | Niska | `components/admin/ops-health-card.tsx:785–795` | `.then((rows) => !cancelled && setItems(rows))`: izraz `&&` kao naredba. Radi, ali je nečitljiv. Projekat nema ESLint konfiguraciju (vidi modul 1), pa se pravilo `no-unused-expressions` ne provjerava automatski. | `if (!cancelled) setItems(rows);` |
| S14 | Srednja | `frontend/src/components/admin/`, `components/settings/`, `lib/settings/`, `lib/admin/`, `pages/admin-page.tsx`, `pages/settings-page.tsx` | Nema testova za stranice `admin-page` i `settings-page`, za `admin-ops-panel`, `ops-health-card`, `admin-audit-log-card`, `admin-security-audit-card`, `admin-audit-export-card`, `admin-support-bundle-card`. Postoji 17 spec fajlova, ali uglavnom za helpere. E2E pokriva tabove, ali ne read-only tok ni matricu prava po ulozi. | Testovi iz preporuke 1, plus e2e tok „ADMIN ne vidi security tab, SUPER_ADMIN vidi“ i „zaključan modul: dugme onemogućeno“. |
| S15 | Za provjeru | `components/admin/admin-ops-panel.tsx:49–50, 120` | `AdminSecurityMetricsCard` se prikazuje samo kad je `canSupportBundle` (uloga SUPER_ADMIN), a ne po pravu za pregled operacija. Nije jasno da li je to namjerno. | Potvrditi sa vlasnikom proizvoda. Ako je namjerno, komentar to treba reći. |

Pozitivno (ne ulazi u bodove): zaštita na serveru je ispravna (read-only interceptor); tab dnevnika je zaštićen na dva nivoa; kartice postavki primaju `canWrite` kao prop; masovni reset traži potvrdu identiteta; `parseAdminTab` vraća podrazumijevani tab za nepoznatu vrijednost; `useAdminModuleReadOnly` ima ispravnu logiku (`!isLoading && errorKey === null`); `ops-health-card` ima `inFlight` zaštitu i čisti interval; prijevodi su u paru; greške se mapiraju kroz `mapApiError` i `mapAdminOpsError`.

---

## Ocjena: 6/10

**Obrazloženje:** Sigurnosna osnova je jaka. Server štiti read-only module, rute su zaštićene, sigurnosni dnevnik je zatvoren za sve osim SUPER_ADMIN-a, a masovne akcije traže potvrdu identiteta. Bodovi se oduzimaju zbog toga što admin ne vidi zaključano stanje (S1), zbog ponovljenih pravila pristupa (S5), zbog mrtvog koda (S7, S8), zbog nedostatka testova za stranice i kartice (S14) i zbog velike komponente zdravlja sistema (S11). Potencijalne trke u listama (S3, S4) nisu potvrđene u pregledaču, pa nisu uzete kao dokazan problem.

---

## Must-Have (za ovaj modul)

1. **S14:** testovi za pravila pristupa (`admin-page`, `settings-page`), matricu prava u operacijama i tokove u e2e prije bilo kakve promjene. Bez ovoga se ostale stavke ne mogu sigurno raditi.
2. **S5:** jedan predikat za admin pristup u `lib/session`, koji koriste ruta, stranice i operacije.
3. **S1:** prikaz read-only moda na stranici admina i u karticama postavki (banner, onemogućena dugmad), sa testom.
4. **S3 i S4:** provjera u pregledaču; ako se potvrde, zaštita od zastarjelih odgovora u listama audit loga i sigurnosnog dnevnika.
5. **S2 i S6:** jedan izvor za registar postavki (React Query), sa tačnim `pending` stanjem za višestruko snimanje.
6. **S7 i S8:** ukloniti mrtvu granu `embedded` i konstantni prop `isSuperAdmin`, uz isti obrazac zaštite za sve tabove.

---

## Lista za ručnu provjeru u pregledaču

- S1: na testnom okruženju postaviti `private.readOnlyMode.activeModulesCsv` na `settings` (kroz kartice read-only moda u Postavkama ili direktno u bazi testnog okruženja). Prijaviti se kao ADMIN, otići na `/admin?tab=settings` i pokušati izmjenu. Provjeriti da li je dugme aktivno i šta se desi pri snimanju. Ponoviti sa korisnikom čija je uloga u `bypassRolesCsv`.
- S2: u DevTools → Network snimiti jednu postavku i brojati zahtjeve `GET …/settings/registry`. Očekivano: jedan. Ako ih ima dva ili više, potvrđeno.
- S3: u tabu „Operacije“ otvoriti DevTools → Network, postaviti throttling na „Slow 3G“, učitati audit log za jednu jedinicu, pa dok je zahtjev u toku promijeniti jedinicu i kliknuti „Učitaj više“. Provjeriti da li se stari redovi pojavljuju u novoj listi.
- S4: u tabu „Sigurnost“ sa throttlingom brzo promijeniti filter akcije dva puta. Provjeriti da li rezultati odgovaraju zadnjem filteru.
- S5: prijaviti se kao korisnik sa ulogom koja ima `opsHealthView`, ali nije SUPER_ADMIN. Provjeriti šta se vidi u tabu „Operacije“ i da li se paket za podršku prikazuje.
- S9: u DevTools → Network blokirati zahtjev za stablo organizacionih jedinica („Block request URL“) i otvoriti „Operacije“. Provjeriti da li je poruka vidljiva.
- S15: prijaviti se kao ADMIN (ne SUPER_ADMIN) i provjeriti da li se u „Operacije“ prikazuje kartica sa metrikama sigurnosti.

---

## Pitanje za odluku o obimu

Rute `/admin/teams` (515 linija), `/admin/config-versions`, `/admin/workflow` i `/admin/email-templates` su pod admin prefiksom, ali nijedna nije u 14 oblasti plana. Predlog: `/admin/config-versions` i `/admin/email-templates` obraditi kao dio ovog modula u sljedećem prolazu, a `/admin/workflow` i `/admin/teams` dodati kao zasebne oblasti (ili ih pridružiti oblastima „assets i problems/changes“ i „on-call i announcements“). Odluka vlasnika.
