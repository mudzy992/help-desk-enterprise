# Registar backend audita po modulima

**Status:** aktuelno<br>
**Ažurirano:** 2026-10-30<br>
**Aktivna implementacija:** Val 7 / W7; W7.1–W7.14 zatvoreni uz zeleni kodni CI, W7.15 čeka zasebno odobrenje.

Pojedinačni auditi slijede [jedinstveni standard](../BACKEND-AUDIT-STANDARD.md) i redoslijed iz [inventara](../MODULE-INVENTORY.md). Implementacija je počela nakon završetka cijelog registra. Brojevi nalaza i baseline ocjene u tabeli ostaju audit snapshot; tekući open/closed status je u [globalnom registru](../BACKEND-FINDINGS-REGISTER.md).

| Jedinica                                                | Status        | Audit dokument                                                               | Nalazi           | Baseline ocjena |
| ------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- | ---------------- | --------------- |
| 00 — standard i inventar                                | završeno      | [Standard](../BACKEND-AUDIT-STANDARD.md), [inventar](../MODULE-INVENTORY.md) | —                | —               |
| 01 — authentication                                     | audit završen | [Detaljni audit](01-authentication.md)                                       | 3 P1, 4 P2, 1 P3 | **7,42/10**     |
| 02 — authorization                                      | audit završen | [Detaljni audit](02-authorization.md)                                        | 4 P2, 4 P3       | **8,48/10**     |
| 03 — rbac                                               | audit završen | [Detaljni audit](03-rbac.md)                                                 | 5 P2, 3 P3       | **8,03/10**     |
| 04 — users                                              | audit završen | [Detaljni audit](04-users.md)                                                | 3 P1, 6 P2       | **6,59/10**     |
| 05 — organizational-units                               | audit završen | [Detaljni audit](05-organizational-units.md)                                 | 2 P1, 5 P2, 2 P3 | **6,71/10**     |
| 06 — groups                                             | audit završen | [Detaljni audit](06-groups.md)                                               | 3 P1, 5 P2, 2 P3 | **6,73/10**     |
| 07 — settings                                           | audit završen | [Detaljni audit](07-settings.md)                                             | 3 P1, 6 P2, 2 P3 | **6,35/10**     |
| 08 — audit-log                                          | audit završen | [Detaljni audit](08-audit-log.md)                                            | 3 P1, 6 P2, 2 P3 | **6,38/10**     |
| 09 — security                                           | audit završen | [Detaljni audit](09-security.md)                                             | 3 P1, 6 P2, 2 P3 | **6,00/10**     |
| 10 — security-audit-webhook                             | audit završen | [Detaljni audit](10-security-audit-webhook.md)                               | 3 P1, 6 P2, 2 P3 | **5,92/10**     |
| 11 — privacy                                            | audit završen | [Detaljni audit](11-privacy.md)                                              | 4 P1, 7 P2, 2 P3 | **5,57/10**     |
| 12 — tickets                                            | audit završen | [Detaljni audit](12-tickets.md)                                              | 8 P1, 8 P2, 3 P3 | **5,38/10**     |
| 13 — routing                                            | audit završen | [Detaljni audit](13-routing.md)                                              | 2 P1, 6 P2, 3 P3 | **5,82/10**     |
| 14 — sla                                                | audit završen | [Detaljni audit](14-sla.md)                                                  | 4 P1, 8 P2, 4 P3 | **5,09/10**     |
| 15 — service-catalog                                    | audit završen | [Detaljni audit](15-service-catalog.md)                                      | 4 P1, 8 P2, 3 P3 | **5,23/10**     |
| 16 — templates                                          | audit završen | [Detaljni audit](16-templates.md)                                            | 3 P1, 7 P2, 3 P3 | **5,35/10**     |
| 17 — notifications                                      | audit završen | [Detaljni audit](17-notifications.md)                                        | 3 P1, 8 P2, 4 P3 | **5,05/10**     |
| 18 — websocket                                          | audit završen | [Detaljni audit](18-websocket.md)                                            | 4 P1, 7 P2, 3 P3 | **4,88/10**     |
| 19 — integration-queue                                  | audit završen | [Detaljni audit](19-integration-queue.md)                                    | 4 P1, 8 P2, 3 P3 | **4,41/10**     |
| 20 — inbound-email                                      | audit završen | [Detaljni audit](20-inbound-email.md)                                        | 3 P1, 7 P2, 3 P3 | **5,06/10**     |
| 21 — on-call                                            | audit završen | [Detaljni audit](21-on-call.md)                                              | 3 P1, 8 P2, 3 P3 | **4,84/10**     |
| 22 — assets                                             | audit završen | [Detaljni audit](22-assets.md)                                               | 4 P1, 11 P2, 4 P3 | **4,59/10**     |
| 23 — problems                                           | audit završen | [Detaljni audit](23-problems.md)                                             | 7 P1, 9 P2, 3 P3 | **4,21/10**     |
| 24 — changes                                            | audit završen | [Detaljni audit](24-changes.md)                                              | 7 P1, 10 P2, 3 P3 | **4,28/10**     |
| 25 — knowledge-base                                     | audit završen | [Detaljni audit](25-knowledge-base.md)                                       | 4 P1, 11 P2, 4 P3 | **4,51/10**     |
| 26 — reports                                            | audit završen | [Detaljni audit](26-reports.md)                                              | 2 P1, 12 P2, 5 P3 | **4,70/10**     |
| 27 — search                                             | audit završen | [Detaljni audit](27-search.md)                                               | 1 P1, 7 P2, 5 P3  | **5,62/10**     |
| 28 — announcements                                      | audit završen | [Detaljni audit](28-announcements.md)                                        | 4 P1, 11 P2, 4 P3 | **4,31/10**     |
| 29 — status-page                                        | audit završen | [Detaljni audit](29-status-page.md)                                          | 5 P1, 10 P2, 4 P3 | **4,11/10**     |
| 30 — config-versioning                                  | audit završen | [Detaljni audit](30-config-versioning.md)                                    | 7 P1, 10 P2, 3 P3 | **3,55/10**     |
| 31 — install                                            | audit završen | [Detaljni audit](31-install.md)                                               | 6 P1, 11 P2, 4 P3 | **4,02/10**     |
| 32 — setup-checklist                                    | audit završen | [Detaljni audit](32-setup-checklist.md)                                      | 7 P2, 4 P3       | **6,08/10**     |
| 33 — policy-packs                                       | audit završen | [Detaljni audit](33-policy-packs.md)                                         | 7 P1, 9 P2, 3 P3 | **3,68/10**     |
| 34 — service-onboarding                                 | audit završen | [Detaljni audit](34-service-onboarding.md)                                   | 7 P1, 10 P2, 3 P3 | **4,15/10**     |
| 35 — directory-sync                                     | audit završen | [Detaljni audit](35-directory-sync.md)                                       | 8 P1, 11 P2, 4 P3 | **3,40/10**     |
| 36 — teams                                              | audit završen | [Detaljni audit](36-teams.md)                                                | 6 P1, 10 P2, 4 P3 | **4,05/10**     |
| 37 — edge-extension                                     | audit završen | [Detaljni audit](37-edge-extension.md)                                       | 7 P1, 10 P2, 4 P3 | **2,83/10**     |
| 38 — branding                                           | audit završen | [Detaljni audit](38-branding.md)                                             | 0 P1, 8 P2, 5 P3 | **6,27/10**      |
| 39 — health                                             | audit završen | [Detaljni audit](39-health.md)                                               | 1 P1, 9 P2, 4 P3 | **5,64/10**      |
| 40 — observability                                      | audit završen | [Detaljni audit](40-observability.md)                                        | 4 P1, 10 P2, 4 P3 | **4,08/10**     |
| 41 — ops-health                                         | audit završen | [Detaljni audit](41-ops-health.md)                                           | 7 P1, 12 P2, 5 P3 | **3,68/10**     |
| 42 — docs                                               | audit završen | [Detaljni audit](42-docs.md)                                                 | 2 P1, 8 P2, 5 P3 | **5,50/10**      |
| 43 — change-log                                         | audit završen | [Detaljni audit](43-change-log.md)                                           | 5 P1, 10 P2, 5 P3 | **3,57/10**     |
| 44 — cross-cutting backend infrastruktura               | audit završen | [Detaljni audit](44-cross-cutting-infrastructure.md)                          | 8 P1, 17 P2, 7 P3 | **3,20/10**     |
| 45 — konsolidovani audit i implementacijski master plan | audit završen | [Detaljni audit](45-consolidated-backend-audit.md)                            | 692 ukupno       | **5,12/10**     |
