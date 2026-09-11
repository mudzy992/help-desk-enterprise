# CHANGELOG — ticket-approvals

## 2026-09-11
- Create hold u `PENDING_APPROVAL` za routed servise koji zahtijevaju odobrenje (`Service.requiresApproval` ili settings JSON overlay). Approve → `PENDING` pa postojeći auto-assign; reject → `CLOSED` uz obavezan razlog. Default approver role `ADMIN` u OU/service scope-u. Nema waiting-for-user, SLA pause, ni AD manager approver.
