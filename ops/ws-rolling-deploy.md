# WebSocket — rolling deploy i horizontalno skaliranje (Faza 3.1)

> Vrijedi od Faze 3.1: Socket.IO više ne koristi in-memory adapter, nego Redis
> pub/sub (`ws-redis-adapter.ts`). Time sobe i emit-i vrijede za **sve** instance,
> ali uvodi dva zahtjeva na infrastrukturu: **sticky sesije** i **drain pri deployu**.

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
   (health check → 503 na `/health`), pa **sačekaj 30 s**. Postojeći WebSocketi
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
| `ws_adapter_redis_ok=1` | adapter instaliran pri bootu | nema (očekivano) |
| `ws_adapter_redis_ok=0 fallback=in_memory` | **degradirano**: sobe su samo lokalne | alarm (instanca ne vidi druge) |
| `ws_adapter_redis_error reason=…` | ioredis reconnectuje | alarm ako traje > 1 min |
| `ws_clients_count=N` | broj konekcija | pad na 0 po instanci = završen drain |

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
