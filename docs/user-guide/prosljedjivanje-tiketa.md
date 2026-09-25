# Prosljeđivanje tiketa — uputstvo za agente

Paket 1.1 · važi od verzije sa migracijom `20260926090000_ticket_forward_event`.

## Kada proslijediti

Kada tiket ne može riješiti vaša grupa, nego druga grupa. To može biti grupa iz iste
organizacione jedinice (OJ) ili iz druge, npr. Zenica → Direkcija. Prosljeđivanje je i
način eskalacije: tiket šaljete grupi koja ima potrebne ovlasti.

## Kako

1. Otvorite tiket i kliknite **Proslijedi** u traci akcija.
2. Odaberite **ciljnu grupu**. Lista je podijeljena na dva dijela:
   - „Ista organizaciona jedinica";
   - „Druge organizacione jedinice". Ovaj dio vidite samo ako imate pravo
     `ticket.forward.cross_ou` i ako je prosljeđivanje u drugu OJ uključeno u postavkama.
3. Po želji odaberite **agenta** ciljne grupe. Ako agenta ne odaberete, tiket čeka u
   sandučiću grupe, a primjenjuje se auto-dodjela te grupe.
4. Upišite **razlog** (zadano najmanje 10 znakova). Razlog vide samo agenti, nikad podnosilac.
5. Ako želite i dalje pratiti tiket, označite **Ostani na tiketu kao posmatrač**.
6. Kliknite **Proslijedi**.

Ako je tiket već bio proslijeđen, u dijalogu se pojavljuje dugme **Vrati grupi …**. Ono
odmah bira grupu od koje je tiket stigao.

## Šta se dešava

| | |
|---|---|
| Dodijeljena grupa | ciljna grupa |
| Dodijeljeni agent | uklanja se (ili odabrani agent ciljne grupe) |
| Status | „Na čekanju" (ili „Dodijeljen" uz odabranog agenta). „Čeka korisnika" ostaje „Čeka korisnika". |
| SLA | rok teče dalje, ne resetuje se |
| Pristup | članovi ciljne grupe rade na tiketu i kad je on iz druge OJ. Vaša grupa ga i dalje vidi kroz svoju OJ, ali ga više nema u sandučiću. |
| Povjerljiv tiket | pristup dobija ciljna grupa. Prethodni agent ga gubi, osim ako ostane posmatrač. |
| Historija | kartica **Historija prosljeđivanja** na detalju tiketa: od → do, OJ, ko, kada, razlog |
| Obavijesti | ciljna grupa (ili odabrani agent), prethodni agent i podnosilac. Podnosilac dobija obavijest bez razloga i bez naziva OJ, a može se isključiti u postavkama. |

Tiket se može proslijediti u statusima Nerutiran, Na čekanju, Dodijeljen, U radu i Čeka
korisnika. Riješen, zatvoren, arhiviran ili spojen tiket se ne može proslijediti.

AGENT prosljeđuje samo tikete svoje trenutne grupe ili tikete koji su dodijeljeni njemu.

## Grupna akcija

„Dodijeli grupi" u grupnoj akciji na listi tiketa radi kao prosljeđivanje. Važe ista
pravila: razlog, pravo za drugu OJ i historija. U historiji takvo prosljeđivanje ima oznaku
„Grupna akcija".

## Postavke (Admin → Postavke → `private.ticket.forwarding.*`)

| Ključ | Zadano | Značenje |
|---|---|---|
| `allowCrossOu` | da | prosljeđivanje u drugu OJ (uz pravo `ticket.forward.cross_ou`) |
| `requireReason` | da | razlog je obavezan |
| `minReasonLength` | 10 | minimalna dužina razloga |
| `keepPreviousHandlersAsWatchers` | ne | prethodni agent automatski ostaje posmatrač |
| `notifyRequester` | da | podnosilac dobija obavijest |

Napomena: uloga **AGENT** podrazumijevano ima pravo `ticket.forward.cross_ou`. Ako
želite da samo određeni agenti prosljeđuju u drugu OJ, uklonite pravo iz uloge ili policy
paketa i dodijelite ga ciljano, s OU opsegom.

## Greške

| Poruka | Uzrok |
|---|---|
| Tiket u ovom statusu nije moguće proslijediti | riješen, zatvoren, arhiviran ili spojen tiket |
| Tiket je već dodijeljen toj grupi | odabrana je trenutna grupa |
| Nemate pravo proslijediti tiket u drugu OJ | nedostaje `ticket.forward.cross_ou` za OJ tiketa ili trenutne grupe |
| Prosljeđivanje u drugu OJ je isključeno | postavka `allowCrossOu` je isključena |
| Unesite razlog prosljeđivanja | razlog je prekratak |
| Odabrani agent nije član ciljne grupe | agent nije član grupe ili nema ulogu AGENT/ADMIN |
