# MATRIX — http-cors

## Cilj
HTTP CORS na Nest bootstrapu. Isti Coolify ključ kao Socket.IO (`CORS_ORIGIN`). Nije Settings registry.

## Konfiguracija
| Key | Uloga |
|---|---|
| `CORS_ORIGIN` | dozvoljeni browser origin; trim; prazan/unset ⇒ `origin: false` (nikad `*`) |
| `APP_PUBLIC_URL` | public web URL; nije CORS source |

## Ponašanje
- `configureApplicationCors` poziva `enableCors` u `main.ts`.
- `credentials: false` — HTTP auth je Bearer JWT u `Authorization`, ne cookie.
- Preflight `OPTIONS` završava u cors middlewareu (204) prije guardova.
- `allowedHeaders`: `Accept`, `Authorization`, `Content-Type`.
- Metode: `GET`, `HEAD`, `PUT`, `PATCH`, `POST`, `DELETE`, `OPTIONS`.

## Namjerno NIJE implementirano
Fallback na `APP_PUBLIC_URL`, više origin-a, `*`, cookie credentials, Settings ključ.
