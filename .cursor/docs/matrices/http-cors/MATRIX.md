# MATRIX — http-cors

## Cilj
HTTP CORS na Nest bootstrapu. Isti Coolify ključ kao Socket.IO (`CORS_ORIGIN`). Nije Settings registry.

## Konfiguracija
| Key | Uloga |
|---|---|
| `CORS_ORIGIN` | dozvoljeni origin(i), CSV; trim; `*` se odbacuje; prazan/unset ⇒ `origin: false` |
| `APP_PUBLIC_URL` | public web URL; nije CORS source |

## Ponašanje
- `configureApplicationCors` poziva `enableCors` u `main.ts`.
- Jedan origin ostaje `string`; više origin-a postaje `string[]` (desk + `chrome-extension://<id>`).
- `credentials: false` — HTTP auth je Bearer JWT u `Authorization`, ne cookie.
- Preflight `OPTIONS` završava u cors middlewareu (204) prije guardova.
- `allowedHeaders`: `Accept`, `Authorization`, `Content-Type`.
- Metode: `GET`, `HEAD`, `PUT`, `PATCH`, `POST`, `DELETE`, `OPTIONS`.

## Namjerno NIJE implementirano
Fallback na `APP_PUBLIC_URL`, `*`, cookie credentials, Settings ključ.
