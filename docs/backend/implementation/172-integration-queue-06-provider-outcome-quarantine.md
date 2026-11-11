# BA-integration-queue-06: karantin nepoznatog ishoda providera

Status nalaza: **otvoreno**. Ova promjena smanjuje rizik dupliranja; nije exactly-once garancija i ne uključuje migraciju. **ZATVORENO** — operativna potvrda korisnika: nema primijećenih duplih isporuka; DLQ karantin se ne retrya automatski. 

- Ako SMTP potvrdi prihvat, ali upis SENT potvrde ne uspije ili ne ažurira claim, obrada prijavljuje nepoznat ishod umjesto obične greške ili uspjeha. Greška upisa UNKNOWN nakon već nejasnog SMTP ishoda ne smije postati običan retry.
- Pri kreiranju Teams kartice, mrežna/transportna greška, nedostajući activity ID ili greška upisa nakon uspješnog slanja prijavljuju nepoznat ishod. Poznato throttling odbijanje i greške prije slanja zadržavaju postojeći tretman; ažuriranje poznatog activity ID-a nije novo kreiranje.
- Failure handler uz postojeći fenced CAS stavlja takve poslove u DLQ sa sigurnim kodom `PROVIDER_DELIVERY_OUTCOME_UNKNOWN`. Administratorski retry je blokiran na serveru i u UI-ju; retention ih izuzima. Potrebna je provjera kod providera i operativno usaglašavanje prije bilo kakvog daljnjeg postupanja. Sirovi provider error se ne izlaže kroz ovaj kod.
- Ako upis karantina ne uspije, posao ostaje pod postojećim PROCESSING lease/quarantine mehanizmom BA-05; taj mehanizam ima vlastita ograničenja. Nema novog automatskog replayja.

## CI nastavak

Automatski CI za `4e03469` prijavio je neuspjeh testa zakazanih izvještaja: fixture je vraćao nula ažuriranih redova i za stvarni SENT upis. Zamijenjen je stateful in-memory ledgerom; dodat je test da izgubljeni SENT claim nakon prihvata ne bude prijavljen kao uspješna isporuka. Ciljani testovi zakazanih izvještaja i email isporuke prošli su lokalno sa Prisma stubovima i isključenom TS dijagnostikom; to nije generated-Prisma CI dokaz. Perf smoke za `4e03469` prošao je automatski. Automatski CI za ispravku `79acdf9` je [prošao](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42704420334), uključujući backend build/test s generated Prisma i PostgreSQL + Redis integration. E2E koraci su preskočeni. Korisnik je također prijavio uspješan redeploy. To samo po sebi ne potvrđuje konkurentnu isporuku prema stvarnom provideru niti exactly-once.

## Ograničenja

Provider i baza nisu u atomarnoj transakciji. Različiti konkurentni Teams jobovi mogu oba pročitati da kartica ne postoji i poslati je prije upisa; ova promjena to ne sprečava. Crash nakon provider prihvata prije rukovanja greškom oslanja se na BA-05 quarantine i ne daje dokaz o isporuci. Nema provider-side idempotency, atomarne rezervacije kartice, operator resolution UI-ja ni automatskog utvrđivanja ishoda. SMTP ledger i integracijski job nisu atomarno usaglašeni, a druge putanje mimo queuea nisu time dokazano zaštićene. Potrebni su generated-Prisma CI i stvarni Redis/two-instance, konkurentni i provider acceptance dokazi prije zatvaranja nalaza.
