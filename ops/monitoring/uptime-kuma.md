# Eksterni monitoring: Uptime Kuma

Paket 2.7, dizajn §7. Aplikacija sama javlja svoje alarme (Admin → **Zdravlje sistema**, e-mail
ili Teams). Ne može javiti da je **ugašena**: kad padne server, Redis ili worker, nema ko da pošalje
alarm. Tu situaciju pokriva Uptime Kuma, koja aplikaciju gleda **izvana**.

> **Instalirajte Kumu na drugi server ili VM, ne na server aplikacije.** Kuma na istom serveru pada
> zajedno s njim i ne javi ništa.

## 1. Instalacija (Coolify)

1. Na **drugom** serveru u Coolifyju: **+ New → Service → Uptime Kuma**. Ako drugog servera nema,
   koristite bilo koji drugi Docker host (`docker run -d --restart=unless-stopped -p 3001:3001
   -v uptime-kuma:/app/data louislam/uptime-kuma:1`).
2. FQDN, npr. `status-mon.ba101.top` (prod: `status-mon.example.com`). Ne javno objavljivati.
3. Persistent storage: `/app/data`. Tu su baza monitora i historija.
4. Prvo otvaranje: kreirajte admin nalog s jakom lozinkom i uključite 2FA
   (**Settings → Security**).
5. **Settings → General → Timezone:** `Europe/Sarajevo`.

Uputstvo pretpostavlja liniju **1.x** (1.23). U 2.x je uvoz iz backupa uklonjen, pa monitore unesite
ručno prema tabeli u §3.

## 2. Obavijesti

**Settings → Notifications → Setup Notification.** Koristite isti kanal kao alarmi aplikacije:

- **SMTP:** isti server i primalac kao `OPS_ALERT_EMAIL_TO` ili `private.ops.alerts.extraRecipientsCsv`;
- **Microsoft Teams:** Workflows webhook URL, isti kanal kao `private.ops.alerts.teamsWebhookUrl`.

Uključite **Default enabled** i **Apply on all existing monitors**.

**Settings → Notifications → TLS Certificate Expiry:** ostavite `7, 14, 21` dana. Upozorenje 21 dan
prije isteka je zahtjev iz §7.2.

## 3. Monitori

| Monitor | Tip | URL | Interval | Uslov |
|---|---|---|---|---|
| Frontend | HTTP(s) – Keyword | `https://<desk>/` | 60 s | 200 i riječ `Service Desk` |
| API liveness | HTTP(s) | `https://<api>/health` | 60 s | 200 |
| API readiness | HTTP(s) | `https://<api>/health/ready` | 60 s | 200 (503 = baza ili Redis) |
| Worker | HTTP(s) | `https://<api>/health/worker` | 120 s | 200 (503 = nema heartbeata 120 s) |
| Worker push | Push | — | 120 s | vidi §4 |

TLS se provjerava na Frontend i API liveness monitorima (**Certificate Expiry Notification**).

### Uvoz

Datoteka [`uptime-kuma-monitors.json`](uptime-kuma-monitors.json) ima placeholdere. Zamijenite ih
(primjer za staging, Git Bash):

```bash
TOKEN=$(openssl rand -hex 16)
sed -e 's/__FRONTEND_HOST__/desk.ba101.top/g' \
    -e 's/__API_HOST__/api.desk.ba101.top/g' \
    -e "s/__PUSH_TOKEN__/$TOKEN/g" \
    ops/monitoring/uptime-kuma-monitors.json > /tmp/kuma-import.json
echo "Push token: $TOKEN"
```

Zatim **Settings → Backup → Import**, izaberite `/tmp/kuma-import.json` i opciju **Keep both**
(postojeći monitori ostaju). Poslije uvoza provjerite da svaki monitor ima uključenu obavijest.

## 4. Dead man's switch (`OPS_UPTIME_PUSH_URL`)

Worker na kraju svakog prolaza provjere zdravlja (svakih **60 s**) pozove zadani URL: GET, timeout
5 s. Greška se samo loguje (`ops_uptime_push_failed host=…`), a token se ne ispisuje. Ako dva
intervala nema poziva, Kuma javi grešku. Tako se hvata ugašen server, zaglavljen worker, mrtav Redis
(worker stoji) i nedostupna mreža.

1. U Kumi otvorite monitor **Worker push** i kopirajte **Push URL**, npr.
   `https://status-mon.ba101.top/api/push/<token>?status=up&msg=OK&ping=`.
2. Coolify → projekat Service Desk → servis **worker** → Environment:
   `OPS_UPTIME_PUSH_URL=<push URL>`. Postavlja se samo na workeru, jer backend ne šalje push.
3. **Redeploy** servisa worker. Restart zadržava staro okruženje.
4. U roku od 1–2 min monitor postaje zelen.

Prazan `OPS_UPTIME_PUSH_URL` isključuje push. Dozvoljeni su samo `http(s)://` URL-ovi.

## 5. Šta uraditi kad Kuma javi grešku

| Monitor crven | Prvi korak |
|---|---|
| Frontend | Coolify → frontend healthy? Traefik ignoriše kontejnere koji nisu healthy. |
| API liveness | Backend kontejner pao ili se restartuje: logovi backenda. |
| API readiness | `curl -s https://<api>/health/ready` pokazuje koji check pada (`database`, `redis`). |
| Worker / Worker push | Coolify → worker healthy? `docker logs` workera; provjeri Redis. |
| TLS | Coolify → Traefik → certifikati (Let's Encrypt obnova). |

Detaljan postupak po alarmu je u [`ops/runbook/ALERTS.md`](../runbook/ALERTS.md).

## 6. Provjera (jednom, pri postavljanju)

1. Pošaljite testnu obavijest iz Kume (**Test** u postavkama obavijesti).
2. Zaustavite worker u Coolifyju: za ≤ 3 min crvene **Worker** i **Worker push**. Paralelno
   aplikacija otvara alarm za worker u **Zdravlje sistema**. Pokrenite worker ponovo i provjerite
   da se oba monitora vrate na zeleno.
