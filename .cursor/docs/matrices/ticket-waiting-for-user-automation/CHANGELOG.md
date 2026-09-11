# CHANGELOG — ticket-waiting-for-user-automation

## 2026-09-11
- Remind/auto-close idempotency preko `GuardrailClaim`; detalji u `guardrails-anti-loop-anti-spam`.
- Agent PATCH u `WAITING_FOR_USER` postavlja `waitingForUserEnteredAt`. `USER_REPLY` resume u `IN_PROGRESS`. Settings-driven reminder (default 2 dana) i auto-close (default 7 dana) kroz API interval sweep. Nema SLA pause ni notifikacija.
