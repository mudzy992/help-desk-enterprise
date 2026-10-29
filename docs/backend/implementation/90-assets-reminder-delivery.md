# Package closeout — W7.4

**Paket:** W7.4 — potvrđena isporuka asset reminder pragova<br>
**Nalaz:** `BA-assets-04` (P1) — zatvoren<br>
**Kodni commit:** `9dc3384d5921f9b31aa399373733a2ef30cca7d9`<br>
**Finalni testani SHA:** `9dc3384d5921f9b31aa399373733a2ef30cca7d9`<br>
**CI:** [`40934782196`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40934782196) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Prije W7.4 `AssetRemindersService.run()` je bezuslovno zapisivao sve planirane pragove nakon pokušaja dostave. To je pogrešno napredovalo markere bez scoped odgovornog primaoca, kada su svi korisnički kanali bili isključeni, te nakon neuspjeha in-app ili email dostave. Poslije takvog upisa naredni sweep više nije pokušavao isti prag.

Acceptance je ograničen na `BA-assets-04`: marker se napreduje po itemu tek nakon dokaza potrebne primarne dostave. Scoped odgovorni korisnik postaje obavezan primalac samo kada ima barem jedan uključen kanal; svaki takav primalac mora imati potvrđenu in-app ili email dostavu. Bez scoped primalaca, kada su svi scoped kanali OFF ili kada nijedna dostava nije potvrđena, prag ostaje pending. Dodatne interne adrese mogu zadovoljiti item bez scoped primaoca samo poslije uspješnog slanja.

## Implementacija

- `backend/src/modules/assets/reminders/asset-reminders.service.ts` vodi scoped, potrebne i potvrđene primaoce zasebno za svaki `kind:id` reminder item. Djelimičan neuspjeh blokira samo pragove za iteme u scopeu tog primaoca.
- In-app dostava se smatra potvrđenom kada je notifikacija persistovana; `null` iz helpera je postojeći dedupe red i zato dokaz ranije persistovane dostave. E-mail se računa kao potvrđen samo kada `notificationEmailDelivery` trajno pokazuje `SENT`; `CLAIMED`, helper greška ili status koji nije `SENT` ostavlja item pending.
- Primarni dedupe ključ je SHA-256 fingerprint stabilno sortiranog skupa `(kind, item id, crossed threshold, expiry date)`. Isti reminder događaj zadržava ključ na retryju, uključujući user-email claim i in-app unique dedupe.
- Upis pragova se izvršava samo za dovršene iteme. `updateMany` provjerava `id`, retirement status gdje je relevantan, trenutno expiry polje i neizmijenjenu izvornu `remindersSent` listu; operacije prolaze kroz jednu Prisma transakciju. Ako datum/lista budu promijenjeni nakon čitanja, stale update ne odgovara CAS filteru.
- Dodatne interne adrese se i dalje pokušavaju nezavisno od primarnog neuspjeha, kao u dotadašnjem toku. Njihov uspjeh može dovršiti samo item koji nema nijednog scoped primaoca; prisustvo scoped korisnika sa svim kanalima OFF ne pretvara extra adresu u zamjenski primarni kanal.
- Nije mijenjan scheduler, Redis recovery, extra-email storage/dedupe ili ostali assets tokovi. `BA-assets-10` i `BA-assets-11` ostaju odvojeni nalazi.
- Nema API/DTO promjene.

## Direktni testni dokaz

`backend/src/modules/assets/reminders/asset-reminders.service.spec.ts` sada pokriva:

- nula scoped primalaca — nema marker upisa bez uspješne dodatne isporuke;
- svi scoped korisnici su isključili oba kanala — prag ostaje pending, iako se ranije konfigurirani extra email i dalje šalje;
- potvrđene isporuke za warranty asset, contract i software license te `updateMany` CAS filtere koji uključuju trenutni datum i izvornu listu pragova;
- djelimični neuspjeh izolovan na iteme u scopeu neuspješnog primaoca, dok nezavisni item napreduje;
- neuspješnu primarnu in-app/email dostavu;
- retry sa istim semantičkim dedupe ključem;
- email `SENT` kao potvrdu, nasuprot `CLAIMED` kao pending;
- uspješan extra email kao dopuštenu potvrdu samo kada scoped manager ne postoji, te neuspješan extra email koji ne napreduje prag.

## CI i testni dokaz

CI run [`40934782196`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40934782196) na `9dc3384d5921f9b31aa399373733a2ef30cca7d9`:

- **Backend build + test:** zelen; Prisma schema validacija i client generation, generated-artifact/wiring guardovi, annotated backend build, `npm run lint`, prethodno compile-blocked suiteovi, SLA matrix i `npm test -- --ci --coverage=false` prošli su.
- **PostgreSQL/Redis integration:** zelen; real PostgreSQL integration suiteovi i migracijski/infrastrukturni guardovi prošli su. Nije dodan poseban W7.4 DB integration test; CAS filter je direktno provjeren u service regresionom testu.
- **Frontend build + test:** zelen, bez frontend izmjena u paketu.
- **Docs guard:** zelen.
- **Backend container + supply chain:** zelen; build, SBOM, skenovi, provenance i runtime contract prošli su.
- **CI gate:** zelen.
- **Skipped:** `E2E critical flows` i `E2E install wizard` nisu pokrenuti na push workflowu, prema trigger pravilima. `Enforce zero high/critical image vulnerabilities` korak je `skipped` jer actionable high/critical count nije bio različit od nule; nije riječ o CI padu.
- **Neuspjeli CI pokušaji:** nema.

Lokalno su ciljane ESLint provjere za oba izmijenjena fajla, Prettier provjera service speca i `git diff --check` prošli. Lokalni ciljani Jest pokušaj nije mogao kompajlirati backend jer sandbox nema generisani `backend/generated/prisma/client`; Prisma modeli su zato bili nepoznati lokalnom `PrismaService` tipu. Prisma engine download je ranije bio blokiran TLS prekidom, pa `db:generate` nije ponavljan. Ovo je lokalno ograničenje, ne CI greška: CI je generisao Prisma client i uspješno izvršio backend suite.

## Registar nalaza

- Zatvoren: `BA-assets-04` (P1), uz service regresione testove i zeleni CI.
- Ostaju otvoreni: `BA-assets-05`–`BA-assets-19`; posebno `BA-assets-10` scheduler/Redis reconciliation i `BA-assets-11` durable delivery/dedupe za extra email nisu obuhvaćeni.
- Kontrolni zbir prema prethodnom zaglavlju globalnog registra: **585 otvorenih / 107 zatvorenih / 692 ukupno**; severity snapshot ostaje 174 P1, 368 P2 i 150 P3.
- W7.4 nije mijenjao status nijednog susjednog nalaza. Zbir je ažuriran za jedno zatvaranje u odnosu na W7.3 closeout. Uočena je preegzistentna razlika između zbirnog zaglavlja i statusa pojedinačnih redova u globalnom registru/source auditima; nije rekoncilirana u W7.4 jer bi to mijenjalo druge nalaze izvan paketa. `audit:traceability` i dalje potvrđuje svih 692 ID-a, severity i owner/wave plan.

## Migracija, rollout i rollback

Nema Prisma schema promjene niti migracije; postojeća `remindersSent` polja tipa `Int[]` i `notificationEmailDelivery` zapisi dovoljni su za ovu semantiku. Nema manual DB apply koraka ni API compatibility promjene. Rollback je revert koda; taj rollback vraća staru marker semantiku, zato se preporučuje vratiti W7.4 kod samo uz svjesnu operativnu odluku.

Nije rađen istorijski backfill/reset markera koji su možda bili pogrešno napredovani prije W7.4. Ovaj patch sprečava nove lažne upise; ranija marker vrijednost sama po sebi ne dokazuje niti pobija dostavu.

## Sljedeći paket

**W7.5 — `BA-assets-05` (P2):** DB-zaštićena jedinstvenost custom asset atributa. Paket nije započet u ovom closeoutu; W7.4 je zatvoren tek nakon zelenog CI gatea.
