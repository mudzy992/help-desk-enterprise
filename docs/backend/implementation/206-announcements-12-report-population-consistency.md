# BA-announcements-12: report ne miješa publish, trenutnu i historijsku populaciju

Status: **otvoreno** (implementirano; čeka CI i operativnu potvrdu vlasnika S1–S2). Report je prikazivao „Potvrdilo X od Y (Z %)" gdje je X bio ukupan historijski broj potvrda (uključujući korisnike koji su u međuvremenu izašli iz publike i Anonimizovan potvrde), a Y veličina publike u trenutku objave — brojilac i nazivnik opisuju različite populacije, pa procenat nije bio vremenski konzistentan (mogao je preći 100 % stvarne pokrivenosti, a korisnik koji je izašao iz publike ostajao je u brojilu, ali nije bio ni u pending listi ni u unit breakdownu). Manage lista je prikazivala isti miješani omjer.

## Izmjena

Bez migracije. Svaka brojka u reportu sada pripada tačno jednoj populaciji:

- **Headline omjer** dijeli istu populaciju samom sobom: novi `acknowledgedInCurrentAudience` (korisnici koji su i sada u publici i potvrdili su) kroz `currentAudienceSize`. Vrijedi tačna particija `acknowledgedInCurrentAudience + pendingCount = currentAudienceSize`; i `byUnit` redovi sabiraju se u iste totale.
- `acknowledgedCount` ostaje **ukupni historijski** broj (svi ack zapisi + `anonymizedAcknowledgements`) i više se nigdje ne koristi kao brojilac omjera; novi `acknowledgedOutsideCurrentAudience` (= ukupno − unutar trenutne publike) prikazuje se zasebnom napomenom kad je > 0 („potvrde korisnika koji više nisu u sadašnjoj publici").
- `audienceSizeAtPublish` ostaje informativni snapshot broj u napomeni, ne nazivnik.
- Manage lista: kolona „Potvrdilo" prikazuje samo ukupan historijski broj potvrda, bez „/ publish size" omjera; konzistentan omjer živi u reportu.
- CSV export je i prije bio konzistentan (red po članu trenutne publike s njegovim vremenom potvrde) i nije mijenjan.

Immutable membership snapshot pri publishu (da omjer ikada bude tačan prema trenutku objave, a ne samo interno konzistentan) ostaje zaseban nalaz `BA-announcements-13` i nije dio ovog paketa.

## Testovi i granice

Backend: novi `announcements.report.spec.ts` — kontrolisani presjek (publish 10, trenutna publika 8, ack unutar publike 5, pending 3, historijski ukupno 8, van publike 3) dokazuje particiju i razdvojene totale, uključujući unit redove. Frontend: `announcement-report-dialog.spec.tsx` — headline koristi trenutnu publiku, a napomena o bivšim članovima publike se prikazuje. Lokalno: backend announcements suite (osim preegzistirajućeg stub-limited delivery test) + ESLint; frontend announcements testovi + `tsc --noEmit` + Prettier. Lokalni Jest stub nije generated-Prisma dokaz; CI na pushu je autoritet.

## Operativna potvrda (S1–S2)

Preduslov: redeploy svježeg builda (API + frontend).

| ID | Koraci | Očekivano |
| --- | --- | --- |
| S1 | Otvori **Najave → Izvještaj** (dugme izvještaja na nekoj objavljenoj najavi koja traži potvrdu i ima potvrde). | Na vrhu piše „Potvrdilo X od Y (Z %)" gdje je Y **sadašnja** publika; ispod stoji napomena s brojem publike u trenutku objave. Z % nikad ne prelazi 100. |
| S2 | Na istoj listi najava pogledaj kolonu **„Potvrdilo"**. | Prikazuje samo jedan broj (ukupne potvrde), bez „/ N" dijela. Ako najava ima potvrde od korisnika koji više nisu u publici, u izvještaju se vidi i napomena o tim potvrdama. |

Odgovor: `S1: DA/NE, S2: DA/NE` + opis odstupanja ako ih ima. Bez CI dokaza i operativne potvrde nalaz se ne zatvara.
