# Backend Val 2 — W2.4 fail-closed step-up i emergency/recovery tokovi

## 1. Status i dokaz

- Status: **završen centralni step-up paket**.
- Implementacija: `ffa9371288b02345314e6320af688fee71be5e3b`.
- Kompatibilnost odgovora: `8206056d810e4cab0ab629cd96831309c11b66d0`.
- Kanonski CI: **40122665418**, potpuno zelen.

## 2. Centralna sigurnosna granica

`StepUpPolicyService` je jedini proof boundary za rate-limit izmjene i emergency bulk password reset. Prije bilo koje mutacije provjerava:

1. purpose je kanonski, ograničen slug;
2. caller postoji i aktivan je;
3. privilegovani tok zahtijeva persisted local-only `SUPER_ADMIN` identitet;
4. session-bound, purpose-bound passkey marker se troši jednokratno; ili
5. postoji MFA enrollment i validan TOTP/recovery dokaz.

Nema grane „MFA nije uključen — nastavi“. Marker-store greška je ambiguous consume i završava odbijanjem bez fallbacka na drugi faktor. Time eventualno potrošen marker ne može biti ponovo iskorišten nakon dependency greške.

## 3. Migrirani tokovi

- `SecurityRateLimitsService.update` više nema vlastitu, fail-open MFA granu.
- `BulkPasswordResetService.execute` koristi istu centralnu odluku.
- Oba purposea su serverske konstante; malformed/caller-controlled purpose se odbija.
- Existing recovery-code verifier ostaje atomsku CAS potrošnju u `MfaService`; centralni policy prihvata njegov rezultat kao recovery dokaz.

## 4. Negativni dokaz

Testovi pokrivaju:

- replay: prvi consume prolazi, drugi je odbijen;
- expiry/absence: marker koji više ne postoji zahtijeva drugi faktor;
- MFA-disabled privileged caller: odbijen prije writea;
- non-local ili obični admin: odbijen prije consumea;
- degraded marker dependency: fail-closed bez TOTP fallbacka;
- malformed purpose: odbijen;
- wrong TOTP/recovery dokaz: postojeći verifier odbija;
- stvarni PostgreSQL: persisted non-local emergency actor je odbijen prije trošenja proofa.

Integration suite je registrovan u isolated real-PostgreSQL runneru.

## 5. Findings odluka

- `BA-security-01` je zatvoren.
- `BA-authentication-03` ostaje otvoren: login/enrollment MFA JWT još zahtijeva poseban durable atomic claim.
- `BA-security-02`–`11` ostaju otvoreni gdje traže durable bulk operation, audit atomarnost, authorization epoch, TOCTOU, abuse limiting i observability.

## 6. Sljedeći paket

**W2.5 — role/permission mutation constraints i last-admin zaštite:** uvesti transakcijske invariants za posljednjeg SuperAdmina/obavezne permissione, concurrency dokaz i odobreni repair/constraint korak za assignment podatke.
