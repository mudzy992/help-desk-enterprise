# CHANGELOG — integrations-teams-stub

## 2026-09-14
- Inicijalna matrica: feature-flagged Teams stub (`stubEnabled` + `eventTypesCsv` + secret `webhookUrl`), interni event tipovi, enqueue `TEAMS_STUB` kroz durable queue, worker log-only COMPLETED bez HTTP isporuke.
