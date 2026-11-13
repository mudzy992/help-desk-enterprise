# Paket 223 — BA-inbound-email-13: inventar dokaza i preostale praznine

**Status:** zatvoreno owner-directed; raniji tekst je historija, a preostale granice i dokaz u [paketu 226](226-val6-owner-directed-closeout.md).

| Oblast | Postojeći dokaz | Ograničenje |
| --- | --- | --- |
| Crash recovery | `inbound-email-recovery.spec.ts`: replay nakon potvrđenog ticket upisa bez duplikata; `inbound-email-recovery.integration.spec.ts`: istekli claim i idempotentni ključevi nad bazom | Nije cjelokupan realni provider→ticket E2E tok. |
| Konkurencija | `inbound-email-attempt.spec.ts`: konkurentni claimant je fenčan; integration spec provjerava jedinstvenost PROCESSED Message-ID | Unit mock i DB test nisu realni istovremeni mailbox E2E. |
| Provjera pošiljaoca | `inbound-email.spec.ts` testira trusted authserv-id i odbijanja; `inbound-email-admin.service.spec.ts` redakciju | Ne dokazuje da produkcijski receiver uklanja podmetnute headere. |
| Scheduler | `inbound-email.scheduler.service.spec.ts` provjerava ponovno uspostavljanje rasporeda | Unit test, ne simulacija stvarnog Redis gubitka. |
| Raw retention | `inbound-raw-store.spec.ts` i `inbound-email-retention.spec.ts`, paket 221 | Ne predstavlja puni crash test fajlsistema i baze. |
| Mailbox→ticket E2E | Nije dostupan kao automatizovani realni provider E2E dokaz | Potrebno projektovati izolovan, korelisan test sa sigurnim mailboxom i cleanupom; ne koristiti produkcijske podatke. |

CI [`43220061716`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43220061716) na `e592cdf` uspješan je za backend generated-Prisma build/test, PostgreSQL+Redis integration i frontend; E2E critical flows su preskočeni. Taj CI ne zatvara ovaj nalaz. Bez promjene produkcijskog koda ili migracije.

## Opt-in mailbox→ticket test — pripremljen, nije izvršen

`e2e/tests/58-inbound-mailbox-to-ticket.spec.ts` šalje jednu poruku sa jedinstvenim `Message-ID` preko eksplicitno konfigurisanog SMTP testnog izvora, čeka `PROCESSED` inbound red s istim ID-om i `createdTicketId`, pa API-jem provjerava naslov nastalog tiketa. Ovo je puni provider put samo kada je SMTP odredište zaista izolovani mailbox povezan s testnim workerom; ne dokazuje automatski sve crash/concurrency scenarije ni receiver sanitizaciju. Bez `E2E_VAL6_INBOUND=1` test je preskočen. TypeScript i Playwright listing su prošli; stvarni stack nije testiran, nalaz ostaje otvoren.

Test kreira e-mail i tiket bez automatskog brisanja. Obavezni su izolovani potrošni stack, DB i mailbox, aktivan inbound worker i kreiranje tiketa iz pošte, aktivni testni korisnik kao pošiljalac, dozvoljene domene, pouzdan authserv-id i dostupan testni SMTP put. Po završetku treba očistiti/resetovati testni stack i mailbox. Detalji konfiguracije nalaze se u E2E README-u.

### Ciljani run 43306768799

Test 58 je izvršen, ali je pao na prethodnoj provjeri konfiguracije prije spajanja ili slanja poruke: nedostaje ili je neispravna barem jedna od vrijednosti baze, SMTP hosta, porta ili ulazne adrese. Dijagnostika je dopunjena imenima nedostajućih postavki, bez ispisivanja vrijednosti. Nema dokaza mailbox→ticket isporuke.

### Ciljani run 43313627742

Test 58 prijavio je da u jobu nedostaju ili su neispravni `E2E_VAL6_SMTP_HOST`, `E2E_VAL6_SMTP_PORT` i `E2E_VAL6_INBOUND_ADDRESS`; baza nije bila među prijavljenim nedostacima. Test nije slao poruku i nije dokaz isporuke. Vrijednosti nisu ispisane niti potvrđene kao ispravan izolovani fixture.

### Ciljani run 43420715389 i sigurna dijagnostika

Test 58 je spojio bazu i SMTP slanje nije prijavilo grešku, ali u roku od 180 sekundi nije pronađen PROCESSED red s kreiranim tiketom za testni Message-ID. To ne dokazuje dostavu u inbox ni razlog obrade. Na neuspjeh korelacije test sada traži samo vlastiti jedinstveni Message-ID ili naslov i prikazuje ograničen broj statusa, poznatih kodova razloga i boolean podudaranja, bez adrese, naslova, ID-a, sadržaja ili vrijednosti secreta. Ako nema reda, to samo znači da nijedan red u ispitanoj bazi ne odgovara ta dva identifikatora. Za prihvatanje i dalje vrijedi originalni strogi Message-ID + PROCESSED + kreirani tiket; dijagnostička pretraga po naslovu ne pretvara test u prolaz.
