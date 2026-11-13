# Paket 222 — BA-inbound-email-12: redigovane operativne greške

**Status:** zatvoreno owner-directed; raniji tekst je historija, a preostale granice i dokaz u [paketu 226](226-val6-owner-directed-closeout.md).

Worker više ne upisuje sirove exception poruke u mailbox state, stanje pokušaja, notifikacije, rezultat `runOnce` niti relevantne logove. Greške se označavaju stabilnim kodovima `INBOUND_MAILBOX_FAILED`, `INBOUND_MESSAGE_PROCESSING_FAILED`, `INBOUND_NOTICE_FAILED` i `INBOUND_MAILBOX_MISCONFIGURED`. Kvar mailboxa namjerno ima generički kod: provider tekst i kredencijali ne otkrivaju se radi detaljnije dijagnostike. Kod konfiguracije UI i dalje dobija zasebnu listu validacijskih problema. Postojeći historijski zapisi se ovom promjenom ne brišu niti migriraju; admin API ih i dalje rediguje.

Graph HTTP greška više ne uključuje response body i putanju, Entra token greška ne uključuje provider tekst, a IMAP move greška ne uključuje naziv foldera. Test simulira provider grešku s adresom i tajnom te provjerava zapis, rezultat i log. Ciljani lokalni testovi prolaze sa stub Prisma klijentom; generated-Prisma CI je autoritativan. Bez schema promjene ili migracije.
