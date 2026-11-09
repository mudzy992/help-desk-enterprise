# WebSocket — rolling deploy i horizontalno skaliranje (Faza 3.1)

> U zdravom runtime režimu Socket.IO koristi Redis pub/sub (`ws-redis-adapter.ts`),
> pa sobe i emit-i vrijede za **sve** instance. Boot-time ACL/config deny i dalje može
> ostaviti lokalni in-memory fallback, ali on je readiness-degraded i nije horizontalno
> funkcionalan. Redis režim traži **sticky sesije** i **drain pri deployu**.

## 1. Zašto sticky sesije

Socket.IO klijent radi prvo HTTP polling, pa `upgrade` na WebSocket. Ako prvi
polling zahtjev završi na instanci A, a upgrade na instanci B, handshake padne
(`socket_authentication_rejected`) i klijent ulazi u reconnect petlju.

- LB: uključi sticky po **cookie-u** (npr. Traefik: `sticky.cookie`, nginx:
  `ip_hash` ili `hash $cookie_io`), ili
- postavi `transports: ['websocket']` na klijentu (u ovom repou klijent ih ne
  ograničava, pa sticky ostaje primarni mehanizam).

Redis adapter sam po sebi **ne rješava** sticky: on širi emit-e preko instanci,
ali handshake i dalje mora ostati na jednoj.

## 2. Drain procedura (rolling deploy)

Cilj: nijedan klijent ne ostane bez događaja, a pauza ostane < 5 s za < 1% klijenata.

1. **Označi instancu kao "ne primaj nove"** — u LB-u skini instancu iz rotacije
   (`/health/ready` → 503 ili ručni drain), pa **sačekaj 30 s**. Postojeći WebSocketi
   ostaju otvoreni, novi ne dolaze.
2. **Zatvori sokete meko**: instanca šalje `server.disconnectSockets(false)` ili se
   gasi nakon `SO_LINGER`-a (postojeći `onModuleDestroy` prvo zatvara adapter, pa
   onda HTTP server).
3. **Kill instancu** tek kad je broj konekcija pao na 0 (metrika `ws_clients_count`
   iz Faze 0 se loguje svakih 30 s: `ws_clients_count=0` je zeleno svjetlo).
4. Ponovi za sljedeću instancu. Klijentima je reconnect jitterovan
   (`randomizationFactor: 0.5`, 500 ms – 10 s), pa se ne vraćaju svi u istom
   milisekundu.

**Rollback:** stara instanca i nova instanca koriste isti Redis adapter → emit-i s
jedne vidljivi su i na drugoj; ako nova verzija ima grešku, vrati staru sliku —
klijenti se sami reconnectuju (jitter).

## 3. Metrike i alarmi

| Linija u logu | Značenje | Alarm |
|---|---|---|
| `ws_adapter_redis_ok=1 ws_adapter_redis_state=healthy` | stvarni adapter `PSUBSCRIBE`/`SUBSCRIBE` i room-channel Pub/Sub echo probe su prošli | nema; očekuje se na svakoj spremnoj instanci |
| `ws_adapter_redis_ok=0 ws_adapter_redis_state=starting/degraded` | adapter još nije dokazan ili je Redis/ACL put pao; runtime ostaje Redis adapter, bez lokalnog switcha | readiness `/health/ready` je 503; alarm na pogođenu instancu |
| `fallback=in_memory reason=acl_denied` | boot-time Redis adapter nije instaliran; sobe su samo lokalne | readiness 503; popravi ACL pa rolling-restartuj instancu |
| `ws_adapter_redis_error` / `ws_adapter_redis_command_denied/failed` | ioredis reconnectuje ili je command odbijen; health probe pokušava oporavak svakih 15 s | alarm dok readiness ne postane zelen |
| `ws_clients_count=N` | broj konekcija | pad na 0 po instanci = završen drain |

Readiness je procesno/per-instance signal, ne dokaz da svaki realtime event ima client
acknowledgement. Tokom Redis outagea mogu se izgubiti eventi; ne postoji durable replay
ugovor i reconnect klijent treba osvježiti stanje preko REST-a. Boot fallback nakon ACL
deny-ja traži rolling restart poslije ACL popravke.

## 4. Dokaz da dvije instance dijele sobe

Automatizovana provjera (zahtijeva Redis; u ovom okruženju nije izvršena):

```bash
redis-server --port 6379 &            # ili docker run -p 6379:6379 redis:7
node ops/ws-cross-instance-check.mjs  # 2 socket.io servera + 1 klijent
# očekivano: "✔ klijent na instanci B dobio je emit s instance A"
```

Skripta podiže dvije Socket.IO instance s Redis adapterom, spoji klijenta na B,
emituje s A i traži da poruka stigne — to je isti dokaz koji kapija Faze 3 traži
(„cross-instance emit dokazan").

## 5. Group feed payload compatibility

`group.feed-changed` je podržan događaj za osvježavanje grupnih listi; repo frontend
se na njega pretplaćuje. Group sobe su zasnovane na članstvu, a članstvo samo po sebi
nije per-ticket autorizacija. Zato je puni legacy `ticket.updated`/`ticket.message.created`
payload prema `group:*` sobama **isključen po defaultu**.

`WS_GROUP_FEED_LEGACY_FULL_EMIT=on` je isključivo eksplicitni, privremeni rolling-deploy
compatibility izuzetak za klijente starije od 3.2. Dok je uključen, puni javni ticket/message
payload ide svim članovima grupe bez per-ticket provjere; startup warning je namjerna
sigurnosna eskalacija, ne odobrenje za trajnu upotrebu. Ne uključivati ga kao trajni
fallback. Ako je potreban tokom kontrolisanog prelaza:

1. prvo potvrditi i pustiti klijentsku verziju koja sluša `group.feed-changed`;
2. samo ako još postoje stari povezani klijenti, eksplicitno postaviti flag na `on` kroz
   dokumentovani, vremenski ograničen compatibility window;
3. nakon što su stari klijenti zamijenjeni/reconnected, ukloniti varijablu ili postaviti
   `WS_GROUP_FEED_LEGACY_FULL_EMIT=off`, zatim rolling-redeploy backend;
4. provjeriti startup log da je legacy emit `OFF`; ne oslanjati se na automatsko gašenje po
   uptimeu ili na samu metriku emitova.

Nepoznata vrijednost, prazna varijabla i unset stanje tretiraju se kao `off`. Ako se ne može
potvrditi kompatibilnost klijenata, ne uključivati puni payload; radije pustiti novi UI koji
podržava laki event i provjeriti list refresh kroz uobičajeni release acceptance.
