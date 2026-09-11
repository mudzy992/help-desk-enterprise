# CHANGELOG — service-onboarding-wizard

## 2026-09-11
- Routing korak koristi persisted routing provider: `routing:{serviceId}` je validan samo kad postoji bar jedno `RoutingRule` za taj servis.

## 2026-09-10
- Inicijalna matrica: `ServiceOnboarding` workflow odvojen od `Service.lifecycle`, koraci service → form → routing → SLA → approvals, save/resume incomplete stanja, prerequisite validacija, finalize aktivira servis samo kad su svi refovi validni. Routing/SLA/approvals su opaque configuration refs za kasnije module.
