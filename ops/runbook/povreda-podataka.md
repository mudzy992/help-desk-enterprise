# Runbook: povreda ličnih podataka (paket 2.6, ZZLP BiH)

> Zakon o zaštiti ličnih podataka BiH (Sl. glasnik BiH 12/25): **prijava Agenciji u roku od 72 sata** od
> saznanja (čl. 35). Ako povreda vjerovatno izaziva visok rizik za prava osoba, obavještavaju se i pogođeni
> (čl. 36). Ovaj runbook je tehnički dio postupka. Pravnu ocjenu i samu prijavu radi DPO (čl. 39).

**Sat počinje kad neko iz organizacije sazna za povredu**, ne kad je istraga gotova. Prijava može biti
djelimična i dopunjuje se naknadno.

## 0. Uloge

| Uloga | Ko | Zadatak |
|---|---|---|
| Voditelj incidenta | dežurni SUPER_ADMIN | tehničko obuzdavanje, dnevnik incidenta |
| DPO | kontakt iz *Privatnost → Evidencija* | procjena rizika, prijava Agenciji, obavještenje osoba |
| Vlasnik sistema | IT rukovodilac | odluke o gašenju servisa i komunikaciji |

Dnevnik incidenta (vrijeme, ko, šta, zašto) voditi od prve minute u zasebnom dokumentu, ne u help-desku
koji je možda kompromitovan.

## 1. Prvi sat: obuzdavanje

1. **Zabilježiti vrijeme saznanja** (T0) i izvor dojave.
2. Kompromitovan nalog: *Administracija → Korisnici → korisnik → Sigurnost naloga*:
   - deaktivirati nalog,
   - opozvati sve sesije,
   - resetovati MFA (`ops/runbook/mfa-reset.md`).
3. Kompromitovan server ili ključ:
   - rotirati `JWT_SECRET` (odjavljuje sve korisnike), lozinke baze i Redisa te SMTP/Graph tajne;
   - `MFA_ENCRYPTION_KEY`, `PRIVACY_TOMBSTONE_KEY` i `PRIVACY_EXPORT_KEY` rotirati po
     `ops/runbook/rotacija-tajni.md` (faze B i C). Kod `PRIVACY_EXPORT_KEY`, izvozi šifrovani
     starim ključem postaju nečitljivi, što je ovdje poželjno.
4. Curenje preko izvoza (izgubljen ZIP, pogrešan primalac): ZIP je šifrovan (AES-256-GCM) i preuzima se
   samo uz MFA. Provjeriti ko ga je preuzeo (upit 2.3) i je li lozinka išla istim kanalom.
5. **Ne brisati tragove:** ne pokretati retenciju, ne anonimizovati i ne restartovati bazu prije kopije.
   Ako je retencija uključena, a istraga traje: *Privatnost → Legal hold* na pogođene tikete ili privremeno
   isključiti kategorije u postavkama (promjena se audituje).
6. Napraviti snapshot baze i `uploads` volumena (`ops/DR.md`, Backup) i označiti ga oznakom incidenta.

## 2. Do 24 h: obuhvat iz audita

Audit je hash-lanac (v2). Prije oslanjanja na njega provjeriti integritet:
*Administracija → Audit → Provjeri lanac* (ili `POST /audit-logs/verify`). Rezultat `valid: false` je sam
po sebi nalaz za dnevnik: od prve neispravne tačke audit se ne smatra pouzdanim.

Upiti se izvršavaju **read-only** na kopiji ili na produkciji, preko psql-a na Postgres kontejneru:

```bash
docker exec -it <postgres> psql -U <user> -d <db>
```

Prozor sumnje: `:from` i `:to` (UTC), sumnjivi nalog: `:actor` (id korisnika).

```sql
\set from '''2026-09-20 00:00'''
\set to   '''2026-09-28 12:00'''
\set actor '''<userId>'''

-- 2.1 Sve što je nalog radio u prozoru
SELECT "createdAt", action, "entityType", "entityId", "requestId"
FROM "AuditLog"
WHERE "actorUserId" = :actor AND "createdAt" BETWEEN :from AND :to
ORDER BY "createdAt";

-- 2.2 Sesije i IP adrese naloga (rok čuvanja sesija 90 d)
SELECT "createdAt", "lastSeenAt", "ipAddress", "userAgent", provider, "mfaMethod", "revokedAt", "revokedReason"
FROM "UserSession"
WHERE "userId" = :actor AND "lastSeenAt" >= :from
ORDER BY "createdAt";

-- 2.3 Izvozi i masovna preuzimanja (bilo ko)
SELECT "createdAt", "actorUserId", action, "entityId", metadata
FROM "AuditLog"
WHERE action IN ('privacy.export.downloaded', 'audit.export', 'report.trends.exported')
  AND "createdAt" BETWEEN :from AND :to
ORDER BY "createdAt";

-- 2.4 Pogođene osobe: vlasnici tiketa koje je nalog dirao
SELECT DISTINCT u.id, u."displayName", u.email
FROM "AuditLog" a
JOIN "Ticket" t ON a."entityType" = 'Ticket' AND t.id = a."entityId"
JOIN "User" u ON u.id = t."requesterId"
WHERE a."actorUserId" = :actor AND a."createdAt" BETWEEN :from AND :to;

-- 2.5 Neuspjele prijave (pokušaji pogađanja lozinke)
SELECT date_trunc('hour', "createdAt") AS sat, count(*)
FROM "AuditLog"
WHERE action = 'user.login_failed' AND "createdAt" BETWEEN :from AND :to
GROUP BY 1 ORDER BY 1;
```

Napomene:
- Ako upit 2.4 javi grešku za naziv kolone, strukturu provjeriti sa `\d "Ticket"`, jer se šema razvija.
- Čitanja tiketa se ne audituju pojedinačno; audit bilježi izmjene, izvoze i administrativne akcije.
  Za čitanja se koriste logovi reverse proxyja (Coolify/Traefik) za isti prozor, filtrirani po IP-u
  iz upita 2.2.
- Rezultate izvesti (`\copy (...) TO '/tmp/obuhvat.csv' CSV HEADER`) i predati DPO-u šifrovanim kanalom.

## 3. Do 72 h: prijava (DPO)

Prijava Agenciji sadrži (čl. 35):
1. prirodu povrede: kategorije i približan broj osoba i zapisa (iz koraka 2);
2. ime i kontakt DPO-a;
3. vjerovatne posljedice;
4. poduzete i predložene mjere (iz dnevnika incidenta).

Kategorije podataka i primaoci su već opisani u *Privatnost → Evidencija* (ispis/PDF), pa se evidencija
prilaže kao prilog. Ako se prijava ne podnese u 72 h, u njoj se navodi razlog kašnjenja.

**Obavještenje pogođenih osoba** (visok rizik): e-mail preko postojećeg kanala ili broadcast u aplikaciji,
jasnim jezikom: šta se desilo, koji podaci, šta smo uradili, šta osoba treba uraditi (npr. promijeniti
lozinku) i kontakt DPO-a.

## 4. Nakon incidenta

- Evidentirati povredu i kad se **ne** prijavljuje (niži rizik), s obrazloženjem. Zakon traži dokumentovanje
  svih povreda.
- Uraditi post-mortem, ažurirati ovaj runbook i po potrebi mjere u evidenciji (MFA, retencija, prava).
- Ako je rađen restore baze, pokrenuti `privacy-replay` (`ops/DR.md`, Restore, tačka 6), da ranije
  anonimizovane osobe ne „ožive“.
