# Najave

Najave su obavještenja organizacije (planirani radovi, promjene, važne informacije) koja se prikazuju
kao traka iznad sadržaja aplikacije, a po potrebi i kao prozor koji traži potvrdu čitanja.

## Za sve korisnike
- **Traka** se pojavi kad postoji aktivna najava za vas. Više najava → brojač „1 od 3“ i strelice.
- **„Prikaži detalje“** otvara cijeli tekst.
- **„Zatvori“** sakriva najavu bez potvrde (više se ne prikazuje).
- **„Pročitao/la sam“** potvrđuje najavu koja traži potvrdu; potvrda se bilježi s vremenom.
- **Prozor (modal)** se može zatvoriti tipkom Esc ili dugmetom „Kasnije“ — ne blokira rad. Vraća se pri
  sljedećoj navigaciji najviše 3 puta po prijavi; nakon toga ostaje samo traka.
- **Meni → Najave** prikazuje sve najave iz zadnjih 90 dana i koje ste potvrdili.
- Nova ili povučena najava se pojavi/nestane najkasnije za minutu.

## Za administratore (i agente, ako je dozvoljeno)
1. **Najave → Upravljanje → Nova najava.** Unesite naslov, tekst (podržan jednostavan markdown), težinu,
   početak i kraj (najduže `private.announcements.maxDurationDays`, zadano 90 dana).
2. **Publika:** uloge, organizacione jedinice (sa svim podjedinicama) i grupe. Bez odabira najava ide
   svima; s više filtera korisnik mora zadovoljiti svaki. Editor prikazuje procjenu („≈ 342 korisnika“).
3. **Ponašanje:** potvrda čitanja, prozor (samo uz potvrdu), obavijest u aplikaciji publici kad najava počne.
4. Najava se sprema kao **nacrt**. **Objavi** je čini vidljivom od početka prikaza (ranije je „Zakazana“).
5. **Nakon objave** publika i potvrda čitanja se ne mijenjaju; tekst se može ispraviti (prethodna verzija
   se čuva, a prozor se ponovo prikazuje).
6. **Povuci** (uz razlog) uklanja najavu odmah kod svih korisnika.
7. **Izvještaj:** potvrdilo X od Y (Y = publika u trenutku objave), po jedinicama, lista onih koji nisu
   potvrdili, CSV i dugme „Podsjeti one koji nisu potvrdili“ (najviše jednom u 24 sata).

**Agenti** objavljuju samo ako je uključena postavka `private.announcements.agentsMayPublish`, i to samo
za svoju organizacionu jedinicu i njene podjedinice.

## Postavke (Postavke → Tok rada)
| Ključ | Zadano | Značenje |
|---|---|---|
| `private.announcements.enabled` | isključeno | modul najava |
| `private.announcements.maxDurationDays` | 90 | najduže trajanje jedne najave |
| `private.announcements.agentsMayPublish` | isključeno | agenti objavljuju za svoju OJ |
| `private.announcements.receiptRetentionDays` | 365 | koliko dana nakon kraja se čuvaju potvrde (0 = trajno) |

## Privatnost
Potvrde i zatvaranja ulaze u izvoz podataka nosioca (DSAR). Anonimizacija ih briše, ali broj potvrda
u izvještaju ostaje. Retencija ne briše podatke korisnika pod zakonskim zadržavanjem (legal hold).
