# BA-on-call-04: bivši član grupe više nije on-call kandidat

Status: **otvoreno**. Rotation član koji je napustio grupu ostajao je u `OnCallScheduleMember` listi, a data loader je availability računao samo iz `user.isActive`/`anonymizedAt`, pa je bivši član i dalje bio resolver rezultat, outside-hours auto-assignment kandidat, SLA primalac i quiet-hours bypass — suprotno dokumentovanom ponašanju da bivši član postaje uncovered.

## Izmjena

`on-call-data.ts` sada za svaki učitani schedule dodatno učitava aktuelna `GroupMember` članstva (jedan upit po loader pozivu, ključevi `groupId:userId`) i član je `isAvailable` samo ako je aktivan, nije anonimizovan **i** i dalje je član grupe tog schedulea. Kako svi potrošači (resolver, `findOnCallUserId` za auto-assignment/SLA, `listUsersOnCallAt` za quiet-hours, sweep gap detekcija, detaljni prikaz segmenata i swap validacija intervala) idu kroz isti loader, bivši član svugdje postaje uncovered gap umjesto da se tiho preskoči ili dodijeli. Postojeći mock u swap specu dopunjen je `groupMember` delegatom.

## Granice

Manualni/swap override zapisi se ne diraju: override i dalje ima prioritet prema postojećem ugovoru, a accept-time revalidacija članstva kolege ostaje `BA-on-call-05`. Član koji je napustio grupu namjerno ostaje u rotation listi (save ga smije zadržati), samo više nije dostupan kandidat. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
