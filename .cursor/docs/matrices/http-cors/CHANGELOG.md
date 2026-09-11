# CHANGELOG — http-cors

## 2026-09-11
- HTTP CORS na Nest bootstrapu iz `CORS_ORIGIN`. Preflight `OPTIONS` vraća origin + `Authorization`/`Content-Type`. Credentials isključeni (Bearer, ne cookie).
