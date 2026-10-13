# Webhook izvoz sigurnosnog dnevnika

> Paket 5.4.2 (stavka 3). Izvoz šalje događaje **autentikacije i sigurnosti** iz
> revizijskog dnevnika na HTTP adresu koju operator odredi (SIEM kolektor, log
> pipeline ili prijemnik). Isporuka je **najmanje jednom** (at-least-once); prijemnik
> treba da odbaci duplikate po `events[].id`.

## Šta se šalje

- Samo redovi čija akcija počinje sa `auth.` ili `security.` (isti skup koji vidi
  sigurnosni dnevnik). Ostali revizijski redovi se ne šalju.
- **Samo događaji zapisani nakon uključivanja.** Nema naknadnog slanja historije.
  Dok je izvoz isključen, kursor prati najnoviji red, pa se događaji iz perioda
  isključenosti nikada ne šalju naknadno.
- Metapodaci reda se šalju onako kako su upisani u dnevnik (već pseudonimizovani
  tamo gdje je to propisano). Lozinke, hešovi i tajne se nikada ne upisuju u dnevnik.

## Postavke

Sve tri su u kategoriji `private.security` (ključevi `private.security.auditWebhook.*`):

| Ključ | Tip | Podrazumijevano | Napomena |
|---|---|---|---|
| `enabled` | logička vrijednost | `false` | Može se uključiti tek kad su adresa i tajna popunjeni. |
| `url` | tekst | prazno | `http` ili `https`; bez korisničkog imena i lozinke; najviše 2048 znakova. Interne adrese su dozvoljene. |
| `secret` | tajna | nije postavljena | HMAC-SHA256 ključ. Vrijednost se nakon snimanja ne prikazuje. |

Redoslijed: prvo `url` i `secret`, pa `enabled`. Za promjenu adrese prvo isključite
izvoz. Postavke se unose na ekranu **Administracija → Sigurnost → Sigurnosne postavke**, red
„Izvoz revizijskog dnevnika na webhook“ (od `b030755a`; samo SUPER_ADMIN). Isti ključevi se mogu unijeti i kroz API
postavki (`PUT /settings` ili `PUT /settings/batch`). Korisnički opis je u `docs/user-guide/webhook-izvoz-dnevnika.md`.

## Zahtjev i potpis

Svaki batch je `POST` sa `Content-Type: application/json` i zaglavljima:

- `x-helpdesk-timestamp` — Unix vrijeme u sekundama;
- `x-helpdesk-signature` — `sha256=` + heks HMAC-SHA256 nad `timestamp + "." + tijelo`
  (tijelo je tačan niz bajtova koji je poslan).

Tijelo:

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

Provjera na prijemniku (Node.js, `rawBody` mora biti neizmijenjen tekst):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function verify(rawBody, timestamp, signature, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Prijemnik treba odbiti zahtjev sa zastarjelim `timestamp` (npr. starijim od 5 minuta), što sprječava ponavljanje.

## Ponašanje kod grešaka

- Worker pokušava svake minute; razmak ne raste (fiksni ritam ponavljanja).
- Zahtjev ima rok od 5 sekundi. Preusmjeravanja se odbijaju.
- Uspjeh je samo odgovor 2xx. Svaki drugi ishod (`HTTP_<status>`, `TIMEOUT`, `NETWORK`,
  `INVALID_URL`) znači da kursor ostaje i isti batch se šalje ponovo.
- Ako neuspjeh traje duže od **24 sata**, sve čekajuće redove odbacuje se. Broj
  odbačenih se dodaje u brojač; kursor skače na najnoviji red.
- Redovi mlađi od 10 sekundi se ne šalju, da kasno upisani red ne bi bio preskočen.

## Praćenje

- Logovi workera: `security_audit_webhook_sent=<n>` i
  `security_audit_webhook_failed code=<kod> dropped=<n> pending_since=<vrijeme>`.
  Adresa, tajna i tijelo odgovora se nikada ne loguju.
- Brojači (poslano, neuspjesi, odbačeno, zadnji uspjeh, zadnji kod) su u tabeli
  `SecurityAuditWebhookState`. Pločica ili alarm za njih **nisu** napravljeni.

## Poznata ograničenja

- Nema pločice ni alarma za stanje isporuke (vidi „Praćenje“); stanje se provjerava na prijemniku.
- `http` adresa šalje tijelo bez enkripcije; za mreže van kontrolisane infrastrukture koristite `https`.
- Red sa vremenom nastanka starijim od kursora za više od 10 sekundi (kasni upis) bi bio preskočen. Ovo je rijetko i prihvaćeno.
