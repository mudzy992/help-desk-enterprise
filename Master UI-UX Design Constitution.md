# EP-HelpDesk — Master UI/UX Design Constitution

> **Source of truth** za sav UI/UX ovog projekta. Globalna/template pravila (Apple-linear, one-page, generički SaaS dashboard) ne važe. Tokeni su u `.cursor/docs/theme.md`. Ticket status i priority labele dolaze iz `RAW_PROJECT_EPHELPDESK.md` / domain modela — ovaj dokument definiše vizuelni tretman, ne drugačiji vokabular.

Ova pravila definišu vizuelni i UX smjer cijelog EP-HelpDesk frontenda.

Ovo NIJE generički SaaS dashboard i NIJE redesign u stilu jednog konkretnog proizvoda.

EP-HelpDesk je enterprise HelpDesk / IT Service Management aplikacija koju korisnici i support operateri koriste svakodnevno za rad sa ticketima, korisnicima, organizacijskom hijerarhijom, routingom, knowledge base sadržajem i statusima obrade.

Cilj je napraviti interfejs koji djeluje kao ozbiljan, moderan i premium enterprise proizvod.

---

# 1. DESIGN NORTH STAR

Primarni cilj:

**"Maximum operational clarity with minimum visual noise."**

Korisnik mora u svakom trenutku razumjeti:

- gdje se nalazi,
- šta trenutno obrađuje,
- šta zahtijeva njegovu pažnju,
- koji je status,
- šta može uraditi sljedeće,
- ko je odgovoran,
- šta se promijenilo.

Interfejs treba izgledati kao proizvod koji je dizajnirao iskusan enterprise product-design tim, a ne kao generički admin template.

---

# 2. VISUAL PERSONALITY

EP-HelpDesk treba biti:

- profesionalan
- precizan
- moderan
- smiren
- pouzdan
- informacijski jasan
- operativno brz
- enterprise
- diskretno premium

Ne treba biti:

- razigran
- gaming-like
- futuristički bez razloga
- pretjerano korporativan
- vizuelno bučan
- pretjerano šaren
- "AI-looking"
- pretjerano minimalistički do gubitka informacija

Vizuelni identitet treba komunicirati:

**"Ovo je sistem u kojem ozbiljan tim upravlja stvarnim poslovnim problemima."**

---

# 3. DESIGN REFERENCES

Koristi sljedeće proizvode kao REFERENTNE TAČKE kvaliteta:

- Linear — information hierarchy, spacing, keyboard-first interaction, restrained visual language
- Vercel — typography, whitespace, compositional discipline
- Stripe — structured information presentation and enterprise clarity
- Raycast — command-oriented interaction and operational speed
- Intercom — support/ticket workflow clarity
- Zendesk — mature HelpDesk information architecture

VAŽNO:

Ne kopirati vizuelni identitet nijednog od njih.

Ne praviti "Linear clone".

Koristiti njihove principe, ne njihov branding.

EP-HelpDesk mora imati vlastiti identitet.

---

# 4. PRODUCT-FIRST DESIGN

Prije dizajniranja bilo kojeg ekrana pitaj:

1. Ko koristi ovaj ekran?
2. Koji je njegov primarni posao?
3. Koja informacija mu je najvažnija?
4. Koja akcija je najčešća?
5. Koja akcija je opasna?
6. Koji status mora biti odmah vidljiv?
7. Koje informacije mogu biti progressive disclosure?
8. Koliko dugo će korisnik provoditi vrijeme na ovom ekranu?

Nemoj koristiti isti layout za:

- Dashboard
- Ticket list
- Ticket details
- Create ticket
- Knowledge Base
- Users
- Organizational Units
- Routing
- Settings

Svaki ekran mora biti dizajniran prema svom poslu.

---

# 5. INFORMATION HIERARCHY

Prioritet:

1. Primary task
2. Current state
3. Critical information
4. Primary action
5. Secondary information
6. Metadata
7. Advanced actions

Nikada nemoj dozvoliti da sekundarni elementi vizuelno nadjačaju primarni task.

Ako korisnik otvori ticket, ticket je glavni sadržaj.

Ako korisnik kreira ticket, forma je glavni sadržaj.

Ako korisnik upravlja routing pravilima, routing struktura je glavni sadržaj.

---

# 6. LAYOUT

Preferiraj:

- stabilan application shell
- sidebar
- top/header controls gdje su potrebni
- content area
- jasno definisane sekcije
- konzistentne širine
- predvidivu hijerarhiju

Ne koristi:

- ogromne hero sekcije unutar aplikacije
- nepotrebno centriranje svega
- prevelike prazne prostore
- random grid rasporede
- ornamentalne sekcije

Desktop layout treba biti optimiziran za svakodnevni enterprise rad.

---

# 7. SIDEBAR

Sidebar treba biti:

- kompaktan
- stabilan
- vizuelno tih
- lako skenabilan
- hijerarhijski jasan

Primarna navigacija treba jasno razlikovati:

- Dashboard
- Tickets
- Knowledge Base
- Users
- Organizational Units
- Routing / Administration
- Settings

Ako određena sekcija ima podmodule, koristi jasnu hijerarhiju.

Active state treba biti očigledan, ali ne agresivan.

Izbjegavati:

- ogromne active backgrounds
- gradient active states
- excessive pills
- nepotrebne animacije

Sidebar mora djelovati kao alat, ne kao dekoracija.

---

# 8. DASHBOARD

Dashboard nije BI dashboard.

Njegova svrha je:

**"Šta se trenutno dešava i šta moram uraditi?"**

Dashboard treba odgovoriti na:

- Koliko je otvorenih ticketa?
- Šta čeka moju pažnju?
- Šta je overdue?
- Šta je nedavno promijenjeno?
- Koji ticketi zahtijevaju akciju?
- Kakav je trenutni workload?
- Postoje li problemi sa routingom ili sistemom?

KPI kartice koristiti samo kada imaju operativnu vrijednost.

Ne praviti dashboard sa:

- 12+ KPI kartica
- nepotrebnim donut chartovima
- dekorativnim grafovima
- ogromnim brojevima bez konteksta

Preferirati:

- actionable lists
- recent activity
- ticket queues
- status summaries
- compact metrics
- workload indicators

---

# 9. TICKET LIST

Ticket list je jedan od najvažnijih ekrana aplikacije.

Mora biti:

- brz za skeniranje
- informacijski gust
- stabilan
- lako filtriran
- lako sortiran
- keyboard-friendly gdje ima smisla

Preferirati structured table/list pristup umjesto velikih cardova.

Tipičan red može sadržavati:

- Ticket ID
- Subject
- Status
- Priority
- Requester
- Assignee
- Organization / OU
- Updated
- SLA / relevantni indikator

Vizuelni prioritet:

Subject > status/priority > ownership > metadata.

Ne pretvarati svaki ticket u zaseban "modern card".

---

# 10. TICKET DETAILS

Ticket details treba biti centralni UX element aplikacije.

Predložena struktura:

HEADER

- Ticket ID
- Subject
- status
- priority
- ownership
- primary actions

MAIN CONTENT

- conversation / description
- comments
- attachments
- relevant context

SIDEBAR / SECONDARY PANEL

- requester
- organization / OU
- assignee
- routing information
- metadata
- timestamps

Ticket mora djelovati kao radni prostor.

Ne koristiti dekorativne cardove za svaki metadata element.

Koristi:

- sections
- dividers
- compact metadata
- grouped fields
- subtle surfaces

---

# 11. TICKET STATUS

Status mora biti semantički jasan.

Status nije dekoracija.

Koristi konzistentan semantic system (labele iz RAW / domain modela):

- Pending
- Assigned
- In Progress
- Waiting for User
- Resolved
- Closed

Status vizualizacija treba biti:

- dovoljno vidljiva
- dovoljno kompaktna
- konzistentna kroz cijelu aplikaciju

Pills su dozvoljeni za:

- status
- priority
- tags
- filters

Ne koristiti pills za sve.

---

# 12. PRIORITY

Priority mora imati jasnu vizuelnu semantiku.

Labele (iz RAW / domain modela):

- Low
- Medium
- High
- Critical

Critical mora biti jasno vidljiv, ali ne smije cijeli ekran izgledati kao alarm.

Semantic color koristiti štedljivo.

Crvena treba značiti stvarnu opasnost ili potrebu za hitnom akcijom.

---

# 13. CREATE TICKET

Create Ticket flow mora biti izuzetno čist.

Ne praviti formu koja izgleda kao admin konfiguracioni ekran.

Korisnik treba imati jasan flow:

1. requester/context
2. service (katalog) + impact/urgency
3. subject
4. description
5. schema-driven polja servisa
6. attachments
7. KB suggestions/intercept
8. submit

KB intercept je obavezan dio UX-a.

Knowledge Base prijedlozi trebaju pomoći korisniku prije kreiranja ticketa, a ne izgledati kao prepreka.

KB rezultati trebaju biti:

- relevantni
- brzo skenabilni
- lako otvorivi
- jasno odvojeni od samog submit procesa

---

# 14. KNOWLEDGE BASE

Knowledge Base treba izgledati kao produktivni knowledge system, ne kao običan CRUD.

Prioritet:

- search
- categories
- articles
- relevance
- freshness
- discoverability

Search mora biti prominentan.

Article page treba imati odličnu tipografsku hijerarhiju.

Izbjegavati:

- ogromne card gridove
- dekorativne ilustracije
- nepotrebne gradients
- pretjerano velike naslove

---

# 15. USERS

Users ekran treba biti enterprise directory, ne profile-card gallery.

Preferirati:

- table/list
- avatar + name
- email
- role
- department/OU
- status
- last activity gdje je relevantno

Avatar je metadata, ne primarni vizuelni element.

---

# 16. ORGANIZATIONAL UNITS

OU struktura mora imati izrazito jasnu hijerarhiju.

Koristi:

- tree views
- indentation
- expand/collapse
- hierarchy indicators
- contextual actions

Ne pokušavati predstavljati organizacijsku strukturu kao grid kartica.

Korisnik mora odmah razumjeti parent/child odnose.

---

# 17. ROUTING

Routing je tehnički i operativno važan dio sistema.

UI treba komunicirati:

- source/context
- conditions
- destination
- priority/order
- active/inactive state

Routing rules trebaju izgledati kao pravila sistema, ne kao obični CRUD redovi.

Ako pravilo ima više uslova, koristi strukturirani prikaz:

WHEN
condition
AND
condition

THEN
route to...

Ovaj prikaz mora biti lako čitljiv bez otvaranja svakog detalja.

---

# 18. FORMS

Svaka forma mora imati:

- jasne label-e
- pomoćni tekst samo gdje je potreban
- validaciju
- loading state
- error state
- success feedback
- disabled state

Ne koristiti placeholder kao zamjenu za label.

Greške moraju biti:

- konkretne
- korisnički razumljive
- vezane za konkretno polje kada je moguće

Nikada ne prikazivati sirove backend/technical error poruke krajnjem korisniku.

---

# 19. TABLES

Enterprise tabela mora biti:

- kompaktna
- skenabilna
- konzistentna
- responsive gdje je moguće

Header treba biti vizuelno tih.

Rows ne trebaju izgledati kao zasebni cards.

Hover state treba biti suptilan.

Koristi:

- sorting
- filtering
- pagination
- column visibility gdje ima smisla
- bulk actions kada postoji stvarna potreba

---

# 20. SEARCH

Search je fundamentalni interaction pattern.

Search mora biti:

- brz
- jasan
- lako dostupan
- keyboard-friendly gdje je moguće

Ako postoji global search, on treba biti dosljedno dostupan.

Search results moraju imati jasnu hijerarhiju.

---

# 21. COMMAND / KEYBOARD UX

Enterprise korisnici često žele raditi bez miša.

Gdje je prirodno, podrži:

- keyboard navigation
- shortcuts
- command menu
- quick actions
- focus management

Ali:

NE uvoditi keyboard shortcuts samo zato što ih ima Linear.

Svaki shortcut mora imati stvarnu operativnu vrijednost.

---

# 22. COLOR SYSTEM

Osnovu treba činiti neutralna paleta.

Približan odnos:

80–90% neutral colors
10–20% semantic/brand colors

Primarna brand boja treba biti rezervisana za:

- primary CTA
- active navigation
- focus
- important interactive states
- selected state

Semantic colors:

- success
- warning
- danger
- info

moraju imati konzistentno značenje.

Nikada ne koristiti boju samo radi estetike.

Ako je nešto crveno, korisnik mora imati razlog da ga primijeti.

---

# 23. TYPOGRAPHY

Typography je jedan od glavnih nosilaca premium osjećaja.

Koristi:

- snažnu heading hijerarhiju
- kompaktne metadata vrijednosti
- čitljive body tekstove
- jasne label-e

Naslovi ne trebaju biti ogromni.

Enterprise UI treba biti informacijski gust.

Preferirati:

- 12–14px metadata
- 14–16px body
- 16–20px section headings
- veće veličine samo za stvarno važne page titles/metrics

Nemoj koristiti mnogo različitih font weightova.

---

# 24. SPACING

Spacing mora biti sistemski.

Koristi konzistentnu spacing skalu.

Ne uvoditi random vrijednosti samo zato što "vizuelno bolje izgleda".

Posebno kontrolisati:

- page padding
- section spacing
- table row height
- form spacing
- card/surface padding
- sidebar spacing

Cilj:

**dense but breathable.**

Ne:

**cramped.**

Ne:

**empty.**

---

# 25. CARDS

Cardovi su dozvoljeni, ali nisu osnovni layout primitive za sve.

Ne praviti:

Card
Card
Card
Card
Card
Card

na svakom ekranu.

Preferirati:

- sections
- surfaces
- dividers
- tables
- lists
- grouped information

Card koristiti kada postoji stvarna konceptualna granica između sadržaja.

---

# 26. BORDERS / RADIUS / SHADOWS

Border radius:

- restrained
- konzistentan
- približno 6–10px za većinu UI elemenata

Veći radius samo kada postoji jasna UX korist.

Izbjegavati:

- 20–30px radius svuda
- pill-shaped buttons
- giant rounded cards

Shadows:

- minimalne
- koriste se za elevation
- ne koriste se kao dekoracija

Preferirati border + surface contrast nad jakom sjenom.

---

# 27. MOTION

Motion mora imati funkciju.

Koristi ga za:

- state transition
- opening/closing
- loading
- confirmation
- navigation feedback

Animacije trebaju biti kratke i suptilne.

Ne koristiti:

- floating blobs
- bouncing UI
- excessive spring animations
- decorative background motion
- flashy page transitions

Enterprise aplikacija ne treba "show".

Treba osjećaj kvaliteta.

---

# 28. LOADING STATES

Nikada ne ostavljati prazan ekran dok se podaci učitavaju.

Preferirati:

- skeleton
- contextual spinner
- optimistic feedback kada je sigurno
- progressive loading

Skeleton mora približno odgovarati stvarnom layoutu.

Ne koristiti jedan veliki spinner za cijelu aplikaciju ako se samo jedan dio učitava.

---

# 29. EMPTY STATES

Empty state mora odgovoriti:

- šta je prazno?
- zašto je prazno?
- šta korisnik može uraditi?

Primjer:

"Nemate otvorenih ticketa."

je bolje nego samo:

"No data."

Ako postoji sljedeća akcija, prikaži je.

---

# 30. ERROR STATES

Greška mora biti:

- jasna
- kontekstualna
- actionable

Ne prikazivati:

"Internal Server Error 500"

kao primarni UX.

Umjesto toga:

- objasniti šta se desilo
- ponuditi retry
- zadržati unesene podatke gdje je moguće

---

# 31. REAL-TIME / WEBSOCKET UX

Ako se podaci promijene u realnom vremenu, UI treba to komunicirati diskretno.

Ne koristiti agresivne toastove za svaku promjenu.

Preferirati:

- subtle live indicator
- updated timestamp
- inline update
- small notification
- unread indicator

Real-time treba djelovati kao prirodan dio sistema.

---

# 32. NOTIFICATIONS

Notifications moraju imati hijerarhiju.

Critical:

- zahtijeva akciju

Important:

- korisnik treba znati

Informational:

- korisno, ali nije hitno

Ne koristiti toast notification za svaku trivijalnu akciju.

---

# 33. RESPONSIVE DESIGN

Desktop je primarni enterprise workspace.

Tablet i mobile moraju ostati funkcionalni.

Na manjim ekranima:

- sidebar se transformiše u appropriate navigation
- tabele postaju scrollable ili contextual lists
- secondary metadata se progressive-disclosea
- primary actions ostaju dostupne

Ne pokušavati samo "smanjiti desktop".

Responsive layout mora biti svjesno dizajniran.

---

# 34. ACCESSIBILITY

Obavezno:

- keyboard navigation
- visible focus states
- semantic HTML
- sufficient contrast
- accessible labels
- correct ARIA samo gdje je potrebno
- touch targets odgovarajuće veličine
- error states dostupne screen readerima

Accessibility nije dodatak nakon dizajna.

---

# 35. DARK MODE

Ako postoji dark mode, ne praviti jednostavan:

white → black

invert.

Dark mode mora imati vlastitu hijerarhiju:

- background
- surface
- elevated surface
- border
- primary text
- secondary text
- semantic colors

Dark mode treba biti enterprise-grade i dugoročno ugodan za rad.

---

# 36. ICONOGRAPHY

Koristi jednu konzistentnu icon family.

Ikone trebaju biti:

- jednostavne
- funkcionalne
- optički balansirane

Ne koristiti emoji kao UI ikone.

Ne koristiti različite icon stilove unutar istog ekrana.

---

# 37. DATA VISUALIZATION

Grafove koristiti samo ako pomažu donošenju odluke.

Dobri primjeri:

- ticket volume trend
- workload
- resolution time
- SLA performance

Loši primjeri:

- chart samo da dashboard izgleda "modernije"
- donut chart za 3 broja
- decorative graphs
- duplicated information

Ako tabela bolje komunicira podatke, koristi tabelu.

---

# 38. AI-GENERATED UI ANTI-PATTERNS

Agent NE SMIJE automatski uvoditi:

- glassmorphism
- neon gradients
- purple AI gradients
- glowing borders
- huge rounded cards
- excessive pills
- floating blobs
- 3D illustrations
- decorative dashboards
- excessive shadows
- excessive whitespace
- giant typography
- card grids za sve
- unnecessary charts
- fake AI effects
- decorative animations
- gradient buttons
- excessive icon decoration

Posebno:

NE pokušavati učiniti aplikaciju "modernom" dodavanjem gradijenata.

Modernost dolazi iz:

- typography
- hierarchy
- spacing
- interaction quality
- consistency
- restraint

---

# 39. COMPONENT REUSE

Prije kreiranja novog UI elementa:

1. Provjeri postojeće `components/ui`.
2. Provjeri postojeće shared komponente.
3. Provjeri postojeće design tokene.
4. Reuse ako komponenta konceptualno odgovara.
5. Proširi postojeću komponentu ako je moguće.
6. Novu komponentu kreiraj samo kada postoji stvarna razlika.

Ne stvarati:

ButtonA
ButtonB
ButtonPrimary
ButtonModern
ButtonNew

ako je problem moguće riješiti postojećim Button API-jem.

---

# 40. DESIGN TOKENS

Sve vizuelne vrijednosti koje se ponavljaju moraju biti centralizovane.

Posebno:

- colors
- spacing
- radius
- typography
- shadows
- transitions
- z-index/elevation
- component sizes

Ne koristiti random magic numbers po komponentama.

---

# 41. DOMAIN LANGUAGE

Vizuelni jezik treba biti povezan sa HelpDesk domenom.

EP-HelpDesk nije:

- social network
- consumer app
- marketing website
- analytics-only platform

On je:

**enterprise support operations system.**

Zbog toga dizajn treba imati:

- jasne stateove
- ownership
- queues
- routing
- organizational context
- auditability
- traceability
- operational actions

---

# 42. PRIMARY UX PRINCIPLE

Na svakom ekranu postoji jedna primarna stvar.

Agent mora moći odgovoriti:

**"Koji je korisnikov najvažniji sljedeći potez?"**

Ako odgovor nije jasan, layout nije dovoljno dobar.

---

# 43. DESIGN DECISION ORDER

Kada donosiš UI odluku, prioritet je:

1. Functional correctness
2. Usability
3. Operational speed
4. Information hierarchy
5. Accessibility
6. Consistency
7. Visual polish
8. Trendiness

Trend nikada ne smije pobijediti usability.

---

# 44. IMPLEMENTATION DISCIPLINE

Prije svake veće UI promjene:

1. Pregledaj postojeću komponentu.
2. Pregledaj postojeći design system.
3. Pregledaj kako se komponenta koristi na drugim ekranima.
4. Identifikuj reusable pattern.
5. Napravi najmanju potrebnu promjenu.
6. Provjeri desktop.
7. Provjeri responsive.
8. Provjeri loading/error/empty states.
9. Provjeri accessibility.
10. Typecheck/build nakon relevantne grupe izmjena.

Ne mijenjaj business logic samo radi vizuelnog redesign-a.

Ne mijenjaj API contracts radi UI-a bez eksplicitnog razloga.

---

# 45. FINAL DESIGN TARGET

Konačni EP-HelpDesk treba izgledati kao kombinacija:

**Linear**
za disciplinu i information hierarchy

-

**Stripe**
za enterprise clarity

-

**Intercom/Zendesk**
za support workflow razumijevanje

-

**Raycast**
za brzinu i command-oriented interaction

-

**vlastiti EP-HelpDesk identitet**
za enterprise HelpDesk / IT operations domen.

Krajnji rezultat treba ostaviti osjećaj:

> "Ovo je ozbiljan enterprise proizvod koji je napravljen za ljude koji rade support svaki dan."

Ne:

> "Ovo je lijep dashboard template."
