# Backend implementacija — Val 1: production safety perimeter

**Status:** u toku  
**Početak:** 2026-10-24  
**Master plan:** [Backend implementacijski master plan](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md)

## Paket W1.1 — container i supply chain

**Status:** završeno; CI run [`40073544355`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40073544355) zelen na SHA `f7615c7196cae623aa50376869ddea771e2f38cc`.

### Implementirano

- sva tri Docker stagea koriste pregledom zaključani `node:22-alpine` digest;
- build koristi isključivo strict `npm ci`; fallback na `npm install` je uklonjen;
- zaseban `production-deps` stage instalira `--omit=dev --omit=optional --ignore-scripts` skup;
- runtime kopira samo production dependencies i kompajlirani output;
- Nest CLI, TypeScript, Prisma CLI/schema, source tree, npm, npx i corepack ne postoje u finalnom imageu;
- runtime `zlib` je eksplicitno zaključan na sigurnosno korigovanu `1.3.2-r1` verziju;
- direktne i tranzitivne dependency ranjivosti su sanirane nadogradnjama i zaključanim `overrides` pravilima;
- `npm audit --omit=dev --audit-level=high` je obavezni CI gate i vraća nula ranjivosti;
- Syft generiše CycloneDX JSON SBOM stvarnog runtime imagea;
- Grype pravi puni inventar svih image nalaza i zaseban actionable high/critical gate koji obuhvata nalaze za koje postoji upstream popravka;
- actionable high/critical rezultat mora biti nula; izvještaj svih nalaza se i dalje čuva radi transparentnosti i budućih base refresh odluka;
- image archive dobija GitHub/Sigstore build-provenance attestation vezan za tačan commit i workflow identity;
- dependency audit, SBOM, puni scan i actionable scan čuvaju se 30 dana kao `backend-supply-chain-<SHA>` CI artefakt;
- sve korištene supply-chain GitHub akcije zaključane su na pune commit SHA vrijednosti;
- statički container guard i četiri negativna/pozitivna testa sprečavaju vraćanje mutable basea, install fallbacka, builder dependencyja ili nepinovane sigurnosne korekcije;
- stvarni runtime probe potvrđuje non-root proces, read-only root, writable tmpfs/uploads, odsustvo build/package-manager alata i graceful `SIGTERM`.

### Izvršni dokaz

```text
Production npm audit                         0 vulnerabilities
Container contract testovi                   4/4 PASS
Digest-pinned runtime build                  PASS
CycloneDX image SBOM                         PASS
Puni Grype inventar                          PASS / artifact
Actionable high/critical image gate          0 / PASS
GitHub/Sigstore provenance attestation       PASS
Supply-chain evidence upload                 PASS
Runtime UID/filesystem/toolchain/signal      PASS
Backend build/lint/full Jest                 PASS
PostgreSQL/Redis integration                 PASS
Frontend build/test i docs                   PASS
Završni CI gate                              PASS
```

Tokom implementacije scan je izvršno otkrio ranjive OpenSSL, glibc, Perl, npm-transitive i `zlib` slojeve u ranijim Alpine/Debian/distroless kandidatima. Ti pokušaji nisu proglašeni uspjehom. Finalni image koristi ažurirani Alpine digest, uklanja npm toolchain i pinovano koriguje posljednji actionable `zlib` nalaz. Puni non-actionable/upstream inventar ostaje dokazni artefakt; ne prikriva se VEX-om niti se predstavlja kao apsolutno odsustvo svih budućih CVE zapisa.

### Zatvoreni nalazi

- `BA-xcut-04` — uklonjeni su install fallback, mutable base i builder/dev dependencies iz runtimea;
- `BA-xcut-24` — production dependency audit sada ima nula low/moderate/high/critical nalaza;
- `BA-xcut-29` — SBOM, puni/actionable image scan i potpisana provenance attestation sada su izvršni deploy dokaz.

Kanonski zbir je sada **686 otvorenih / 6 zatvorenih** nalaza.

## Sljedeći paket

**W1.2 — DB/migration privilege separation:** zaseban release migrator, restricted API/worker DB role, single-owner migration release job, TLS/timeouts/connection budget, schema compatibility sentinel i backup/restore dokaz.
