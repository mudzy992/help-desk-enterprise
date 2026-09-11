# Install wizard (first-run)

Nije isto što i **service onboarding wizard** (admin, jedan servis).
Ovo je **jednokratni** setup aplikacije prije bilo kojeg logina osim samog wizarda.

Source of truth za korake: ovaj fajl. Settings u registry (secret handling). UI: Constitution — jedan korak = jedan posao.
SMTP polja mogu prefillovati iz env (`SMTP_*`); wizard ostaje istina nakon complete.

## Gate

Dok `private.install.completedAt` nije postavljen:

- UI: sve rute → `/install`
- API: sve osim `GET /health` i `/install/*` → `503 SETUP_REQUIRED`

Nakon završetka wizard se **zaključava**. Izmjene idu kroz Settings (SuperAdmin). Ponovno otvaranje samo ako SuperAdmin + eksplicitni `INSTALL_ALLOW_RERUN=true` (ops, nije default).

## Koraci (redoslijed)

1. **SuperAdmin (uvijek lokalni)**  
   email, displayName, password. Nalog ima `isLocalOnly=true`.  
   Čak i kad je prijava `entra_ad`, ovaj nalog se **uvijek** autentifikuje lokalno (break-glass). Nije AD identitet i ne smije se obrisati zadnji local SuperAdmin.

2. **Način prijave**  
   `local` | `entra_ad`.  
   Ako `entra_ad`: obavezna polja (tenant/client ili LDAPS bind) ili “sačuvaj i dopuni kasnije u Settings” samo ako je bar mode izabran. Role mapping ostaje settings-driven.

3. **SMTP**  
   switch enabled. Ako ON: host, port, TLS, user, password (secret), from address; test-send opciono. Ako OFF: email addon je forsirano off.

4. **Inicijalni podaci** (minimalni seed da tiket može proći routing)  
   - org/OU root (npr. Direkcija)  
   - handler grupe (min 1 = fallback / unrouted)  
   - kategorije + servisi (min 1 servis vezan na fallback grupu)  
   Ne seedati “demo tikete”.

5. **Dodaci (feature flags)**  
   Switch po dodatku (opis uz svaki). Core se ne gasi (ticketing, routing, group inbox, RBAC, audit, in-app notifikacije, attachments).

## Dodaci (katalog)

| Key | Default | Zavisnost |
|---|---|---|
| `sla` | on | — |
| `email` | off | SMTP enabled |
| `edge` | off | — |
| `teamsStub` | off | — |
| `csat` | on | — |
| `autoAssign` | off | — |
| `approvals` | on | — |
| `confidential` | on | — |
| `kbIntercept` | on | — |
| `timeTracking` | on | — |
| `ticketSplit` | on | — |
| `bulkActions` | on | — |
| `savedViews` | on | — |
| `reports` | on | — |
| `serviceDowntime` | on | — |

Isključen dodatak: API + UI skrivaju/odbijaju feature (`403 ADDON_DISABLED`). Ne brisati podatke.

## Settings ključevi (wizard)

- `private.install.completedAt` (string ISO | empty)
- `private.install.completedByUserId` (string)
- `private.auth.mode` (`local` | `entra_ad`)
- `private.auth.jwtSigningSecret` (secret; wizard ga generiše na complete ako nedostaje)
- `private.auth.localBreakGlass.enabled` (boolean, default true, nije isključivo iz wizarda)
- `private.smtp.enabled` + SMTP secret polja
- `private.addons.<key>` (boolean) za svaki red u tabeli

SuperAdmin password **nije** settings secret; ide u `User.passwordHash`.
