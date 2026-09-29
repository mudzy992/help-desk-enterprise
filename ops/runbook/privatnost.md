# Runbook: Privatnost (paket 2.6, ZZLP BiH)

> Operativno uputstvo za modul **Administracija → Privatnost** (`/privacy`). Dizajn i odluke se nalaze u
> `docs/plans/modules/2.6-zastita-licnih-podataka.md`. Ovaj dokument je tehnički i nije pravno mišljenje.
> Rokove čuvanja i tekst obavještenja potvrđuje DPO institucije.

## 0. Prije puštanja u produkciju (obavezno)

> Za DPO-a je pripremljen upitnik s prijedlozima i obrascem za odgovore:
> [`docs/privacy/DPO-UPITNIK.md`](../../docs/privacy/DPO-UPITNIK.md). Njegov §6 povezuje svaki odgovor s ključem postavke.

1. **DPO pregleda i potvrdi nacrte tekstova.** Tekstovi se uređuju u *Postavke → Privatnost*:
   - obavještenje o obradi (`private.privacy.notice.bs` / `.en`);
   - podaci o rukovaocu (`private.privacy.controller.*`);
   - tekst odbijanja zahtjeva (`private.privacy.requests.rejectionNotice.*`).
2. **DPO potvrdi rokove zadržavanja.** Zadano su uključene samo dvije kategorije: sesije (90 d) i isporuke
   e-maila (180 d). Sve ostale kategorije su isključene, a stara postavka od 365 dana se ne prenosi.
3. **Ključevi u produkciji su postavljeni i spremljeni u sef:** `PRIVACY_TOMBSTONE_KEY` i
   `PRIVACY_EXPORT_KEY` (najmanje 16 znakova). Ako ostanu prazni, izvode se iz `MFA_ENCRYPTION_KEY`, pa
   njegova rotacija utiče i na njih. Zato preporučujem vlastite ključeve.
4. Worker radi. Izvoz, retencija i anonimizacija se izvršavaju samo u workeru, a API samo kreira poslove.
5. Na stagingu i u produkciji treba biti postavljen `NODE_ENV=production`.

## 1. Uloge i permisije

| Permisija | Zadano | Šta dozvoljava |
|---|---|---|
| `privacy.view` | ADMIN, SUPER_ADMIN | registar, izvještaji retencije, evidencija, legal hold |
| `privacy.manage` | SUPER_ADMIN | zahtjevi, izvoz, retencija |
| `privacy.anonymize` | SUPER_ADMIN | anonimizacija (nepovratna) |

Postavku „četiri oka“ za anonimizaciju (`requireSecondApprover`) uključuje DPO po potrebi. Zadano je isključena.

## 2. Zahtjev nosioca podataka (čl. 14, 17–24)

1. *Privatnost → Zahtjevi → Novi.* Unesu se vrsta, podnosilac i datum prijema. Rok se računa automatski
   i iznosi **30 dana**.
2. Podsjetnici stižu 7 dana i 1 dan prije isteka roka (`reminderDaysCsv`). Boja u listi: zelena, žuta
   (≤ 7 d) i crvena (rok prekoračen).
3. **Produženje:** „Produži“ uz obavezno obrazloženje dodaje **+60 dana** i moguće je samo jednom.
   Podnosioca treba obavijestiti o produženju u prvih 30 dana (čl. 14 st. 3).
4. **Zatvaranje:**
   - ishod COMPLETED, uz referencu na rezultat, npr. id izvoza;
   - ishod REJECTED, uz razlog. Podnosilac se obavještava tekstom odbijanja koji navodi pravo na prigovor
     Agenciji.
5. Identitet podnosioca potvrditi prije postupanja ako postoji sumnja (čl. 14 st. 7).

## 3. Izvoz podataka (pristup i prenosivost)

1. *Privatnost → Izvozi → Novi izvoz* (ili profil korisnika → „Izvezi podatke“). Poveže se sa zahtjevom.
2. Prilozi su zadano uključeni. Tuđe interne bilješke su zadano isključene, a njihovo uključivanje traži
   obrazloženje koje ide u audit.
3. Posao prolazi kroz statuse QUEUED → RUNNING → READY. Paket je ZIP, šifrovan na disku.
4. **Preuzimanje traži svjež MFA kod.** Preuzimaju DPO ili administrator, pa predaju podnosiocu
   sigurnim kanalom. Link važi `linkValidDays` (7 d), a nakon toga se paket briše.
5. Ako se pojavi „Prijava je istekla“ prilikom MFA: to znači da je 5-minutni MFA token istekao. Treba se
   ponovo prijaviti. Nije potreban reset MFA.

## 4. Anonimizacija bivšeg zaposlenika

1. *Privatnost → Anonimizacija* prikazuje kandidate: naloge deaktivirane 180+ dana.
2. **Pregled (dry-run) je obavezan.** Pokazuje broj zahvaćenih zapisa i primjere zamjene u tekstu. Zamjena
   pogađa samo pun naziv, e-mail i login.
3. Potvrda traži MFA, a uz uključenu opciju i drugog odobravaoca. Operacija je **nepovratna**:
   - ime i e-mail se zamjenjuju pseudonimom bez veze s osobom;
   - prilozi se zadano zadržavaju;
   - hash lanac audita ostaje provjerljiv.
4. Aktivni legal hold na korisniku blokira anonimizaciju.
5. Ponovni AD sync ne vraća osobu, jer to sprječava HMAC tombstone.

## 5. Zadržavanje (retencija) i legal hold

- Retencija radi noću (`runAtLocalTime`, zadano 02:30), najviše `maxMinutesPerNight` (30 min), u serijama.
  Briše se sadržaj, a kostur tiketa i metrika ostaju, pa se izvještaji, SLA i CSAT ne mijenjaju.
- **Prije uključivanja nove kategorije treba pokrenuti dry-run** (*Zadržavanje → Probni prolaz*) i pregledati
  izvještaj. Minimumi po kategoriji se ne mogu spustiti.
- Sedmični e-mail `privacy.retention_weekly` stiže ponedjeljkom u 07:00, samo ako je nešto obrisano.
- **Legal hold** (ADMIN, SUPER_ADMIN): *Privatnost → Pravne blokade*, unosi se broj tiketa ili korisnik,
  uz razlog (min. 10 znakova). Tiket pod blokadom se preskače u retenciji i ima oznaku na detalju.
  Podnosilac tu oznaku ne vidi. Uklanjanje blokade također traži razlog.

## 6. Evidencija obrade i obavještenje

- *Privatnost → Evidencija*: generisani dokument se ispisuje ili sprema kao PDF preko preglednika.
- Obavještenje o obradi je javno na `/privacy-notice`, a link je na login stranici i u meniju profila. Ako
  obavještenje nije dostupno, stranica pokazuje poruku „nedostupno“ (modul isključen) ili „greška“.

## 7. Restore iz backupa

Ledger anonimizacija (`uploads/privacy-ledger/erasures.jsonl`) preživi restore baze. Nakon restore-a
obavezno pokrenuti:

```bash
docker exec -i "$BACKEND" node dist/src/cli/privacy-replay.js           # pregled
docker exec -i "$BACKEND" node dist/src/cli/privacy-replay.js --apply   # izvršenje
```

Detalji se nalaze u `ops/DR.md` (Restore, tačka 6).

## 8. Dijagnostika

| Simptom | Provjera |
|---|---|
| Izvoz ostaje na QUEUED | worker radi? `docker logs <worker> \| grep -i privacy` |
| Preuzimanje vraća 403 IDENTITY_CONFIRMATION_FAILED | pogrešan ili iskorišten TOTP kod; sačekati sljedeći kod |
| Preuzimanje vraća 400 IDENTITY_CONFIRMATION_REQUIRED | klijent nije poslao MFA kod |
| U logu stoji `privacy_ledger_append_failed` | prava na `uploads/privacy-ledger` (0600, vlasnik app). Anonimizacija je izvršena; ledger treba obnoviti s `--export-ledger` |
| Retencija ima status PARTIAL | isteklo je noćno vrijeme; nastavlja se sljedeće noći (posao je idempotentan) |

Povreda podataka: `ops/runbook/povreda-podataka.md` (72 h).
