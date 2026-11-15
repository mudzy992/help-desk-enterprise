# Paket 228 — browser i Redis acceptance matrica

**Status: pripremljeno, nije izvedeno.** Ne miješati determinističke frontend testove, realni Redis integration test i korisnički browser/produkcijski dokaz. Testirati tek nakon korisnikovog mergea i redeploya frontend/backend commita s ovim dokumentom; ne prekidati produkcijski Redis. Koristiti dva testna računa, testni tiket i testni zajednički šablon; `Označi sve` utiče na SVA nepročitana obavještenja tog računa. Scope promjene uloga nisu potrebne. Ako testni računi, prava ili šabloni nisu dostupni, stavku označiti N/A, ne mijenjati realne podatke. Postojeći dnevni run 43690144762 na a9badeb ima uspješan critical flow, ali ne dokazuje kasnije commitove ni ovu matricu.

| ID | Scenarij | Dokaz / očekivani rezultat | Status |
| --- | --- | --- | --- |
| N1 | Otvoren inbox prima javni odgovor drugog testnog računa | Nova obavijest o testnom tiketu pojavljuje se bez ručnog refresha, nema duplikata; brojač nakon kratkog smirivanja odgovara nepročitanim | Nije izvedeno |
| N2 | Nepročitane + Označi sve | Na testnom računu filter prikazuje samo nepročitane; nakon akcije i završetka osvježavanja stari redovi nestaju. Nova poruka nakon akcije ostaje nepročitana. | Nije izvedeno |
| N3 | Skriven tab i gubitak browser veze | Vratiti online i otvoriti panel, provjeriti testnu promjenu i brojač kroz REST catch-up; bez tvrdnje da su izgubljeni događaji replayani. | Nije izvedeno |
| N4 | Cursor pagination ako postoji dovoljno historije | U Sve kliknuti Učitaj starija obavještenja; redovi se ne dupliciraju, novi događaj ne briše prethodno vidljive; nije simulacija svake snapshot utrke. | Nije izvedeno / N/A ako nema više stranica |
| A1 | Isti administrator, dva taba i nespremljeni nacrt | Izmjena testnog zajedničkog šablona u tabu B izaziva banner u A; nacrt ostaje do eksplicitnog osvježavanja; warning upozorava na gubitak. | Nije izvedeno |
| A2 | Ponovno spajanje dok je editor otvoren | Po povratku online prikazati neutralni banner o mogućim promjenama; nacrt ostaje. | Nije izvedeno |
| R1 | Dvije dokazivo različite backend instance + Redis | Izolovan test sa poznatom rutom klijenta na A i emitom na B, dokaz sa instance ID-ima/logovima bez ličnih podataka; bez broja instance nije cross-instance dokaz. | Nije izvedeno / N/A ako nije raspoloživo |
| R2 | Redis prekid i oporavak | Samo zasebno izolovano testno okruženje i odobren kontrolisani postupak. U produkciji ne isključivati Redis; nakon povratka potvrditi REST stanje, ne obećavati isporuku događaja tokom prekida. | Nije izvedeno / N/A |

**Šta dokazi ne znače:** Socket.IO/Redis adapter je best-effort, ne durable replay. Test 59 i Redis integration pokrivaju pojedinačne putanje, ne kompletnu matricu. Puni kritični flow je korisnikov odvojeni korak, a ne ručno pokretanje od asistenta. Treba zabilježiti commit deploya, preglednik, DA/NE/N/A po ID-u, vrijeme oporavka, rezultat čišćenja i sigurno redigovan opis greške bez tokena i ličnih podataka.

## Korisnička provjera — prijavljeni rezultati

Korisnik je prijavio: N1 nova notifikacija stiže, ali dok je račun A u detalju tiketa otvoreni panel privremeno pokaže dva reda; nakon zatvaranja i ponovnog otvaranja ostane jedno nepročitano i brojač je uredan. Van detalja tiketa prikazuje se jedan red. N2 uredno; za N3 korisnik je naveo da je po vraćanju **računa B** online obavještenje stiglo — ne pretpostavljati da je time izvršen tačno planirani offline test računa A. N4 N/A; A1 i A2 uredno; R1/R2 N/A. Korisnik nije naveo SHA stvarnog deploya ni posebno potvrdio čišćenje; ne izmišljati ih. N1 ostaje otvoren do ponovne provjere. Odvojeno je reproducirana moguća EDGE putanja u [233](233-edge-notification-recipient-isolation.md); identitet te putanje kao uzroka korisnikovog opažanja zahtijeva ponovnu live provjeru.
