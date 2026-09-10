# MATRIX — settings-registry

## Cilj
Centralni, tipizirani katalog aplikacijskih postavki. Registry je source of truth za ponašanje; `AppSetting` čuva samo trenutnu vrijednost.

## Klasifikacija
- `public` — smije se vratiti kroz `getPublicSettings()`; nikad credentials.
- `private` — serverside konfiguracija; nije u public retrieval; nije secret materijal.
- `secret` — credentials/tokeni; samo `getSecretForInternalUse()`; nikad plaintext u public/private snapshotima, logovima ili običnim error porukama.

Visibility se **ne** izvodi iz imena ključa. DB `AppSetting.scope` / `isSecret` se ne koriste za exposure.

## Retrieval
- `getPublicSettings()` — samo registry `public` ključevi.
- `getPrivateSettings()` — samo registry `private` ključevi.
- `getSetting(key)` — public/private; secret baca grešku.
- `getSecretForInternalUse(key)` — samo secret; ostalo baca grešku.
- Nema `getAllSettings()`.
- Nepoznat ključ → `SettingsError`.
- Nema DB reda: default ako postoji; inače `undefined` ako nije required, ili `SettingsError` ako jeste.

## Persistence
- Model: postojeći `AppSetting` (bez schema izmjene).
- Upis kopira registry classification u `scope` + `isSecret` (secret → `PRIVATE` + `isSecret=true`).
- Čitanje overlay: stored value > default.

## Zabranjeno
- Secret default vrijednosti.
- Logovanje/dump setting vrijednosti na startupu.
- HTTP CRUD / Settings UI / RBAC u ovom skeletonu.
- Tumačenje ad-hoc stringova (`smtp.host`) van registryja.

## Seed ključevi (skeleton)
- `public.branding.appName` (public, string, default `EP-HelpDesk`)
- `private.install.completedAt` (private, string, default `""`)
- `private.auth.mode` (private, `local` | `entra_ad`, default `local`)
- `private.auth.jwtSigningSecret` (secret, string, bez defaulta, nije required)
