# BA-on-call-08: propuštene sweep notifikacije se nadoknađuju

Status: **otvoreno**. Sweep notifikacije su best-effort: reminder se planirao samo unutar jednog sata dnevno, a shift-start samo 30 minuta nakon početka smjene. Ako je worker bio nedostupan ili je slanje padalo duže od tog prozora, notifikacija je zauvijek gubljena — bez ikakvog recoveryja.

## Izmjena

Planner (`plan-on-call-sweep`) sada radi missed-action reconciliation oslonjenu na postojeći trajni zapis — dedupe ključ persistirane notifikacije (`oncall:reminder:…`, `oncall:start:…`): već poslana akcija ostaje no-op, a neposlana se emituje zakasnelo. Konkretno: shift-start se planira za početak smjene unutar zadnjih 24 sata (umjesto 30 minuta), a reminder za sutrašnju smjenu i nakon što je današnji reminder sat prošao, sve dok smjena nije počela. Gap akcije su se i ranije replanirale pri svakom sweepu dok rupa traje, pa se ne mijenjaju. Dedupe ključevi su nepromijenjeni, pa recovery ne može proizvesti duplikat ni prema notifikacijama poslanim prije ove izmjene.

## Testovi i granice

Plan spec pokriva kasni reminder (nakon reminder sata), izostanak ranog remindera prije prozora, kasni shift-start unutar 24 h i odbijanje početka starijeg od 24 h. Recovery horizon je namjerno ograničen (24 h za shift-start, početak smjene za reminder): starije propuštene akcije se ne šalju jer zakasnela informacija gubi operativnu vrijednost. Ako slanje pada duže od horizona (npr. višednevni ispad workera), akcija se i dalje gubi — potpuno durable rješenje tražilo bi persistiranu queue/outbox tabelu (migracija), što je izvan ovog nalaza. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara.
