# BA-on-call-07: iCal feed poštuje trenutnu permisiju i scope

Status: **otvoreno** (ranija operativna potvrda povučena: korisnik je naknadno prijavio da testove nije izveo jer sekcija nije pronađena po prvobitnom uputstvu — iCal kartica je na stranici Moje notifikacije, ne na Dežurstvima; ispravljeni koraci su izdati i potvrda se čeka ponovo). Automatski CI `42861541883` za commit `6610f3c` prošao je uspješno (generated Prisma + stvarni PostgreSQL). Javni iCal feed je uz bearer token provjeravao samo da je korisnik aktivan i da ima bilo koju staff rolu, pa je URL nastavio raditi i nakon što se korisniku ukine `oncall.read` ili suzi OU scope — calendar klijent je i dalje dobijao smjene, uključujući grupe izvan novog scopea.

## Izmjena

`icalFeed` sada pri svakom dohvatu iznova izvodi trenutno ovlaštenje korisnika: `loadPrincipalContext` (isti izvor kao session guard) + `onCallViewerFromContext`. Ako korisnik više nema `oncall.read`, feed vraća uniformni 404 (`null`) kao i za nevažeći token; događaji se dodatno filtriraju na grupe unutar trenutnog read scopea, pa sužavanje scopea uklanja strane grupe iz feeda bez rotacije tokena. Token, hash pohrana i postojeće provjere aktivnosti/anonimizacije se ne mijenjaju.

## Testovi i granice

Novi `on-call.service.ical.spec.ts` pokriva globalni read (sve grupe), revoke permisije (404), OU sužavanje (strana grupa nestaje iz feeda) i SUPER_ADMIN bez eksplicitnih assignmenta. Provjera se radi pri svakom fetchu, pa je efekt vidljiv najkasnije pri sljedećem osvježavanju calendar klijenta (tipično ~1 h) — feed ne može aktivno obrisati već preuzete događaje iz klijenta. Automatski CI `42861541883` za `6610f3c` prošao je uspješno; bez operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
