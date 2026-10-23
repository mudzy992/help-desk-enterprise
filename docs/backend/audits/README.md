# Registar backend audita po modulima

**Status:** aktuelno  
**Ažurirano:** 2026-10-22

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
| 14 — sla                                                | sljedeće      | biće kreiran tokom audita                                                    | —                | —               |
| 15–43 — ostali moduli                                   | nije započeto | prema registru inventara                                                     | —                | —               |
| 44 — cross-cutting backend infrastruktura               | nije započeto | nakon svih modula                                                            | —                | —               |
| 45 — konsolidovani audit i implementacijski master plan | nije započeto | nakon cross-cutting audita                                                   | —                | —               |
