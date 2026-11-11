# W6.54 — BA-websocket-11: ograničene ticket subscriptione

**Status:** zatvoreno (2026-10-29) operativnom potvrdom vlasnika uz CI dokaz; vidi audit 18 §30.

## Promjena

- Socket može imati najviše **20 različitih** aktivnih ili započetih ticket subscriptiona; base i audience soba čine jednu subscription. Limit se rezerviše sinhrono prije autorizacije i prije čekanja ticket revalidationa, pa paralelni zahtjevi ne mogu zauzeti više mjesta. Ponovljeni join istog ticketa ne zauzima novo mjesto; reference pending pokušaja čuvaju invalidation interes do završetka posljednjeg pokušaja.
- Novi ticket iznad limita vraća ack `{ ok: false, code: 'TICKET_ROOM_LIMIT' }` bez ticket authorization čitanja i bez diranja postojećih subscriptiona. Ponovljeni join postojećeg ticketa i dalje se reautorizuje. Neuspješna autorizacija oslobađa rezervaciju; leave zadržava slot dok room leave ne završi, a neuspješan room leave disconnecta socket. Disconnect uklanja registry/pending reference; register odbija subscription bez preostalog interesa.
- Postojeći ticket-detail hook šalje leave pri promjeni ticketa i unmountu; ne uvodi se LRU eviction koji bi tiho prekinuo drugi aktivni pogled. Socket rate limiter i dalje može odbiti leave; tada slot ostaje zauzet do uspješnog leavea, revoke-a ili disconnecta. Postojeći frontend ne obrađuje join ack niti prikazuje limit korisniku; klijenti koji žele jasan UX moraju obraditi navedeni kod i napustiti neupotrijebljene sobe prije novog join-a. To je otvorena acceptance/UX granica, a ne tvrdnja o gotovoj notifikaciji.

## Dokaz i granice

Ciljani lokalni Jest: **4 suitea / 26 testova passed**, uz `ts-jest diagnostics:false` zbog nedostajućeg generated Prisma Clienta. Unit testovi pokrivaju pun limit, duplikate, paralelne pending pokušaje, neuspješnu autorizaciju, spori leave, oslobađanje mjesta i registry disconnect cleanup; postojeći actual Socket.IO test provjerava revocation, ne limit preko transporta. Ciljani ESLint je prošao. Nema generated-Prisma typecheck/CI, transportnog limit acceptance testa, korisničkog UI signala ili load testa. Full CI/E2E nije ručno pokretan.

Granica je per socket, ne po korisniku ili clusteru; BA-06 ima zasebne connection i shared rate limite te ostaje otvoren do CI/generated-Prisma i stvarnog Redis/two-instance dokaza. Nedovršena autorizacija ili adapter operacija može privremeno zadržati slot; ovaj paket ne uvodi novi timeout za te operacije. Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. Status registra i Val 6 zbir se ne mijenjaju.
