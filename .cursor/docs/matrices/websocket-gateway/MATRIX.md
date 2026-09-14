# MATRIX — websocket-gateway

## Cilj
Socket.IO handshake: konekcija se prihvata samo nakon provider-neutral autentikacije. Domain eventi idu kroz hubove; handshake i dalje vidi samo `{ subjectId }`.

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
- **Input:** `handshake.auth.token` (string). Ostala polja se ignoriraju (uključujući `extensionVersion` ako klijent pošalje).
- **Processing:** `SocketAuthenticationService` parsira input i delegira na `SOCKET_AUTHENTICATION_VERIFIER`.
- **Success:** `{ subjectId }` kao `socket.data.principal`. Bez tokena, uloga, OU, permisija.
- **Failure:** klijent dobija samo `AUTHENTICATION_FAILED`. Razlog (`missing_credentials` | `invalid_credentials`) ide samo u log uz `connectionId`.

## Default verifier
`JwtSocketAuthenticationVerifier` (authentication modul) verifikuje session JWT iz `handshake.auth.token`. Nevažeći/istekli token ili nedostajući signing secret → unauthenticated. Nema fake usera, hardcoded tokena, niti `NODE_ENV` bypass-a.

## Lifecycle
`afterInit` registruje handshake middleware. `handleConnection` odbija socket bez principala i join-a `user:{subjectId}`. `handleDisconnect` samo loguje.

## Domain eventi
Gateway sluša `TicketRealtimeHub` / `SettingsRealtimeHub` (servisi ne emituju na socket). Eventi: `ticket.message.created`, `ticket.updated`, `notification.*`, `settings.updated`, `session.invalidated`. `notification.*` client payload uključuje `eventId` + `createdAt`. Ticket join i dalje ide kroz `TicketsCollaborationService.authorizeSocketJoin`.

## CORS
`CORS_ORIGIN` iz env. Ako nije postavljen, origin je `false` (nije `*`). HTTP CORS koristi isti ključ (`.cursor/docs/matrices/http-cors/MATRIX.md`).

## Namjerno NIJE implementirano
Redis adapter, typing indicator, message edit/delete (nema REST podrške). Handshake i dalje vidi samo `{ subjectId }`.
