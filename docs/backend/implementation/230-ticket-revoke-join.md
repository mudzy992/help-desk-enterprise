# Ticket revoke/join — implementacija i granice dokaza

**Status:** WR-02/03 zatvoreni odlukom vlasnika uz izričito prihvaćen nedokazan cross-instance/Redis rizik; ovo nije dokaz replaya. Dopuna [229](229-ticket-refresh-revoke.md), ne zamjena za plan [228](228-websocket-follow-up-plan.md).

Backend nakon lokalne revalidacije postojećeg pretplatnika šalje direktni `ticket.access.invalidated` samo s ID-om tiketa kada se vidljivost promijeni ili revalidacija ne uspije. Sobe se prvo ažuriraju/uklanjaju. Signal nije dokaz trajnog opoziva: i privremeni kvar autorizacije uzrokuje fail-closed, a REST ponovo odlučuje o pristupu. Normalni leave ne šalje ovaj signal. Dostava je best-effort; nedostupan adapter ili prekinut socket ne daju replay.

Klijent po signalu poništava stariji snapshot, blokira događaje i uklanja prethodne podatke, uključujući staff panele. Potom ponavlja REST čitanje i join; 403/404 briše prikaz, prolazna greška je vidljiva. Join ima timeout, potvrdu i retry; nakon ack-a slijedi novi REST snapshot, dok se prvi REST zahtjev i dalje pokreće odmah za prikaz i fallback. Utrka događaja s ranijim snapshotom poništava snapshot i raspoređuje novi refresh. Kasni ackovi se odbacuju nakon reconnecta/promjene tiketa. Presence se uključuje tek nakon potvrđenog joina i samo dok je detalj učitan.

Generacije štite učitavanja i navedene akcije detalja od kasnih upisa nakon promjene tiketa/korisnika ili invalidacije. Composer ne briše novi draft kad raniji send završi nakon promjene identiteta/tiketa ili izmjene teksta. Ako se composer odmontira dok je slanje u toku, sačuvani draft može ostati i nakon uspješnog slanja: prije ponovnog slanja korisnik treba provjeriti razgovor. Session storage je best-effort, nije durable.

Ciljani testovi obuhvataju ack/odbijanje/timeout/retry/reconnect, odbacivanje događaja kada je pristup blokiran, odgođeni snapshot i panel, 403/404/500, kasni claim poslije opoziva/promjene korisnika i draft poslije promjene tiketa. Backend live-socket test proširen je za signal kod staff→public i opoziva. Ovo nisu produkcijski browser ni Redis cross-instance acceptance, niti dokaz svih asinhronih panel-akcija, identitetskih i mrežnih utrka. Posebno provjeriti degradaciju adaptera bez disconnecta, događaje izgubljene prije pretplate i operativnu matricu ponovnog pristupa; nema durable replaya.

Lokalno Prisma generisanje nije uspjelo: pristup `binaries.prisma.sh` završava TLS greškom u sandboxu; backend test i generated-Prisma provjera zato zahtijevaju CI. Nema migracije ni deploymenta. Puni ručni CI/E2E ostaje korisnikov korak.

## Browser acceptance i owner-directed zatvaranje

Korisnik je potvrdio frontend i backend deploy `19ec014`: live poruka stigla bez osvježavanja, draft ostao; poruka poslana offline stigla odmah nakon ponovnog povezivanja bez osvježavanja; potpuni opoziv je uklonio prikaz nakon oko 55 sekundi; staff→public provjera prošla; čišćenje završeno. Dvije potvrđene backend instance/Redis su **N/A**, ne prolaz. Korisnik je izričito prihvatio zatvaranje uz ovaj preostali rizik. Vrijeme od 55 sekundi ne dokazuje uzrok invalidacije niti garantuje rok.

CI [43523131275](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43523131275) prošao je code i PostgreSQL/Redis poslove, E2E preskočen. Naknadni korisnikov ciljani [43592370823](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43592370823), `15,55,56,57`, prošao je 13/13 bez flaky; test 15 provjerava admin routing socket, ne ticket cross-instance revoke. Jutarnji full run [43570460686](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43570460686) ostaje failure (113 passed, 7 failed, 7 flaky, 1 skipped), ne prepisuje se kao prolaz.
