# BA-announcements-10: Teams objava se ponavlja nakon privremenog kvara

Status: **otvoreno**. `postTeams` je claimovao najavu (`teamsPostedAt`) prije webhook poziva i zbog toga due upit (`teamsPostedAt IS NULL`) neuspjelu objavu više nikad nije birao: prolazni webhook kvar bio je terminalan, a crash između uspješnog webhooka i upisa rezultata ostavljao je claim bez rezultata i bez reconciliationa.

## Izmjena

Bez migracije. Due upit i claim sada pored neobjavljenih biraju i `FAILED` claimove starije od 5 minuta, kao i claimove bez rezultata (`teamsResult IS NULL`) starije od 5 minuta (crash reconciliation). Claim u istoj atomarnoj `updateMany` operaciji osvježava `teamsPostedAt` i resetuje rezultat; neuspjeh se ponovo zapisuje kao `FAILED` i sljedeći sweep ga ponavlja dok je najava aktivna. Teams webhook nema provider idempotency, pa crash prozor između webhooka i upisa rezultata može proizvesti duplu objavu u kanalu umjesto izgubljene — to je dokumentovana, svjesna at-least-once granica. `SKIPPED_DISABLED` ostaje terminalan.

## Testovi i granice

`announcement-delivery.spec.ts` dobio je 2 testa: due selekcija uključuje FAILED i result-less claimove, a webhook kvar se zapisuje kao FAILED pod svježim claimom. Lokalno: backend announcements suite 10 suiteova / 68 testova, ciljani ESLint. Bez generated-Prisma/PostgreSQL CI dokaza i operativne potvrde nalaz se ne zatvara.
