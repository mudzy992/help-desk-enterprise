# Paket 154 — `BA-inbound-email-02`: trusted authentication results

## Ishod

`BA-inbound-email-02` (P1) zatvoren je na finding nivou za kodni sender-auth checker i konfiguracijski fail-closed ponašaj. Ovo nije operativna potvrda target mailboxa/receivera i ne zatvara cijeli `inbound-email` modul niti §15 acceptance listu.

Implementacijski commit [`199ca64`](https://github.com/mudzy992/help-desk-enterprise/commit/199ca6475a2a533f9f57c6d7373f014daa94d69e) i finalni testani SHA [`814d6a8`](https://github.com/mudzy992/help-desk-enterprise/commit/814d6a8640467074b4b14ab4efaa7e2fd631b654) prošli su CI [`42501838277`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42501838277) (**success**). Nema target-DB/mailbox provjere, pokrenute migracije, PR-a, mergea ili deploymenta.

## Implementacija

- Dodan je privatni setting `private.inbound.trustedAuthservId`, prazan po defaultu. Kada je `private.inbound.requireAuthPass` uključen, nedostajući/neispravan trusted authserv-id blokira inbound obradu fail-closed.
- Checker razmatra samo najviše `Authentication-Results` zaglavlje i prihvata ga samo kada se normalizovani authserv-id tačno poklapa s konfiguracijom.
- Niži/forged headeri ne mogu nadjačati prvo zaglavlje. ARC i `X-MS-Exchange-Organization-AuthAs` se ignorišu kao dokaz sender autentikacije.
- Dodani su negativni forged-chain testovi, konfiguracijski testovi i frontend setting-registry/locale coverage.

## Dokaz i CI granice

Backend ciljani testovi obuhvatili su 3 suitea i 48 testova. Nakon frontend registry/help-teksta korekcija, ciljane frontend provjere su prošle: 13/13 coverage testova, i18n parity, ESLint, Prettier check i TypeScript build check.

Finalni CI [`42501838277`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42501838277) je **success** za backend build/full tests, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. Raniji CI [`42500781358`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42500781358) nije zelen zbog frontend setting-registry ključa i en/bs help-teksta iznad limita; obje greške su ispravljene prije finalnog SHA-a. E2E critical/install, read-only inventory i conditional image-enforcement korak u finalnom runu bili su `skipped`, ne passed; zato nema E2E, inventory ni nezavisnog image-enforcement sign-offa.

Lokalni recovery spec bio je blokiran nedostajućim generisanim Prisma klijentom i nedostupnim Prisma engine downloadom; finalni CI je generisao klijent i prošao backend full tests i PostgreSQL+Redis integration. CI migration replay/integration je izolovan od target baze.

## Operator trust granica i preostale provjere

Exact authserv-id match potvrđuje samo sadržaj zaglavlja, ne njegovu kriptografsku provenijenciju. Operator mora za stvarni mailbox i mail-flow potvrditi da Exchange Online/Graph ili IMAP/MX putanja uklanja nepouzdane `Authentication-Results` kopije ili pouzdano dodaje svoj rezultat ispred njih, te konfigurirati tačan authserv-id koji checker vidi. Sam naziv Exchange/Graph providera ili MX domena nije dokaz da se zaglavlje sanitizira.

Target mailbox, receiver configuration, header ordering/sanitizacija, deployment i runtime ponašanje nisu provjereni. Taj trust boundary ostaje eksplicitno neprovjeren do operatorove konfiguracijske i stvarne poruke provjere. `BA-inbound-email-03`, ostali susjedni P1 nalazi i puna §15/module acceptance lista ostaju otvoreni/pending.