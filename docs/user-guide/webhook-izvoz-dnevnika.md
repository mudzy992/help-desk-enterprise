---
title: Izvoz sigurnosnog dnevnika na webhook
slug: webhook-izvoz-dnevnika
module: —
part: administrator
audience: [SUPER_ADMIN, Administrator]
roles: [SUPER_ADMIN]
order: 140
tags: [webhook, siem, revizijski-dnevnik, hmac, potpis, prijava, sigurnost, izvoz, log-pipeline]
---
# Izvoz sigurnosnog dnevnika na webhook

> **Namjena:** ova stranica objašnjava kako uključiti izvoz **događaja autentikacije i sigurnosti** iz
> revizijskog dnevnika na adresu koju odredite (SIEM kolektor, log pipeline ili vlastiti prijemnik), kako
> prijemnik provjerava potpis i šta da radi kad isporuka ne uspije. Postavka je na ekranu **Administracija →
> Sigurnost → Sigurnosne postavke**, red **Izvoz revizijskog dnevnika na webhook**.

## Čemu služi ovaj modul

- Šalje redove revizijskog dnevnika čija akcija počinje sa **`auth.`** (prijave, neuspjele prijave, MFA, lozinke,
  sesije) ili **`security.`** (sigurnosni događaji). To je isti skup koji vidi **Sigurnosni dnevnik**.
- Ostali revizijski redovi se **ne šalju**.
- Izvoz je **podrazumijevano isključen**. Dok je isključen, ništa se ne šalje.

## Kome je namijenjen

- **SUPER_ADMIN**, jer samo on mijenja sigurnosne postavke.
- Timu koji održava prijemnik (SIEM ili log pipeline), jer mu treba adresa, tajna i opis potpisa.

## Kako doći

**Administracija → Sigurnost → Sigurnosne postavke → Izvoz revizijskog dnevnika na webhook.** Red pokazuje stanje
izvoza i otvara dijalog sa poljima: **izvoz uključen**, **adresa primaoca** i **tajna za potpis**.

## Korak po korak

### Prvo podesite prijemnik

1. Pripremite HTTP(S) endpoint koji prima `POST` zahtjeve sa JSON tijelom.
2. Odredite **tajnu za potpis**: dugačak nasumični tekst koji zna samo server i prijemnik.
3. Prijemnik treba da provjerava potpis (vidi dole) i da odbacuje zastarjele zahtjeve.

### Uključivanje

1. U dijalogu unesite **adresu primaoca**. Dozvoljeni su `http` i `https`; URL ne smije sadržavati korisničko ime
   ni lozinku; najviše 2048 znakova. **Interne adrese su dozvoljene.** Zahtjevi se nikad ne preusmjeravaju.
2. Unesite **tajnu za potpis**. Nakon snimanja se više ne prikazuje.
3. Sačuvajte adresu i tajnu, pa tek onda uključite **izvoz**. Uključivanje bez adrese i tajne aplikacija odbija.
4. Provjerite na prijemniku da stižu zahtjevi. Prvi događaji obično stignu u roku od minut-dva (slanje se provjerava svake minute, a novi događaj čeka najmanje 10 sekundi).

### Promjena adrese ili tajne

1. Prvo **isključite izvoz** i sačuvajte.
2. Unesite novu adresu ili tajnu, pa ponovo uključite izvoz.

### Isključivanje

Isključivanje zaustavlja izvoz. **Događaji zapisani dok je izvoz isključen se ne šalju naknadno.** Kad ga ponovo
uključite, kreće se od novih događaja.

## Šta prijemnik dobija

Svaki batch je `POST` sa `Content-Type: application/json` i zaglavljima:

- `x-helpdesk-timestamp` — Unix vrijeme u sekundama;
- `x-helpdesk-signature` — `sha256=` i heksadecimalni HMAC-SHA256 nad tekstom `timestamp + "." + tijelo`.

Primjer tijela (skraćen):

```json
{
  "schemaVersion": 1,
  "source": "help-desk-enterprise",
  "sentAt": "2026-10-12T10:00:00.000Z",
  "events": [
    {
      "id": "cm...",
      "occurredAt": "2026-10-12T09:59:12.341Z",
      "action": "auth.login_failed",
      "entityType": "User",
      "entityId": "…",
      "actorUserId": null,
      "requestId": "…",
      "metadata": {}
    }
  ]
}
```

Lozinke, heševi i tajne se nikad ne upisuju u dnevnik, pa se ne šalju ni u jednom polju.

### Provjera potpisa na prijemniku

Potpis se računa nad **tačnim bajtovima** tijela koje je stiglo, prije bilo kakve obrade JSON-a:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, timestamp, signature, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Prijemnik treba da odbije zahtjev čiji je `timestamp` stariji od nekoliko minuta (npr. 5), što sprječava ponavljanje
snimljenog zahtjeva.

## Polja, validacije i statusi

| Postavka | Zadano | Pravilo |
|---|---|---|
| `private.security.auditWebhook.enabled` | isključeno | Može se uključiti tek kad su adresa i tajna popunjeni. |
| `private.security.auditWebhook.url` | prazno | `http` ili `https`, bez korisničkog imena i lozinke, najviše 2048 znakova. |
| `private.security.auditWebhook.secret` | nije postavljena | HMAC-SHA256 ključ. Ne prikazuje se nakon snimanja. |

### Isporuka i greške

- Uspjeh je **samo odgovor 2xx**. Svaki drugi ishod (HTTP kod, istek roka, mrežna greška, neispravna adresa) znači
  da se **isti batch šalje ponovo**, u sljedećem prolazu (svake minute).
- Zahtjev ima rok od **5 sekundi**. Preusmjeravanja se odbijaju.
- Isporuka je **najmanje jednom** (at-least-once), pa prijemnik treba da odbaci duplikate po `events[].id`.
- Ako neuspjeh traje **duže od 24 sata**, čekajući događaji se **odbacuju** (broj se bilježi), a izvoz nastavlja
  od najnovijeg događaja.
- Događaj se šalje najranije **10 sekundi** nakon nastanka, da kasno upisan red ne bi bio preskočen.

## Česta pitanja i greške

- **„Ništa ne stiže.“** — Provjerite da je izvoz uključen, da je adresa dostupna **sa servera** (ne sa vašeg
  računara), i da vatrozid dozvoljava dolazni saobraćaj. Događaji zapisani prije uključivanja se ne šalju.
- **„Prijemnik odbija potpis.“** — Tijelo se mora verifikovati kao **sirov tekst**, ne kao ponovo serijalizovan JSON.
  Provjerite da je tajna ista na obje strane i da se `timestamp` uzima iz zaglavlja `x-helpdesk-timestamp`.
- **„Vidim iste događaje dva puta.“** — To je očekivano kod ponovnog slanja. Odbacujte duplikate po `events[].id`.
- **„Isporuka je stala.“** — Provjerite prijemnik (HTTP odgovor 2xx) i adresu. Ako isporuka ne uspijeva 15 minuta,
  otvara se alarm **Izvoz sigurnosnog dnevnika na webhook ne isporučuje** (upozorenje); posle 60 minuta je kritičan
  (vidi [Alarmi i zdravlje sistema](alarmi-i-zdravlje-sistema.md)). Nakon 24 sata neuspjeha čekajući događaji se odbacuju.
- **„Gdje vidim koliko je poslano?“** — U kartici **Sigurnosne metrike (zadnji sat)** (samo SUPER_ADMIN) je pločica
  **Izvoz na webhook**: stanje (U redu, Ne isporučuje ili Isključen), broj poslanih, neuspjelih i odbačenih događaja,
  zadnja uspješna isporuka i zadnja greška (kod, npr. `HTTP_500`, `TIMEOUT`, `NETWORK`, `INVALID_URL`). Adresa i tajna
  se na pločici nikad ne prikazuju.

## Poznata ograničenja

- Pločica i alarm pokazuju stanje isporuke, a ne sadržaj događaja. Pojedinačne događaje provjeravate na prijemniku.
- Adresa sa `http` šalje tijelo bez šifrovanja. Za mreže van kontrolisane infrastrukture koristite `https`.
- Događaj koji je upisan više od 10 sekundi nakon kursora može biti preskočen. Ovo je rijetko i prihvaćeno.

## Povezani moduli

- [Alarmi i zdravlje sistema](alarmi-i-zdravlje-sistema.md) — alarmi za prijave i CAPTCHA, te alarm za stanje ovog izvoza.
- [Provjera da niste robot (CAPTCHA)](captcha-provjera.md) — provjera pri prijavi čiji se događaji šalju.
- [Uloge i permisije (RBAC)](uloge-i-permisije.md) — ko može mijenjati sigurnosne postavke.
