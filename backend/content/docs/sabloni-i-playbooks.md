# Šabloni i playbooks

> **Namjena:** modul daje agentu **gotove odgovore** (šabloni) i **checklistu koraka** za propisane postupke
> (playbook). Time se odgovara brže i ujednačenije, bez mijenjanja samog modela tiketa — šabloni i checkliste
> su pomoć pri radu, ne nova pravila toka.

## Čemu služi ovaj modul

- **Šabloni odgovora:** unaprijed napisan tekst (npr. „Reset lozinke – upute“) koji agent ubaci u poruku i
  doradi prije slanja. Šablon može biti za **javni odgovor**, za **internu bilješku** ili za oboje.
- **Popunjavanje podataka:** u tekst se ubacuju dozvoljene varijable (broj tiketa, ime podnosioca, servis,
  rok rješenja…), pa agent ne prepisuje ono što sistem zna.
- **Lični šabloni:** agent može sačuvati i svoj šablon (vidi ga samo on), pored zajedničkih.
- **Playbook (checklista):** spisak koraka za servis ili kategoriju (npr. „Novi korisnik – otvaranje naloga“).
  Na tiketu se vidi napredak, ko je koji korak štiklirao i kada; korak može voditi na članak baze znanja ili
  na šablon odgovora.
- **Obavezni koraci:** administrator bira šta se dešava kad agent rješava tiket s otvorenim obaveznim
  koracima — ništa, upozorenje ili blokada.

## Kome je namijenjen

| Rola | Šta radi |
|---|---|
| **Agent** | Ubacuje šablone u poruke, čuva svoje šablone, veže playbook na tiket, štiklira korake i (u režimu upozorenja) potvrđuje rješavanje sa otvorenim koracima. |
| **ADMIN** | Uređuje **zajedničke** šablone i playbookove, bira opseg (servis, kategorija, grupa), uključuje automatsko vezivanje i režim obaveznih koraka. Ako je vezan na određene servise, ne može praviti šablone za druge servise niti globalne. |
| **SUPER_ADMIN** | Kao administrator, bez ograničenja opsega. |
| **Korisnik (naručilac)** | Ne vidi šablone ni checklistu; checklista je interna, a odgovor dobija kao običnu poruku. |

## Kako doći

1. **Šabloni u poruci:** na tiketu, u okviru za pisanje poruke → dugme **Šabloni** (lista se filtrira prema
   načinu: odgovor ili interna bilješka).
2. **Sačuvaj kao šablon:** u okviru za pisanje, poslije napisane poruke → **Sačuvaj kao šablon**.
3. **Administracija šablona i playbookova:** meni **Administracija** → **Šabloni** (tabovi **Šabloni** i
   **Playbookovi**), nove stavke preko **Novi šablon** / **Novi playbook**.
4. **Checklista na tiketu:** desna strana detalja tiketa → kartica **Playbook**.

## Korak po korak

### 1. Ubacivanje šablona u odgovor (agent)

1. Otvorite tiket i u okviru za poruku kliknite **Šabloni**.
2. Izaberite način pisanja (**Odgovor** ili **Interna bilješka**) — lista prikazuje samo šablone koji tome
   odgovaraju.
3. Pretražite po nazivu, tekstu ili oznaci; šabloni koji odgovaraju **ovom tiketu** su na vrhu (servis, pa
   kategorija, pa grupa), a ostali samo ako uključite **Prikaži sve**.
4. Klik na šablon ubacuje tekst i popunjava varijable.
5. **Provjerite tekst prije slanja.** Ako neka varijabla nema vrijednost, polje ostaje prazno i sistem vas na to
   upozorava (spisak nedostajućih podataka).
6. Pošaljite poruku kao i obično.

### 2. Čuvanje svog šablona (agent)

1. Napišite poruku u okviru za pisanje.
2. Kliknite **Sačuvaj kao šablon**, upišite naziv i (opcionalno) oznake.
3. Šablon je **lični** — vidite ga samo vi, i možete ga mijenjati ili obrisati bez uticaja na zajedničke.

### 3. Uređivanje zajedničkog šablona (administrator)

1. **Administracija** → **Šabloni** → **Novi šablon** ili klik na postojeći.
2. Upišite naziv, tijelo na **bosanskom** (obavezno) i po potrebi na **engleskom**.
3. Izaberite **tip**: javni odgovor, interna bilješka ili oboje.
4. Dodajte **opseg** (servisi, kategorije, grupe); bez opsega šablon je globalan.
5. Koristite samo **dozvoljene varijable** — pomoćnik prikazuje listu i odbija nepoznate.
6. Provjerite **pregled** (desno) i sačuvajte uz **razlog** (upisuje se u reviziju).

### 4. Playbook (administrator)

1. **Administracija** → **Šabloni** → tab **Playbookovi** → **Novi playbook**.
2. Upišite naziv i opis, dodajte **korake**: naslov, uputu, obavezan korak (da/ne), opcionalno članak baze
   znanja i šablon odgovora.
3. Poredajte korake i sačuvajte uz razlog.
4. Izaberite da li je playbook aktivan i na koje servise/kategorije se odnosi.

### 5. Checklista na tiketu (agent)

1. Ako je playbook automatski vezan (servis se poklapa i **tačno jedan** playbook odgovara), otvara se sam;
   inače ga izaberite u kartici **Playbook** → **Veži playbook**.
2. Štiklirajte korake kako ih obavljate; vidi se napredak i ko je šta završio.
3. Ako je playbook dobio novu verziju, kartica nudi **Nadogradi** — već štiklirani koraci ostaju završeni.
4. Ako želite drugi playbook, prvo ga **odvojite** (uz razlog).

### 6. Rješavanje tiketa sa obaveznim koracima

1. Režim određuje administrator: **isključeno**, **upozorenje** ili **blokada**.
2. Kod **upozorenja**, kad pokušate prebaciti tiket u **Riješeno**, dijalog prikazuje koje obavezne korake još
   niste štiklirali i traži potvrdu.
3. Kod **blokade**, promjena se odbija i prikazuje tačan spisak otvorenih koraka (i za više tiketa kod bulk
   promjene).

## Polja, validacije i statusi

### Šablon

| Polje | Pravilo |
|---|---|
| **Naziv** | 2–120 znakova; jedinstven među šablonima istog vlasnika |
| **Tijelo (bosanski)** | Obavezno, najviše 10 000 znakova |
| **Tijelo (engleski)** | Opcionalno; ako ne postoji, koristi se bosanski |
| **Tip** | Javni odgovor, interna bilješka ili oboje |
| **Opseg** | Servisi, kategorije i/ili grupe; prazno = globalno |
| **Oznake** | Najviše 10 oznaka, do 40 znakova svaka |
| **Aktivan** | Neaktivan šablon se ne nudi u ponudi (pickeru) |
| **Razlog** | Obavezan za zajedničke šablone (3–500 znakova) |

### Dozvoljene varijable

`ticketNumber`, `ticketTitle`, `ticketUrl`, `serviceName`, `categoryName`, `groupName`, `statusLabel`,
`priorityLabel`, `requesterName`, `requesterFirstName`, `agentName`, `agentFirstName`,
`organizationalUnitName`, `slaResolutionDue`, `appName`, `today`.

Nepoznato ime se **odbija** pri čuvanju, a ako se nađe u starom šablonu, ostaje doslovno i prikazuje se kao
upozorenje. Varijabla bez vrijednosti postaje prazna i prijavljuje se prije slanja.

### Playbook

| Polje | Pravilo |
|---|---|
| **Naziv** | 2–120 znakova, jedinstven |
| **Opis** | Najviše 2 000 znakova |
| **Koraci** | 1–50; naslov do 200, uputa do 4 000 znakova |
| **Obavezan korak** | Samo obavezni koraci ulaze u provjeru pri rješavanju |
| **Verzija** | Raste kad se koraci promijene; tiket pamti verziju na kojoj je vezan |
| **Aktivan** | Neaktivan se ne može vezati na tiket |

### Režimi obaveznih koraka

| Režim | Ponašanje pri prelasku u **Riješeno** ili **Zatvoreno** |
|---|---|
| **Isključeno** | Nema provjere |
| **Upozorenje** | Dijalog prikazuje otvorene obavezne korake i traži potvrdu |
| **Blokada** | Promjena se odbija dok koraci nisu štiklirani (poruka sadrži spisak koraka) |

### Poruke grešaka koje možete sresti

| Poruka | Značenje |
|---|---|
| Naziv je već zauzet | Postoji šablon ili playbook istog naziva kod istog vlasnika |
| Nepoznata varijabla | U tekstu je ime koje nije na listi dozvoljenih |
| Nemaš pravo na ovaj opseg | Zajednički šablon van servisa na koje ste ograničeni |
| Već postoji playbook na tiketu | Prvo odvojite trenutni playbook |
| Obavezni koraci nisu završeni | Blokada pri rješavanju; spisak je u poruci |
| Playbook je već ažuran | Verzija na tiketu je ista kao u playbooku |

## Česta pitanja i greške

- **„Šablon koji tražim nije u listi.“** — provjerite: je li šablon **aktivan** i da li mu se **opseg**
  poklapa sa servisom/kategorijom/grupom tiketa; probajte **Prikaži sve** i pretragu po tekstu.
- **„Ne mogu sačuvati zajednički šablon.“** — trebate pravo upravljanja šablonima; ako ste ograničeni na
  servise, ne možete praviti globalni šablon ni šablon za tuđe servise.
- **„Zašto mi tekst nije popunjen?“** — varijabla nema vrijednost na tom tiketu (npr. nema dodijeljene grupe
  ili SLA roka); sistem prikazuje spisak praznih polja, a vi ih dopunite ručno.
- **„Sistem me zaustavlja pri rješavanju.“** — uključena je blokada obaveznih koraka; štiklirajte navedene
  korake ili zamolite administratora da promijeni režim.
- **„Checklista se promijenila pod rukama.“** — ne mijenja se sama: tiket čuva kopiju koraka. Nova verzija se
  preuzima samo kad kliknete **Nadogradi**.
- **„Korisnik vidi našu checklistu?“** — ne; koraci i sistemski događaji checkliste vidljivi su samo osoblju.
- **„Nakon izmjene šablona stari odgovori?“** — poslane poruke zadržavaju tekst koji je poslan; izmjena
  šablona utiče samo na buduće ubacivanje.

## Poznata ograničenja

- **Šablon se provjerava u trenutku slanja, ne samo pri odabiru.** Deaktiviran šablon, tuđi šablon ili šablon
  pogrešne vrste (npr. interni kao javni odgovor) server odbija kodovima `RESPONSE_TEMPLATE_NOT_FOUND`,
  `RESPONSE_TEMPLATE_INACTIVE` i `RESPONSE_TEMPLATE_KIND_MISMATCH`; brojač korištenja raste **samo** kad je
  odgovor zaista poslan s tim šablonom.

- **Ponuda šablona filtrira opseg i redoslijed u upitu.** Pregled traži samo šablone koji odgovaraju tiketu
  (globalni ili po servisu, kategoriji i grupi), sortira ih po korištenju i nazivu i čita najviše 200; šabloni
  vezani za drugi opseg dolaze samo uz „prikaži sve“. Lista playbookova se čita po nazivu. (Nalaz B2 —
  zatvoren u valu 3.)
- **Jedinstvenost naziva nije zaštićena u bazi**, samo provjerom u aplikaciji; dva istovremena upisa mogu dati
  duplikat. (Nalaz B3.)
- **Playbook se veže automatski samo pri kreiranju tiketa** — tiketi koji su već u toku dobijaju checklistu
  samo ručno, po tiketu. (Nalaz B4.)
- **Statistika upotrebe šablona raste i kad poruka nije upisana** (broji se prije upisa). (Nalaz B5.)
- **Automatsko zatvaranje i spajanje tiketa ne prolaze provjeru obaveznih koraka** — namjerno, jer tada ne
  djeluje agent.

## Povezani moduli

- **Tiketi** — poruke, promjena statusa i tok tiketa; odatle se šabloni koriste i checklista prati.
- **Baza znanja** — korak playbooka može voditi na članak.
- **Postavke** — uključivanje šablona i playbookova, automatsko vezivanje i režim obaveznih koraka.
- **Verzije konfiguracije** — zajednički šabloni i playbookovi ulaze u snimku (lični nikad).
- **SLA** — rok rješenja je jedna od varijabli u šablonu.

---

*Ažurirano: 2026-10-03 · Modul: Šabloni i playbooks (M13)*
