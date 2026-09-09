# EP-HelpDesk — start inputs (MVP) (EPBiH)

Ovaj dokument je “source of truth” za minimalne ulaze koje EPBiH treba isporučiti da MVP može krenuti bez blokera. Fokus: **AD/LDAPS + OU mapping + role grupe**, plus osnovna infrastruktura.

Planirani domen aplikacije: `desk.epbih.ba` (app na odvojenom VM serveru).

---

## 1) Active Directory / LDAPS integracija (minimalno, obavezno)

### 1.1 Read-only servisni nalog (za backend)

- Read-only servisni nalog za čitanje:
  - korisnika u scope-u
  - group membership (za role)
- Dostaviti:
  - **Bind DN** (DN naloga)
  - **Password** (ili gMSA ako je standard)
  - politika rotacije/odgovorna osoba

### 1.2 LDAPS konekcija

- DC hostovi (primarni + sekundarni), npr. `dc1.epbih.ba`, `dc2.epbih.ba`
- Port: **636 (LDAPS)**
- **Base DN**: `DC=epbih,DC=ba`
- **CA/cert chain** (da backend može validirati LDAPS cert)
- Network:
  - da li treba whitelist IP VM servera prema DC-ovima

### 1.3 OU scope + pravilo mapiranja (source-of-truth)

Standard (potvrđen u EPBiH):

- `DC=epbih,DC=ba`
- `OU=Grupe,DC=epbih,DC=ba` (gdje su sve grupe)
- `OU=Korisnici,DC=epbih,DC=ba` (root gdje su svi korisnici u scope-u)
  - `OU=Direkcija,...` (unutra podjela po službama)
  - `OU=ED <grad>,...` (npr. `OU=ED Zenica,...`) (unutra podjela po poslovnicama: npr. `OU=Breza`, `OU=Visoko`, …)

Tražimo od sysadmina:

- Potvrdu da je `OU=Korisnici,DC=epbih,DC=ba` “scope root” za HelpDesk (ili listu dodatnih root OU-ova ako ih ima)
- Listu top-level OU-ova ispod `OU=Korisnici` koji ulaze u scope (Direkcija + ED-ovi)
- Listu izuzetaka (ako postoje) gdje se korisnici nalaze van ove strukture

Pravilo MVP-a:

- OU membership se određuje po `**DistinguishedName` / OU path**.
- Dublji podfolderi ispod službe/poslovnice (ako postoje) **ne mijenjaju** OU scope u MVP-u.

### 1.4 Atributi korisnika (sekundarno)

Potvrda da su sljedeći atributi dostupni i smisleni:

- `mail`, `displayName`
- `company`, `department` (sekundarno: reporting i routing detalji)
- opcionalno: `manager`, `officeLocation`

---

## 2) Role grupe (definitivno imamo) — obavezno

Kreirati AD security grupe i dostaviti njihove **DistinguishedName (DN)**:

- `EPHELPDESK_ROLE_SUPER_ADMIN`
- `EPHELPDESK_ROLE_ADMIN`
- `EPHELPDESK_ROLE_AGENT`

Pravilo:

- Ako korisnik nije ni u jednoj od ovih grupa ⇒ default rola = **USER**
- Ako je u više ⇒ uzima se **najviša rola** (SUPER_ADMIN > ADMIN > AGENT)

---

## 3) Service catalog + routing (operativni start)

- Lista kategorija + servisa (startno 10–30 dovoljno)
- Inicijalna routing mapa: **(origin OU + service) → handler grupa**
- Fallback handler grupa za sve bez match-a (npr. centralni IKT)
- Pravila forwarding/eskalacije između OU/grupa (ko smije i u kojim slučajevima)

---

## 4) Email notifikacije (lokalno/O365)

- Sender mailbox (npr. `helpdesk@epbih.ba`)
- Potvrda da je slanje **interno** (lokalno) ili ima eksternih primaoca
- Eventi (minimalno): new ticket, assigned, new message, resolved/closed, remote requested

---

## 5) Infrastruktura (minimalno)

- Domen + DNS: app `desk.epbih.ba`, API `api.desk.epbih.ba` (staging: `*.ba101.top` na Coolify)
- Coolify deploy (bez Traefik path prefixa)
- PostgreSQL (Coolify Database) + backup politika
- Redis: postojeći `redis-core` / `redis-net` + ACL user `ephelpdesk`
- Uploads: persistent volume `/usr/app/uploads`

---

## 6) Quick Assist / Remote (policy) (ako ide u MVP)

- Potvrda da je Quick Assist omogućen
- Potvrda da `ms-quick-assist:` protokol nije blokiran policy-jem
- Pravila: ko smije inicirati remote i da li je user consent obavezan

