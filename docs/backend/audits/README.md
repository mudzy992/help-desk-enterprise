# Registar backend audita po modulima

**Status:** aktuelno  
**Ažurirano:** 2026-10-23

Pojedinačni auditi slijede [jedinstveni standard](../BACKEND-AUDIT-STANDARD.md) i redoslijed iz [inventara](../MODULE-INVENTORY.md). Implementacija ne počinje prije završetka cijelog registra.

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
| 26 — reports                                            | sljedeće      | biće kreiran tokom audita                                                    | —                 | —               |
| 26–43 — ostali moduli                                   | nije započeto | prema registru inventara                                                     | —                | —               |
| 44 — cross-cutting backend infrastruktura               | nije započeto | nakon svih modula                                                            | —                | —               |
| 45 — konsolidovani audit i implementacijski master plan | nije započeto | nakon cross-cutting audita                                                   | —                | —               |
