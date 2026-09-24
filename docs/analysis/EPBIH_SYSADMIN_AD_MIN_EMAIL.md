# EP-HelpDesk — primjer maila sysadminu (minimalno za AD/LDAPS)

Subject: EP-HelpDesk (MVP) — minimalni AD/LDAPS pristup + role grupe

Pozdrav,

za pokretanje MVP verzije EP-HelpDesk aplikacije (domen `desk.epbih.ba`, aplikacija na odvojenom VM serveru) treba nam minimalna integracija sa Active Directory.

Molim da obezbijedite sljedeće:

## 1) Read-only servisni nalog (za backend)

- Read-only nalog koji može čitati korisnike u scope-u i njihovo članstvo u grupama (role).
- Dostavite:
  - Bind DN
  - Password (ili gMSA ako je standard)
  - info o rotaciji (ko/koliko često)

## 2) LDAPS detalji

- DC hostovi (primarni + sekundarni) za povezivanje preko LDAPS
- Port: 636
- Base DN: `DC=epbih,DC=ba`
- CA/cert chain za validaciju LDAPS certifikata na aplikacijskom serveru
- Potvrda da VM server (IP ćemo dostaviti) može pristupiti DC-ovima na 636 (whitelist ako treba)

## 3) OU scope (source-of-truth)

HelpDesk OU membership mapiramo po `DistinguishedName` / OU path.

Molim potvrdu sljedećeg (ili ispravku ako je drugačije):

- korisnici u scope-u su pod: `OU=Korisnici,DC=epbih,DC=ba`
- grupe su pod: `OU=Grupe,DC=epbih,DC=ba`
- top-level OU-ovi ispod `OU=Korisnici` (Direkcija + ED-ovi) su scope za HelpDesk
- dublji podfolderi ispod službe/poslovnice ne mijenjaju OU scope u MVP-u

Ako postoje izuzeci gdje korisnici nisu pod `OU=Korisnici`, molim da dostavite listu tih OU DN-ova.

## 4) Role grupe (AD security grupe)

Molim kreirati (ili potvrditi postojanje) sljedećih grupa i dostaviti njihove DN-ove:

- `EPHELPDESK_ROLE_SUPER_ADMIN`
- `EPHELPDESK_ROLE_ADMIN`
- `EPHELPDESK_ROLE_AGENT`

Napomena: korisnici koji nisu u ovim grupama tretiraju se kao “USER” (default).

Hvala,
[Ime i prezime]  
[Tim]  
[Kontakt]