# Odgovor e-mailom (dolazna pošta) — uputstvo za IT i admina

> Paket 2.3. Dizajn: `docs/plans/modules/2.3-odgovor-emailom.md`.

Korisnik ili agent odgovori na obavijest o tiketu u svom mail klijentu. Odgovor stiže u zajednički sandučić podrške (npr. `helpdesk@epbih.ba`). Worker svakih 60 s čita sandučić, prepozna tiket i doda poruku na tiket u ime pošiljaoca. Poruka dobija oznaku „Putem e-maila”. Ostali učesnici dobijaju obavijest kao i za poruku napisanu u aplikaciji.

## 1. Preduslovi

1. **Način odgovora B.** U Postavke → E-mail treba postaviti „zajednički sandučić” (`shared_mailbox`) i Reply-To adresu sandučića. Bez toga korisnici nemaju kome odgovoriti, a kartica „Dolazna pošta” to prikazuje kao upozorenje.
2. **Tajna tokena.** Obavijesti nose potpisani `Message-ID` (`<r.<tiket>.<primalac>.<nonce>.<potpis>@domena>`). Po njemu se odgovor pouzdano veže za tiket i primaoca.
   - Tajna je `INBOUND_EMAIL_TOKEN_SECRET` (≥16 znakova) u okruženju backenda **i** workera.
   - Ako je prazna, izvodi se iz `MFA_ENCRYPTION_KEY` (HKDF).
   - Bez obje vrijednosti prepoznaje se samo `[T-000123]` u naslovu i stari thread `<ticket-…@…>` iz 1.5.
   - Promjena tajne poništava tokene u već poslanim mailovima. Ti odgovori se i dalje prepoznaju po broju u naslovu.
3. **Migracija** `20261015090000_inbound_email`, zatim restart backenda i workera.

## 2. Office 365 — Microsoft Graph (preporučeno)

Radi IT EPBiH, jednom:

1. Entra ID → App registrations → New registration, npr. „Help Desk – dolazna pošta”, single tenant.
2. API permissions → Microsoft Graph → **Application** → `Mail.ReadWrite`, zatim **Grant admin consent**.
3. Certificates & secrets → New client secret. Vrijednost se kopira odmah; zapisati i datum isteka.
4. **Ograničiti aplikaciju samo na sandučić podrške.** Bez ovoga aplikacija vidi sve sandučiće u tenantu. Postoje dvije opcije:
   - preporučeno, RBAC for Applications (Exchange Online PowerShell):
     ```powershell
     New-ServicePrincipal -AppId <client-id> -ObjectId <enterprise-app-object-id> -DisplayName "Help Desk inbound"
     New-ManagementScope -Name "HelpDeskMailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'helpdesk@epbih.ba'"
     New-ManagementRoleAssignment -App <client-id> -Role "Application Mail.ReadWrite" -CustomResourceScope "HelpDeskMailbox"
     ```
     U tom slučaju se Graph dozvola iz koraka 2 može ukloniti (RBAC je dovoljan).
   - stariji način, Application Access Policy:
     ```powershell
     New-DistributionGroup -Name "HelpDesk-App-Scope" -Type Security -Members helpdesk@epbih.ba
     New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId HelpDesk-App-Scope -AccessRight RestrictAccess -Description "Help Desk inbound"
     Test-ApplicationAccessPolicy -AppId <client-id> -Identity helpdesk@epbih.ba   # AccessCheckResult: Granted
     ```
5. U aplikaciji (Postavke → Dolazna pošta) postaviti:
   - `provider = graph`;
   - `address = helpdesk@epbih.ba`;
   - `graph.tenantId`, `graph.clientId`, `graph.clientSecret`.
6. Kliknuti „Testiraj konekciju” na kartici „Dolazna pošta (odgovor e-mailom)”, pa uključiti `private.inbound.enabled`.

Folderi `HelpDesk/Obradjeno` i `HelpDesk/Odbijeno` se kreiraju sami pod Inboxom.

**Istek tajne:** kartica pokazuje grešku `ENTRA_TOKEN_FAILED 401 invalid_client`. Nakon 3 uzastopne greške admini dobijaju in-app obavijest (jednom). Rješenje je nova tajna u postavkama.

## 3. IMAP (Gmail, drugi serveri, O365 preko IMAP-a)

| Server | host / port / TLS | Prijava |
|---|---|---|
| Gmail / Google Workspace | `imap.gmail.com` / 993 / da | app password (2FA uključen na nalogu) → `imap.password`, `authMethod = password` |
| Office 365 | `outlook.office365.com` / 993 / da | `authMethod = oauth2_entra` + Entra aplikacija iz §2 s dozvolom **Office 365 Exchange Online → IMAP.AccessAsApp** i `Add-MailboxPermission -Identity helpdesk@epbih.ba -User <service-principal-id> -AccessRights FullAccess` |
| Ostali | po dokumentaciji servera | lozinka |

Port 993 koristi implicitni TLS, a ostali portovi STARTTLS kad je `imap.tls = da`.

### 3.1 Gmail — brzo podešavanje

Koristi se isti Gmail nalog i isti app password kao za SMTP. U Gmailu mora biti uključen IMAP (Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP; na novijim nalozima je uvijek uključen).

```bash
bash ops/inbound/apply-gmail-imap.sh <backend-kontejner>
```

Skripta pita samo adresu i app password. Postavlja provider `imap`, `imap.gmail.com:993` s TLS-om, korisnika = adresu i `requireAuthPass = da` (Gmail dodaje `Authentication-Results`). Folderi `HelpDesk/Obradjeno` i `HelpDesk/Odbijeno` se u Gmailu pojavljuju kao labele. U e-mail postavkama treba izabrati „zajednički sandučić” s Reply-To = ta ista adresa.

## 4. Pravila obrade (sažetak)

| Situacija | Ishod |
|---|---|
| Odgovor podnosioca | javna poruka (USER_REPLY); ako je tiket bio „čeka korisnika”, vraća se u obradu |
| Odgovor agenta | javni odgovor (AGENT_REPLY); interna bilješka e-mailom **nije moguća** |
| Tiket RESOLVED | ponovo se otvara, a tekst je komentar ponovnog otvaranja |
| Tiket CLOSED/ARCHIVED | poruka se ne dodaje; pošiljalac dobija kratak mail „tiket je zatvoren” (najviše 1 dnevno po tiketu) |
| Redakcija `block` | poruka se ne dodaje; pošiljalac dobija obavještenje bez citiranja sadržaja |
| Nepoznat, neaktivan ili eksterni pošiljalac, DMARC fail | odbijeno, bez odgovora |
| Autoresponder, bounce, lista, naša adresa | ignorisano, bez odgovora |
| >20 poruka na sat od istog pošiljaoca | odbijeno (zaštita od petlje) |
| Nedozvoljen ili zaražen prilog | ne prilaže se; na tiketu ostaje sistemska napomena |
| Novi mail bez broja tiketa | odbijeno; ili novi tiket na zadanom servisu ako je `createTickets` uključen |

- Obrađeni mailovi idu u `HelpDesk/Obradjeno`, a odbijeni i ignorisani u `HelpDesk/Odbijeno`. Ništa se ne briše.
- Original (`.eml.gz`) čuva se 30 dana u `<UPLOAD_ROOT>/inbound-raw/<yyyy-mm>/`. Dnevnik (bez tijela poruke) čuva se 180 dana.
- Ista poruka se nikad ne obrađuje dvaput (`InboundEmail` unique po sandučiću i ID-u poruke).
- Ako worker padne usred obrade, poruka se označava `INTERRUPTED` i ide u „Odbijeno”. Ne ponavlja se, da ne bi nastala dupla poruka na tiketu.

## 5. Test bez tenanta — GreenMail na Coolify serveru

```bash
cd ops/dev/greenmail
docker compose up -d
sh apply-settings.sh <backend-kontejner>       # IMAP greenmail.test:3143, bez DMARC provjere
# u aplikaciji: kartica „Dolazna pošta” → Testiraj konekciju (0 poruka)
./send-reply.sh T-000123 <email-postojećeg-korisnika> "Printer radi, hvala."
# nakon ≤60 s: poruka na tiketu T-000123 s oznakom „Putem e-maila”, citat uklonjen
./send-reply.sh T-000123 <email> "Van ureda" "Auto-Submitted: auto-replied"   # → Ignorisano
./send-reply.sh T-000123 nepoznat@epbih.ba "x"                                  # → Odbijeno: nepoznat pošiljalac
./send-reply.sh - <email> "Novi laptop" "Subject: Trebam novi laptop"          # → Odbijeno (ili novi tiket uz createTickets)
```

Checklista:

| # | Provjera | Očekivano |
|---|---|---|
| I1 | Testiraj konekciju | zeleno, broj poruka |
| I2 | Odgovor podnosioca | poruka + oznaka, drugi dobijaju obavijest |
| I3 | Odgovor agenta | javni odgovor |
| I4 | Tiket WAITING_FOR_USER | nakon odgovora ide u obradu |
| I5 | Tiket RESOLVED | ponovo otvoren |
| I6 | Tiket CLOSED | nema poruke; informativni mail (ako je SMTP podešen) |
| I7 | Autoresponder | Ignorisano |
| I8 | Nepoznat pošiljalac | Odbijeno |
| I9 | 21 poruka za sat | 21. odbijena (RATE_LIMITED) |
| I10 | Restart workera usred rada | nema duplih poruka |
| I11 | Dnevnik na kartici | status, razlog, link na tiket; bez tijela poruke |

Kad je SMTP podešen na isti GreenMail (`greenmail.test:3025`, bez TLS-a), odgovor se može napraviti i na pravu obavijest s potpisanim tokenom. Tada treba zadržati `In-Reply-To` iz poslane obavijesti.

## 6. Nadzor

- Kartica **Postavke → Dolazna pošta (odgovor e-mailom)** prikazuje stanje, zadnju uspješnu provjeru, brojeve za 24 h, zadnju grešku, upozorenja o konfiguraciji i dnevnik zadnjih 50 poruka.
- Logovi workera: `inbound_email_processed=… rejected=… ignored=… failed=…`, `inbound_email_run_failed`, `inbound_email_message_failed`.
- Kad konektor ne radi, pokušaji se prorjeđuju eksponencijalno (najviše 30 min između pokušaja). Prva uspješna provjera vraća normalan ritam.
