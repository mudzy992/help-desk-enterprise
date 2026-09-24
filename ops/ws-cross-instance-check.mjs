#!/usr/bin/env node
/**
 * Faza 3.1 — cross-instance dokaz: dva Socket.IO servera (kao dvije API instance)
 * dijele Redis adapter, klijent je spojen na instancu B, a emit ide s instance A.
 *
 * Pokretanje:
 *   node ops/ws-cross-instance-check.mjs                  # puni dokaz (treba Redis)
 *   node ops/ws-cross-instance-check.mjs --preflight      # SAMO Redis + ACL, bez servera
 *   REDIS_URL=redis://ephelpdesk:<lozinka>@127.0.0.1:6380 node ops/ws-cross-instance-check.mjs
 *   node ops/ws-cross-instance-check.mjs --redis-url=redis://127.0.0.1:6379
 *
 * Izlazni kodovi (razlikuju „nije dokazano" od „nije ni mjereno"):
 *   0 = DOKAZANO — emit s instance A stigao je klijentu na instanci B
 *   1 = adapter nije prenio — Redis je zdrav, ali dokaz nije prošao
 *   2 = Redis nedostupan ili ACL odbija kanale — vidi ispis preflighta
 *   3 = greška harnessa (nešto u ovoj skripti, ne u aplikaciji)
 *
 * Zašto postoji `--preflight`: ioredis je prvobitno javljao samo
 * `ECONNRESET` + `MaxRetriesPerRequestError`, što je isti ispis za „tunel ne radi",
 * „loša lozinka" i „ACL odbija kanal". Preflight odradi PING, PSUBSCRIBE,
 * SUBSCRIBE i PUBLISH korak po korak i ispiše TAČAN odgovor Redisa, pa se
 * razlikuju `WRONGPASS`, `NOPERM` i mrežni reset.
 *
 * Napomena o stvarnoj aplikaciji: ona već sama sebi dokazuje adapter pri startu —
 * `checkRealtimeAdapterSubscriptions()` u `backend/src/modules/websocket/ws-redis-adapter.ts`
 * upiše jednu liniju u API log:
 *   ws_adapter_redis_ok=1                      (adapter aktivan)
 *   ws_adapter_redis_acl_denied channel=...    (ACL odbija — radi s in-memory adapterom)
 * Na stagingu je to najjeftiniji dokaz: procitaj log obje instance, bez tunela.
 * Ova skripta je dodatni, aktivni dokaz (emit stvarno prelazi s A na B).
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';

// Server-side paketi žive u backend/, klijentski u frontend/ — skripta se zato
// ne oslanja na cwd, nego učitava svaki paket iz svog paketa.
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));

// Kanali koje `@socket.io/redis-adapter` stvarno koristi. Prepisani su iz
// `backend/src/modules/websocket/ws-redis-adapter.ts` da ne bi odstupali.
const adapterChannelPattern = 'socket.io#/#*';
const adapterRequestChannel = 'socket.io-request#/#';
const adapterResponseChannel = 'socket.io-response#/#';

const args = process.argv.slice(2);
const wantPreflight = args.includes('--preflight');
const wantHelp = args.includes('--help') || args.includes('-h');
const redisUrlArgument = args.find((argument) => argument.startsWith('--redis-url='));
const timeoutArgument = args.find((argument) => argument.startsWith('--timeout='));
const roomArgument = args.find((argument) => argument.startsWith('--room='));

// `group:<id>` i `group.feed-changed` su stvarna imena iz aplikacije
// (`ticket-socket-rooms.ts` i `collaboration.constants.ts`). Prijašnja verzija
// ove skripte je koristila `group.feedChanged` — ime koje u kodu ne postoji.
const room = roomArgument?.slice('--room='.length) || 'group:cross-instance-check';
const eventName = 'group.feed-changed';
const proofTimeoutMs = Number(timeoutArgument?.slice('--timeout='.length) ?? 5_000);
const redisUrl = redisUrlArgument?.slice('--redis-url='.length)
  || process.env.REDIS_URL
  || 'redis://127.0.0.1:6379';

if (wantHelp) {
  console.log(`Upotreba: node ops/ws-cross-instance-check.mjs [opcije]

  --preflight           samo Redis + ACL provjera, ne diže Socket.IO servere
  --redis-url=<url>     npr. redis://ephelpdesk:lozinka@127.0.0.1:6380
  --room=<soba>         default: ${room}
  --timeout=<ms>        koliko se čeka na dokaz, default ${proofTimeoutMs}

  Env: REDIS_URL (ima niži prioritet od --redis-url)

Izlazni kodovi: 0 dokazano · 1 adapter nije prenio · 2 Redis/ACL · 3 greška harnessa`);
  process.exit(0);
}

// Bez ovoga je ioredis znao srušiti proces PRIJE nego se išta ispiše — zadnji
// run je završavao s praznim ispisom i kodom 1, bez ikakvog traga o uzroku.
process.on('unhandledRejection', (reason) => {
  console.error('✖ neočekivano odbačeno obećanje (greška harnessa):');
  console.error(`  ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
  process.exit(3);
});

let Redis;
let Server;
let createAdapter;
let createClient;
try {
  ({ default: Redis } = backendRequire('ioredis'));
  ({ Server } = backendRequire('socket.io'));
  ({ createAdapter } = backendRequire('@socket.io/redis-adapter'));
  ({ io: createClient } = frontendRequire('socket.io-client'));
} catch (error) {
  console.error('✖ nedostaju paketi. Pokreni u backend/ i frontend/ :  npm ci');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(3);
}

/** Prevede sirovi ioredis/Redis odgovor u rečenicu i kôd kojim se dalje radi. */
function explainRedisError(error) {
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'CLOSED_BY_PEER') {
    return {
      kind: 'reset',
      hint: 'veza je prihvaćena pa odmah prekinuta — kod SSH tunela ssh prihvati vezu lokalno, pa ne uspije otvoriti kanal do cilja (npr. "redis-core" se ne razrješava na SSH serveru)',
    };
  }
  if (message.includes('WRONGPASS') || message.includes('NOAUTH') || message.includes('invalid username-password')) {
    return {
      kind: 'auth',
      hint: 'pogrešno korisničko ime ili lozinka — REDIS_USERNAME/REDIS_PASSWORD moraju odgovarati ACL korisniku iz ops/redis-acl.line',
    };
  }
  if (message.includes('NOPERM') || message.includes('permissions to access a channel')) {
    return {
      kind: 'acl',
      hint: `ACL odbija kanal. Dodaj ADITIVNO (bez resetchannels): ACL SETUSER ephelpdesk &socket.io#/#* &socket.io-request#/# &socket.io-response#/# , pa ACL SAVE`,
    };
  }
  if (code === 'ECONNRESET' || message.includes('ECONNRESET')) {
    return {
      kind: 'reset',
      hint: 'veza je prihvaćena pa odmah prekinuta — kod SSH tunela to znači da ssh nije uspio otvoriti kanal do cilja (npr. "redis-core" se ne razrješava na SSH serveru). Vidi -v ispis tunela: "channel N: open failed: connect failed: <razlog>"',
    };
  }
  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return { kind: 'refused', hint: 'ništa ne sluša na toj adresi/portu — tunel nije podignut ili je podignut na drugom portu' };
  }
  if (code === 'ENOTFOUND' || message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return { kind: 'dns', hint: 'ime hosta se ne razrješava' };
  }
  if (message.includes('ETIMEDOUT') || message.includes('Connection is closed') || message.includes('ECONN')) {
    return { kind: 'network', hint: 'mrežni problem do Redisa (prekid, timeout, zatvoren tunel)' };
  }
  return { kind: 'other', hint: 'nepoznat uzrok — ispis iznad je sirovi odgovor' };
}

/**
 * Sirovi TCP prob PRIJE ioredisa: pošalje inline `PING` i čeka `+PONG`.
 *
 * Zašto: ioredis s `retryStrategy: () => null` za svaki mrežni kvar javi „Connection
 * is closed.", pa se ECONNREFUSED (ništa ne sluša), ECONNRESET (tunel prihvati pa
 * prekine) i ETIMEDOUT (tunel visi) ne mogu razlikovati. Operativni sistem ovdje
 * daje TAČAN kôd, a to je upravo ono što treba za dijagnozu SSH tunela:
 *   ECONNREFUSED → tunel nije dignut / krivi port
 *   ECONNRESET   → ssh je prihvatio vezu, ali nije uspio otvoriti kanal do cilja
 *   zatvoreno bez ijednog bajta → isto kao ECONNRESET, samo FIN umjesto RST
 *   ETIMEDOUT    → tunel dignut, ali cilj ne odgovara
 */
function rawRedisPing(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('error', (error) =>
      finish({ ok: false, code: error.code ?? 'ERROR', reply: null, message: error.message }));
    socket.once('timeout', () =>
      finish({ ok: false, code: 'ETIMEDOUT', reply: null, message: `nema odgovora ${timeoutMs} ms` }));

    socket.connect(port, host, () => {
      socket.write('PING\r\n');
    });

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\n') || buffer.startsWith('-')) {
        finish({ ok: true, code: null, reply: buffer.trim(), message: null });
      }
    });
    socket.once('close', () =>
      finish({
        ok: false,
        code: 'CLOSED_BY_PEER',
        reply: buffer.trim() || null,
        message: 'veza je prihvaćena, ali je druga strana zatvorila bez odgovora',
      }));
    socket.once('end', () =>
      finish({
        ok: false,
        code: 'CLOSED_BY_PEER',
        reply: buffer.trim() || null,
        message: 'veza je prihvaćena, ali je druga strana zatvorila bez odgovora',
      }));
  });
}

async function preflight() {
  // `retryStrategy: () => null` — jedn pokušaj, pa odmah ispiši razlog. Beskonačni
  // retry je upravo ono što je prethodno sakrilo uzrok iza MaxRetriesPerRequestError.
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    retryStrategy: () => null,
  });

  // Ne gutati greške: ovo je jedini način da se vidi ECONNRESET / WRONGPASS / NOPERM.
  const connectionErrors = [];
  client.on('error', (error) => connectionErrors.push(error));

  const step = async (label, work) => {
    try {
      const value = await work();
      console.log(`  ✔ ${label}${value === undefined ? '' : ` → ${value}`}`);
      return true;
    } catch (error) {
      const { hint } = explainRedisError(error);
      console.error(`  ✖ ${label}`);
      console.error(`      odgovor: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`      značenje: ${hint}`);
      return false;
    }
  };

  const url = new URL(redisUrl);
  const host = url.hostname;
  const port = Number(url.port || 6379);
  console.log('Preflight — Redis i ACL');
  console.log(`  host=${host} port=${port} user=${url.username || '(default)'} pass=${url.password ? '****' : '(nema)'}`);

  // Korak 0: sirovi TCP. Ovo je korak koji razlikuje „tunel nije dignut" od
  // „tunel prihvati pa prekine" — ioredis za oba kaže samo „Connection is closed."
  const probe = await rawRedisPing(host, port, 5_000);
  if (!probe.ok) {
    const { hint } = explainRedisError({ code: probe.code, message: probe.message });
    console.error(`  ✖ TCP prob — kôd ${probe.code}`);
    console.error(`      odgovor: ${probe.message}`);
    console.error(`      značenje: ${hint}`);
    if (probe.code === 'ECONNRESET' || probe.code === 'CLOSED_BY_PEER') {
      console.error('      tunel: u ispisu `ssh -v` traži liniju oblika');
      console.error('             "channel N: open failed: connect failed: <razlog>"');
    }
    console.error('\n  Preflight zaustavljen: do Redisa se ne dolazi, daljnji koraci bi dali isti ispis.');
    client.disconnect();
    return false;
  }
  if (probe.reply === '+PONG') {
    console.log('  ✔ TCP prob → +PONG (Redis odgovara; lozinka nije tražena)');
  } else if (probe.reply?.startsWith('-NOAUTH') || probe.reply?.startsWith('-WRONGPASS')) {
    console.log(`  ✔ TCP prob → ${probe.reply} (TCP radi; lozinka se provjerava preko ioredisa)`);
  } else {
    console.log(`  ✔ TCP prob → ${probe.reply ?? '(bez odgovora, ali veza je otvorena)'}`);
  }

  let ok = true;
  try {
    await client.connect();
    console.log('  ✔ AUTH / handshake (ioredis)');
  } catch (error) {
    const { hint } = explainRedisError(error);
    console.error('  ✖ AUTH / handshake (ioredis)');
    console.error(`      odgovor: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`      značenje: ${hint}`);
    console.error('\n  Preflight zaustavljen: do Redisa se ne dolazi, daljnji koraci bi dali isti ispis.');
    client.disconnect();
    return false;
  }

  // Redoslijed je obavezan: čim konekcija uđe u subscriber mod, PUBLISH više ne
  // prolazi ("Connection in subscriber mode"). Zato PUBLISH ide PRIJE subscribe
  // komandi — inače preflight sam sebi stvori lažnu grešku.
  ok = (await step('PING', async () => client.ping())) && ok;
  ok = (await step('PUBLISH probni paket', () => client.publish('socket.io#/#preflight#', '1'))) && ok;
  ok = (await step(`PSUBSCRIBE ${adapterChannelPattern}`, () => client.psubscribe(adapterChannelPattern))) && ok;
  ok = (await step(`SUBSCRIBE ${adapterRequestChannel} , ${adapterResponseChannel}`, () => client.subscribe(adapterRequestChannel, adapterResponseChannel))) && ok;

  client.disconnect();
  return ok;
}

async function bootInstance(port) {
  const httpServer = createServer();
  const server = new Server(httpServer, { cors: { origin: '*' } });
  const pub = new Redis(redisUrl);
  const sub = new Redis(redisUrl);
  // Prijašnja verzija je ovdje imala `() => undefined` — zato se nikada nije
  // vidjelo ZAŠTO adapter ne radi. Sada se greška ispiše, ali ne ruši proces.
  const report = (role) => (error) => {
    const { hint } = explainRedisError(error);
    console.error(`  ! redis ${role} (instanca ${port}): ${error.message}`);
    console.error(`      značenje: ${hint}`);
  };
  sub.on('error', report('sub'));
  pub.on('error', report('pub'));
  server.adapter(createAdapter(pub, sub));

  // OVO JE KLJUČNA POPRAVKA: prijašnja verzija nije imala NIJEDAN `connection`
  // handler, pa klijent nikada nije ušao u sobu. `server.in(room).socketsJoin(room)`
  // je tada birao prazan skup i bio no-op, emit s A je išao u praznu sobu i provjera
  // je padala na timeoutu — i uz potpuno zdrav Redis.
  server.on('connection', (socket) => {
    socket.on('join', (requestedRoom) => {
      if (requestedRoom === room) {
        socket.join(room);
      }
    });
  });

  await new Promise((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
  return {
    server,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      // `quit` zna odbaciti "Connection is closed." — to je čišćenje, ne presuda.
      await Promise.allSettled([pub.quit(), sub.quit()]);
    },
  };
}

async function main() {
  const redisOk = await preflight();
  if (!redisOk) {
    console.error('\n✖ Preflight nije prošao — dokaz se ne može mjeriti.');
    console.error('  Popravi Redis/tunel/ACL gore, pa ponovi. (Izlazni kôd 2 = nije ni mjereno.)');
    process.exit(2);
  }
  if (wantPreflight) {
    console.log('\n✔ Preflight prošao (samo Redis/ACL — dokaz preskočen opcijom --preflight).');
    process.exit(0);
  }

  console.log('\nDokaz — dvije instance, jedan Redis adapter');
  const instanceA = await bootInstance(4321);
  const instanceB = await bootInstance(4322);

  const client = createClient('http://127.0.0.1:4322', { transports: ['websocket'] });
  const delivered = new Promise((resolve) => {
    client.on(eventName, (payload) => resolve(payload));
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('klijent se nije spojio na instancu B u 5 s')), 5_000);
    client.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  client.emit('join', room);

  // Čekaj da instanca B stvarno vidi socket u sobi — umjesto fiksnih 150 ms, koji
  // su bili slijepi na spori adapter i pravili lažne negativne rezultate.
  const inRoom = await (async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const sockets = await instanceB.server.in(room).fetchSockets();
      if (sockets.length > 0) return sockets.length;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 0;
  })();

  if (inRoom === 0) {
    console.error('✖ instanca B ne vidi nijedan socket u sobi — provjera je neispravna, ne adapter.');
    client.close();
    await instanceA.close();
    await instanceB.close();
    process.exit(3);
  }
  console.log(`  ✔ instanca B vidi ${inRoom} socket u sobi ${room}`);

  // Emit ide s instance A; adapter ga mora prenijeti u sobu na instanci B.
  instanceA.server.to(room).emit(eventName, {
    groupId: room.slice('group:'.length),
    ticketId: 'ticket-1',
    kind: 'status',
  });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), proofTimeoutMs));
  const payload = await Promise.race([delivered, timeout]);

  client.close();
  await instanceA.close();
  await instanceB.close();

  if (payload === null) {
    console.error(`✖ klijent na instanci B NIJE dobio emit s instance A u ${proofTimeoutMs} ms`);
    console.error('  Redis je zdrav (preflight prošao), dakle adapter ne prenosi paket.');
    process.exit(1);
  }
  console.log(`✔ klijent na instanci B dobio je emit s instance A (${eventName}):`, payload);
  process.exit(0);
}

main().catch((error) => {
  console.error('✖ greška harnessa:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(3);
});
