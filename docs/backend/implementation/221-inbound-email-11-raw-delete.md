# Paket 221 — BA-inbound-email-11: potvrđeno brisanje raw fajla

**Status:** zatvoreno owner-directed; raniji tekst je historija, a preostale granice i dokaz u [paketu 226](226-val6-owner-directed-closeout.md).

`InboundRawStore.remove` sada propagira greške brisanja i odbija nevažeće ključeve; `ENOENT` znači da je fajl već odsutan. Retention se prekida prije orphan prunea i brisanja metadata ako unlink ne uspije. Link se briše tek nakon uspješnog uklanjanja, uz uslov istog ključa i starosti; metadata delete dodatno zahtijeva null raw link. I postojeći pozivalac za anonimizaciju sada dobija grešku umjesto lažne potvrde brisanja. Ne mijenja se schema niti uvodi migracija.

Ciljani lokalni testovi (stub Prisma): unlink uspjeh, ENOENT, nevažeći ključ i greška; retention ne briše link niti metadata na grešci. Autoritativni generated-Prisma CI još čeka.
