# EP-HelpDesk — email/checklist za EPBiH IT (copy/paste)

Subject: EP-HelpDesk (MVP) — potrebni ulazi za SSO/AD, routing, notifikacije i infrastrukturu

Poštovani,

radimo na pokretanju MVP verzije EP-HelpDesk sistema. Da bismo mogli startati implementaciju i testiranje bez blokera, molimo vas da nam dostavite sljedeće informacije i artefakte.

## A) Entra ID / SSO (obavezno)

- Tenant ID
- App Registration (web + API) ili potvrda da ćete vi kreirati registraciju
- Client ID
- Client Secret (ili certifikati, ako preferirate)
- Redirect URL-ovi za prod + staging (npr. `https://<host>/auth/callback`)
- Graph API dozvole (minimalno): `User.Read`, `Directory.Read.All` (ili predložite strožiji ekvivalent)
- Ko je owner za admin consent i proces rotacije secreta (kontakt osoba)

## B) Active Directory podaci za OU mapiranje (kritično)

- Potvrda koji su atributi “source-of-truth” za mapiranje korisnika u organizacione jedinice:
  - `Company`, `Department` (opciono `OfficeLocation`, `City`, `Manager`)
- CSV uzorak korisnika (200–500 redova) za validaciju mapiranja:
  - `displayName,email,company,department,officeLocation`
- Lista OU hijerarhije (Direkcija → Podružnice → Poslovnice → Sektori/Službe):
  - nazivi + (ako postoji) šifre/kodovi
- Pravilo za slučajeve kad `Company/Department` nedostaje ili ima varijante

## C) Service catalog + routing (da tiket nikad ne zapne)

- Lista kategorija + servisa (startno 10–30 dovoljno)
- Inicijalna routing mapa: (origin OU + service) → handler grupa
- Fallback handler grupa za sve bez match-a (npr. centralni IKT)
- Pravila za forwarding/eskalaciju između grupa/OU (ko smije i u kojim slučajevima)

## D) Handler grupe i članstvo

- Lista handler grupa + članovi (emailovi)
- Lokalni Admini po OU
- (Opcionalno) radno vrijeme / on-call pravila

## E) Email notifikacije (Office 365)

- Način slanja: Graph `sendMail` (preporuka) ili SMTP
- Sender identitet/mailbox (npr. `helpdesk@...`)
- Koje evente šaljemo mailom (predlog): new ticket, assigned, new message, resolved/closed, remote requested

## F) Quick Assist / Remote (policy)

- Potvrda da je Quick Assist omogućen na korisničkim računarima
- Potvrda GPO/policy da `ms-quick-assist:` protokol nije blokiran
- Pravila sigurnosti: ko smije inicirati remote i da li se traži user consent

## G) Edge ekstenzija (deployment)

- Da li se ekstenzija distribuira kroz Edge management/Intune ili pilot/manual za MVP
- Ako managed: policy za force install + update
- Dozvoljene permissione (notifications/background/websocket) i mrežni zahtjevi (VPN/outside)

## H) Infrastruktura / deploy

- Prod domen (npr. `helpdesk.<domain>`) + staging domen (preporuka)
- Traefik parametri (ako koristite Traefik): `TRAEFIK_HOST`, `TRAEFIK_STACK`, `TRAEFIK_NETWORK`
- MySQL/MariaDB: host/port/db/user/pass + backup politika
- Uploads/shared path (npr. `/mnt/shared-app-files/ephelpdesk`) ili alternativno objekt storage

## I) Compliance/retention

- Retention za audit log, ticket history/chat i attachments
- Da li je potreban audit export (CSV/JSON) i ko ima pristup

Ako želite, možemo organizovati kratki 30-min kickoff sa IT timom kako bismo potvrdili OU mapiranje i routing pravila (to su najkritičnije tačke za start).

Hvala unaprijed,
[Ime i prezime]  
[Firma/Tim]  
Kontakt: [telefon/email]