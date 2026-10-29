# W5.16 — Attachment streaming i backpressure

**Finding:** `BA-tickets-16`  
**Implementacija:** `216b177`, type korekcija `7f09966`  
**CI:** `40340858766` — zelen

## Problem

HTTP multipart upload je koristio Multer memory storage, disk adapter `writeFile/readFile`, antivirus je primao kompletan Buffer, a download je kreirao `StreamableFile` tek nakon potpunog učitavanja sadržaja. Jedan zahtjev je zato mogao držati do 100 MB u heapu, a paralelni zahtjevi množili su pritisak bez zajedničkog concurrency/queue limita.

## Implementirani ugovor

- multipart upload koristi Multer disk storage sa nasumičnim server-side nazivom u OS temp direktoriju;
- Multer hard byte limit ostaje aktivan prije domenske obrade;
- iz privremene datoteke čita se samo bounded 8 KiB signature prozor za MIME/extension provjeru;
- veličina se validira iz Multer byte countera, bez oslanjanja na signature-buffer dužinu;
- ClamAV `INSTREAM` protokol sada čita temp datoteku kroz 64 KiB chunkove, poštuje socket `drain` backpressure i postojeći scanner timeout/fail-open ugovor;
- disk storage kopira upload kroz Node `pipeline(createReadStream, createWriteStream)` i uklanja parcijalni target pri kvaru;
- temp datoteka se zatvara i briše u `finally` grani bez obzira na validaciju, scan, storage ili DB ishod;
- download HTTP put vraća disk `ReadStream` direktno kroz `StreamableFile`, uz tačan `Content-Length`, MIME i sigurni disposition;
- postojeći buffer `read/write` adapter ugovor ostaje samo kompatibilnost za interne/test callere;
- process-wide I/O limiter dopušta najviše četiri aktivna upload/download toka i najviše 32 čekajuća zahtjeva;
- čekanje na lease ima 30-sekundni timeout; overflow i timeout završavaju kontrolisanom storage-unavailable greškom;
- lease download toka traje do `end`, `close` ili `error`, pa spori klijent zadržava concurrency slot i stvara stvarni transport backpressure.

## Direktni dokaz

`disk-ticket-attachment-storage.streaming.spec.ts` kreira 32 MiB datoteku bez application buffera, streama je u storage i nazad te potvrđuje punu veličinu uz maksimalni chunk od 64 KiB. `attachment-io-limiter.spec.ts` pokreće 20 paralelnih operacija, potvrđuje maksimalno četiri aktivne te potpuno pražnjenje queue/lease stanja.

Puni CI `40340858766` je zelen za backend build/lint/unit testove, stvarne PostgreSQL/Redis integration suiteove, frontend, docs i container/supply-chain provjere. Puni E2E critical flow nije pokrenut.

## Migracija

Paket **nema novu DB migraciju**.

## Ishod

`BA-tickets-16` je zatvoren. Registar prelazi na **640 otvorenih / 52 zatvorena / 692 ukupno**.
