# Runbook: rotacija tajni aplikacije

> Obuhvata `INSTALL_TOKEN`, `INBOUND_EMAIL_TOKEN_SECRET`, `PRIVACY_TOMBSTONE_KEY`, `PRIVACY_EXPORT_KEY` i
> `MFA_ENCRYPTION_KEY`. Za `JWT_SECRET`, lozinke baze i Redisa te SMTP/Graph tajne vidi
> `ops/runbook/povreda-podataka.md` §1.
>
> **Pravilo:** vrijednosti tajni se nikad ne lijepe u tiket, chat ni commit. Čuvaju se samo u sefu tajni i
> u okruženju (Coolify → Environment Variables). Alat `secrets.js` ne ispisuje tajne. Izuzetak je komanda
> `pins`, čija je jedina svrha da ih ispiše.

## 0. Alat i oznake

```bash
BACKEND=$(docker ps --format '{{.Names}}' | grep '^backend-' | head -1)   # na stagingu: backend-hmlli6jjjun5c49kuprzthai
docker exec -i "$BACKEND" node dist/src/cli/secrets.js status
```

`status` prikazuje stanje svakog ključa:
- `ok`, `set` ili `not set`;
- `explicit`: zadan kao tekst;
- `pinned`: zadan kao `base64:…`;
- `derived`: izveden iz `MFA_ENCRYPTION_KEY`;
- `missing`.

Uz to prikazuje broj MFA tajni po ključu, broj anonimizacija s tombstone-ima i broj izvoza koji se još mogu
preuzeti. Exit kod 0 znači `status=ok`, a 1 znači da je potrebna akcija.

**Zavisni ključevi.** Ako `INBOUND_EMAIL_TOKEN_SECRET`, `PRIVACY_TOMBSTONE_KEY` ili `PRIVACY_EXPORT_KEY`
nisu zadani, izvode se iz `MFA_ENCRYPTION_KEY`. Promjena MFA ključa bi ih tada tiho promijenila. Zato se oni
rotiraju ili „pinuju“ **prije** MFA ključa (faza C to i provjerava).

**Pin.** `secrets.js pins` ispisuje trenutno izvedene vrijednosti u obliku `KLJUČ=base64:…`. Kad se takva
vrijednost upiše u okruženje, ponašanje ostaje **bit-identično**, ali ključ više ne zavisi od MFA ključa.

**Generisanje novih vrijednosti:**
```bash
openssl rand -hex 32        # INBOUND_EMAIL_TOKEN_SECRET, PRIVACY_TOMBSTONE_KEY, PRIVACY_EXPORT_KEY, INSTALL_TOKEN
openssl rand -base64 32     # MFA_ENCRYPTION_KEY (tačno 32 bajta, base64)
```

Nakon svake promjene okruženja treba uraditi **redeploy backenda i workera**, jer oba čitaju iste ključeve.

## A. Odmah, bez posljedica po podatke

### A1. `INSTALL_TOKEN`
Nakon završene instalacije wizard je zaključan bez obzira na token. Token treba **ukloniti** iz okruženja.
- Provjera: `curl -s https://<api>/install/status` vraća završenu instalaciju.
- Ako se instalira novo okruženje, token se ponovo generiše i uklanja se odmah nakon instalacije.

### A2. `INBOUND_EMAIL_TOKEN_SECRET`
Tajna potpisuje reply-token u Message-ID odlaznih e-mailova. Odgovor na stari e-mail bi se i bez nje vezao
za tiket, preko niti ili broja u naslovu. Stara tajna se ipak zadržava 30 dana, da tačno uparivanje
primaoca ostane isto.
1. `status`. Ako je stanje `derived`, pokrenuti `secrets.js pins` i sačuvati red `INBOUND_EMAIL_TOKEN_SECRET=base64:…`.
2. U okruženju:
   - `INBOUND_EMAIL_TOKEN_SECRET_PREVIOUS` = stara vrijednost (tekst ili `base64:…` iz koraka 1);
   - `INBOUND_EMAIL_TOKEN_SECRET` = nova vrijednost (`openssl rand -hex 32`).
3. Uraditi redeploy, a zatim `status`. Očekivano stanje je `explicit (+ _PREVIOUS set)`.
4. **Nakon 30 dana** ukloniti `_PREVIOUS` i uraditi redeploy.

## B. Uz provjeru posljedica

### B1. `PRIVACY_TOMBSTONE_KEY`
HMAC se ne može preračunati novim ključem.
- Ako `status` pokazuje `Completed erasures with tombstones: 0`, dovoljno je zadati novu vrijednost.
- Ako je broj veći od 0, stari ključ (ili njegov pin) ide u `PRIVACY_TOMBSTONE_KEY_PREVIOUS` i **ostaje tamo**
  dok god je bitno prepoznati povratak tih osoba. Nove anonimizacije uvijek koriste novi ključ.

### B2. `PRIVACY_EXPORT_KEY`
Izvozi koji su već šifrovani starim ključem postaju nečitljivi.
- Rotaciju raditi kad `status` pokaže `Downloadable exports: 0`.
- Ako to nije moguće, zatraženi izvoz se nakon rotacije jednostavno ponovo pokrene.
- `_PREVIOUS` ne postoji namjerno, jer izvoz ionako ističe za 7 dana.

## C. `MFA_ENCRYPTION_KEY` (ponovno šifrovanje, bez ponovnog postavljanja MFA)

**Preduslov:** `status` ne smije pokazivati nijedan `derived`. Ako pokazuje, prvo treba uraditi A2, B1 i B2
ili pinovati ključeve (`pins`, upisati vrijednosti, redeploy).

1. Sačuvati **stari** ključ i generisati novi (`openssl rand -base64 32`). Oba spremiti u sef.
2. U okruženju:
   - `MFA_ENCRYPTION_KEY_PREVIOUS` = stari ključ;
   - `MFA_ENCRYPTION_KEY` = novi ključ.

   Uraditi redeploy backenda i workera. Od tog trenutka prijava radi s obje verzije ključa, a nove tajne
   se pišu novim ključem.
3. Pregled bez izmjena:
   ```bash
   docker exec -i "$BACKEND" node dist/src/cli/secrets.js reencrypt-mfa
   ```
   Očekivano: `to_reencrypt=N unreadable=0`.
   - Ako je `unreadable` veći od 0, te tajne nisu šifrovane nijednim od dva ključa. Tim korisnicima treba
     `reset-mfa` (`ops/runbook/mfa-reset.md`).
4. Izvršenje:
   ```bash
   docker exec -i "$BACKEND" node dist/src/cli/secrets.js reencrypt-mfa --apply --reason "rotacija MFA ključa <datum>"
   ```
   - Exit 0 znači da je sve prebačeno. Rezultat se upisuje u audit kao `security.mfa_secrets.reencrypted`.
   - `concurrent_skip` veći od 0 znači da je neko baš tada mijenjao MFA. U tom slučaju komandu treba ponoviti.
5. `status` mora pokazati `MFA secrets: … previous_key=0 unreadable=0`.
6. Ukloniti `MFA_ENCRYPTION_KEY_PREVIOUS` i uraditi redeploy. Zatim provjeriti prijavu jednim MFA nalogom.
7. Stari ključ uništiti u sefu tek nakon što prođe period čuvanja backupa. Backup baze iz vremena prije
   rotacije i dalje traži stari ključ.

**Povratak (rollback):**
- Do koraka 4: vratiti stari ključ u `MFA_ENCRYPTION_KEY`, ukloniti `_PREVIOUS` i uraditi redeploy.
- Nakon koraka 4: zamijeniti uloge ključeva (novi u `_PREVIOUS`, stari u `MFA_ENCRYPTION_KEY`) i ponovo
  pokrenuti `reencrypt-mfa --apply`.

## D. Kontrolna lista nakon rotacije

- [ ] `secrets.js status` ima exit 0 i pokazuje `status=ok`.
- [ ] Prijava s MFA radi, preuzimanje izvoza traži kod i vraća ZIP.
- [ ] Odgovor e-mailom na notifikaciju dodaje poruku na isti tiket.
- [ ] Nove vrijednosti su u sefu, a stare su označene datumom rotacije.
- [ ] U kalendaru je podsjetnik za uklanjanje `INBOUND_EMAIL_TOKEN_SECRET_PREVIOUS` (za 30 dana).
