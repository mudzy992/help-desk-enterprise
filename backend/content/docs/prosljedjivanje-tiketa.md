# Prosljeđivanje tiketa — uputstvo za agente

> Paket 1.1 · važi od verzije sa migracijom `20260926090000_ticket_forward_event`.

## Čemu služi ovaj modul

Prosljeđivanje šalje tiket grupi koja ga može riješiti — iz iste ili iz druge organizacione jedinice (OJ),
npr. Zenica → Direkcija. To je i način eskalacije: tiket šaljete grupi koja ima potrebne ovlasti.

## Kome je namijenjen

- **Agentima (AGENT)** — prosljeđuju tikete svoje trenutne grupe ili tikete koji su dodijeljeni njima.
- **Noslocima prava `ticket.forward.cross_ou`** — mogu proslijediti u drugu OJ (uz uključenu postavku
  `allowCrossOu`). Naloga: uloga **AGENT** podrazumijevano ima to pravo.
- **Svim agentima s pristupom tiketu** — prosljeđivanje unutar iste OJ ne traži posebno pravo.

## Kako doći

- **Proslijedi:** otvorite tiket → **Proslijedi** u traci akcija.
- **Vrati grupi:** isto dugme u dijalogu, kad je tiket već bio proslijeđen — **Vrati grupi …**.
- **Grupna akcija:** na listi tiketa označite tikete → **Dodijeli grupi**.
- **Historija:** kartica **Historija prosljeđivanja** na detalju tiketa.

## Korak po korak

### Prosljeđivanje jednog tiketa

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

### Dodjela kolegi iz iste grupe

Zasebno dugme „Dodijeli" više ne postoji. Otvorite **Proslijedi**, odaberite prvu stavku
„(trenutna grupa — preraspodjela kolegi)", zatim odaberite kolegu. Razlog nije obavezan,
podnosilac ne dobija obavijest, a u historiji se takav unos vidi s oznakom „Preraspodjela".

### Grupna akcija

„Dodijeli grupi" u grupnoj akciji na listi tiketa radi kao prosljeđivanje. Važe ista
pravila: razlog, pravo za drugu OJ i historija. U historiji takvo prosljeđivanje ima oznaku
„Grupna akcija".

### Šta se dešava poslije prosljeđivanja

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

## Polja, validacije i statusi

**Kada se tiket može proslijediti:** u statusima Nerutiran, Na čekanju, Dodijeljen, U radu i Čeka korisnika.
Riješen, zatvoren, arhiviran ili spojen tiket se **ne može** proslijediti.

**Ko smije:** AGENT prosljeđuje samo tikete svoje trenutne grupe ili tikete koji su dodijeljeni njemu.

**Postavke (Admin → Postavke → `private.ticket.forwarding.*`):**

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

## Česta pitanja i greške

| Poruka | Uzrok |
|---|---|
| Tiket u ovom statusu nije moguće proslijediti | riješen, zatvoren, arhiviran ili spojen tiket |
| Tiket je već dodijeljen toj grupi | odabrana je trenutna grupa |
| Nemate pravo proslijediti tiket u drugu OJ | nedostaje `ticket.forward.cross_ou` za OJ tiketa ili trenutne grupe |
| Prosljeđivanje u drugu OJ je isključeno | postavka `allowCrossOu` je isključena |
| Unesite razlog prosljeđivanja | razlog je prekratak |
| Odabrani agent nije član ciljne grupe | agent nije član grupe ili nema ulogu AGENT/ADMIN |

- **„Gdje da dodijelim tiket kolegi iz iste grupe?“** — Dugme **Proslijedi** → prva stavka
  „(trenutna grupa — preraspodjela kolegi)".
- **„Podnosilac je vidio razlog?“** — Ne: razlog vide samo agenti; podnosilac dobija obavijest bez razloga i
  bez naziva OJ (i tu obavijest može isključiti u postavkama).
- **„SLA se resetovao?“** — Ne, rok teče dalje.

## Poznata ograničenja

- **AGENT prosljeđuje samo tikete svoje trenutne grupe ili tikete dodijeljene njemu.**
- **Riješen, zatvoren, arhiviran ili spojen tiket se ne može proslijediti.**
- **SLA rok se ne resetuje** prosljeđivanjem.
- **Povjerljiv tiket:** pristup dobija ciljna grupa, a prethodni agent ga gubi osim ako ostane posmatrač.
- **Zasebno dugme „Dodijeli" ne postoji** — preraspodjela kolegi ide kroz **Proslijedi**.
- **Podsjetnik:** prosljeđivanje u drugu OJ traži i pravo i uključenu postavku `allowCrossOu`; bez jednog od
  toga opcija se ne prikazuje (ili je odbijena uz poruku iz tabele iznad).

## Povezani moduli

- Tiketi (statusi, povjerljivi tiketi, grupne akcije): `tiketi.md`
- Uloge i permisije (pravo `ticket.forward.cross_ou`, policy paketi): `uloge-i-permisije.md`
- SLA (rok teče dalje poslije prosljeđivanja): `sla.md`
- Korisnici, organizacione jedinice i grupe (članstvo u ciljnoj grupi): `korisnici-oj-i-grupe.md`
- Dizajn paketa: `docs/plans/modules/1.1-prosljedjivanje-tiketa.md`
