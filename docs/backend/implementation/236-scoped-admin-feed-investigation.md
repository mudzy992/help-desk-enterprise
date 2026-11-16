# Scoped admin feed — istraživanje i granice

**Status: otvoreno; nema implementiranog scoped feeda.** Korisnik je izabrao zaseban autorizovani scoped signal, a ne periodični podsjetnik ili odlaganje. Ovo ne zatvara paket [228](228-websocket-follow-up-plan.md).

## Reprodukcija postojećeg ograničenja

Za `groups` privremeni deterministički test pozvao je postojeći `broadcastAdminConfigUpdated` i očekivao adresiranu korisničku sobu scoped administratora. Pao je: emitovana je samo `role:admins`. Postojeći test zasebno potvrđuje da scoped dodjela ne daje članstvo u globalnoj admin sobi. Ovi izolovani testovi ne dokazuju runtime autorizaciju konkretnog scoped korisnika ni cross-instance isporuku. Lokalni test broadcasta je pokrenut s isključenom TypeScript dijagnostikom zbog nedostajućeg generisanog Prisma klijenta; nije zamjena za CI build. Privremeni očekivano padajući test nije ostavljen u suiteu.

## Zašto se postojeći event ne može sigurno samo preusmjeriti

- `AdminConfigChangeInterceptor` nakon mutacije objavljuje samo domen, akciju, aktera i vrijeme. Ne nosi identitet resursa, OU/service scope ni staro/novo stanje. Isti interceptor pokriva različite kontrolere, uključujući rollback više domena.
- `role:admins` pored config metapodataka nosi i privatne settings metapodatke. Dodavanje scoped administratora u tu sobu nije prihvatljivo. Sam naziv domena ili vrijeme promjene takođe mogu biti metapodatak izvan dozvoljenog scopea.
- `GroupsService.listAccessible` provjerava `groupManage`, `ADMIN` i OU pokrivenost za svaku grupu. Rezultat create/update/member mutacija sadrži OU, ali DELETE vraća 204; `deleteGroup` ima OU u transakciji prije brisanja, ali vanjski outcome trenutno sadrži samo pogođene korisnike. Poslije brisanja se scope ne može pouzdano dohvatiti iz obrisane grupe.
- Templates imaju zasebna pravila za personal/shared i vlastiti management scope; SLA ima read-scope i globalne administracijske guardove; catalog ima različite permisije za servis, forme i dostupnost. Jedna provjera uloge ili jedan generički OU filter nisu ekvivalent autorizovanom REST čitanju svih domena.
- Socket user soba je samo transport: odabir soba ne zamjenjuje svježu provjeru prava, aktivnog korisnika i sesije. Slanje svim korisničkim sobama sa client-side filtriranjem nije prihvatljivo.

## Implementacijski redoslijed

1. Prvo definisati i testirati uži `groups` ugovor: izvor pouzdanog OU scopea za svaku uspješnu mutaciju uključujući DELETE, uz commit-before-publish, bez korisnički kontrolisanog scopea kao jedinog dokaza. Ne emitovati pri neuspjehu; ne oslanjati se na ponovni lookup izbrisanog resursa. Ispitati konkurentne promjene i ovlaštenja u trenutku slanja.
2. Autorizovati primaoce prema istim pravilima kao odgovarajući REST read, uključujući neaktivan korisnik, opoziv, podređeni OU i service-scoped assignment. Koristiti minimalni invalidacijski signal bez aktera, ID-a i sadržaja; globalnu sobu i privatne settings ostaviti netaknutim. Dizajn mora imati ograničen broj upita/fan-out, fail-closed obradu grešaka i jasnu politiku za opoziv između provjere i isporuke; provjeriti kako se uklapa u postojeći session/room lease.
3. Na klijentu signal postavlja postojeći konzervativni banner, bez automatskog reseta nacrta; eksplicitni REST refresh ostaje izvor istine. Deduplicirati potencijalno dvostruku isporuku globalnom korisniku i provjeriti reconnect/readiness utrke.
4. Svaki ostali domen uvesti tek nakon posebne provjere njegovih read-scope pravila i svih producer putanja. Rollback, personal templates i prelaz scopea ne smiju se tiho proglasiti pokrivenima. Potrebni su prije/poslije regresijski testovi autorizacije i isporuke, stvarni Socket.IO klijenti, CI/generated Prisma i odgovarajući PostgreSQL/Redis testovi, te korisnička browser provjera u primjenjivom okruženju.

Redis adapter ostaje best-effort; nijedan budući signal sam po sebi ne dokazuje durable replay, isporuku tokom outagea ili trenutno uklanjanje svih već poslanih metapodataka. Promjena mora dokumentovati preostale utrke i operativne granice.
