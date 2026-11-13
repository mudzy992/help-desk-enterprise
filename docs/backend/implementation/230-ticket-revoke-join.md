# Ticket revoke/join — implementacija i granice dokaza

**Status:** implementacija u toku; WR-02/03 nisu zatvoreni bez runtime acceptancea. Dopuna [229](229-ticket-refresh-revoke.md), ne zamjena za plan [228](228-websocket-follow-up-plan.md).

Backend nakon lokalne revalidacije postojećeg pretplatnika šalje direktni `ticket.access.invalidated` samo s ID-om tiketa kada se vidljivost promijeni ili revalidacija ne uspije. Sobe se prvo ažuriraju/uklanjaju. Signal nije dokaz trajnog opoziva: i privremeni kvar autorizacije uzrokuje fail-closed, a REST ponovo odlučuje o pristupu. Normalni leave ne šalje ovaj signal. Dostava je best-effort; nedostupan adapter ili prekinut socket ne daju replay.

Klijent po signalu poništava stariji snapshot, blokira događaje i uklanja prethodne podatke, uključujući staff panele. Potom ponavlja REST čitanje i join; 403/404 briše prikaz, prolazna greška je vidljiva. Join ima timeout, potvrdu i retry; nakon ack-a slijedi novi REST snapshot, dok se prvi REST zahtjev i dalje pokreće odmah za prikaz i fallback. Utrka događaja s ranijim snapshotom poništava snapshot i raspoređuje novi refresh. Kasni ackovi se odbacuju nakon reconnecta/promjene tiketa. Presence se uključuje tek nakon potvrđenog joina i samo dok je detalj učitan.

Generacije štite učitavanja i navedene akcije detalja od kasnih upisa nakon promjene tiketa/korisnika ili invalidacije. Composer ne briše novi draft kad raniji send završi nakon promjene identiteta/tiketa ili izmjene teksta. Ako se composer odmontira dok je slanje u toku, sačuvani draft može ostati i nakon uspješnog slanja: prije ponovnog slanja korisnik treba provjeriti razgovor. Session storage je best-effort, nije durable.

Ciljani testovi obuhvataju ack/odbijanje/timeout/retry/reconnect, odbacivanje događaja kada je pristup blokiran, odgođeni snapshot i panel, 403/404/500, kasni claim poslije opoziva/promjene korisnika i draft poslije promjene tiketa. Backend live-socket test proširen je za signal kod staff→public i opoziva. Ovo nisu produkcijski browser ni Redis cross-instance acceptance, niti dokaz svih asinhronih panel-akcija, identitetskih i mrežnih utrka. Posebno provjeriti degradaciju adaptera bez disconnecta, događaje izgubljene prije pretplate i operativnu matricu ponovnog pristupa; nema durable replaya.

Lokalno Prisma generisanje nije uspjelo: pristup `binaries.prisma.sh` završava TLS greškom u sandboxu; backend test i generated-Prisma provjera zato zahtijevaju CI. Nema migracije ni deploymenta. Puni ručni CI/E2E ostaje korisnikov korak.
