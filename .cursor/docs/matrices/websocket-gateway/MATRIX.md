# MATRIX — websocket-gateway

## Cilj
Socket.IO handshake skeleton: konekcija se prihvata samo nakon provider-neutral autentikacije. Domain eventi, rooms i pravi auth provider nisu dio ovog sloja.

## Tok
```
Socket.IO client
      │
      ▼
handshake.auth (untrusted)
      │
      ▼
parse → SocketHandshakeCredentials
      │
      ▼
SocketAuthenticationVerifier
      │
      ├── authenticated → SocketPrincipal na socket.data
      └── unauthenticated → konekcija odbijena
```

## Handshake ugovor
- **Input:** `handshake.auth.token` (string). Ostala polja se ignoriraju.
- **Processing:** `SocketAuthenticationService` parsira input i delegira na `SOCKET_AUTHENTICATION_VERIFIER`.
- **Success:** `{ subjectId }` kao `socket.data.principal`. Bez tokena, uloga, OU, permisija.
- **Failure:** klijent dobija samo `AUTHENTICATION_FAILED`. Razlog (`missing_credentials` | `invalid_credentials`) ide samo u log uz `connectionId`.

## Default verifier
Dok Faza 1 auth ne postoji, `UnavailableSocketAuthenticationVerifier` uvijek vraća unauthenticated. Nema fake usera, hardcoded tokena, niti `NODE_ENV` bypass-a.

## Lifecycle
`afterInit` registruje handshake middleware. `handleConnection` odbija socket bez principala. `handleDisconnect` samo loguje. Nema business eventa.

## CORS
`CORS_ORIGIN` iz env. Ako nije postavljen, origin je `false` (nije `*`). HTTP CORS se ne dira.

## Namjerno NIJE implementirano
Auth provider (`local` | `entra_ad`), JWT, RBAC, rooms, ticket/chat/notification eventi, Redis adapter, frontend klijent, settings ključevi za socket.
