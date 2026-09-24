# docs/ — gdje šta živi

Root repozitorija drži samo **referentne projektne dokumente**; sve ostalo je
razvrstano ovdje. Razlog: root je bio mješavina zadatka, faza, analiza i promptova,
pa se po imenu nije moglo pogoditi šta je ugovor, a šta radni materijal.

## Root (ostaje u rootu)

| Fajl | Zašto je u rootu |
|---|---|
| `README.md` | ulaz u repozitorij |
| `RAW_PROJECT_EPHELPDESK.md` | **projektni zadatak** (izvor istine za obim) |
| `PERFORMACE_PHASE_PLAN.md` | plan programa performansi (F0–F4); na njega se pozivaju svi patchevi i izvještaji (`perf/results/*.md`, §7 tabela napretka) |
| `PERF_BUDGETS.md` | SLO ugovor i kapije (Faza 4.2); na njega se poziva CI i kvartalna procedura |

## Podfolderi

| Folder | Sadržaj |
|---|---|
| `docs/plans/` | fazni planovi po domenu: `PHASE_PLAN_ephelpdesk.md`, `CATALOG_PHASE_PLAN.md`, `ROUTING_PHASE_PLAN.md`, `SLA_PHASE_PLAN.md` i tickets UI paket (`01-ANALIZA…` … `04-FAZNI-PLAN-TIKETI-UI.md`) |
| `docs/analysis/` | analize i ulazni materijali: `ADMIN_ANALYSIS.md`, `EPBIH_*` (checklist/start inputi/sysadmin), `CONVERSATION_CONTEXT.md`, `TASKS.md`, `RAW_PROJECT_TEMPLATE.md` |
| `docs/prompts/` | radni promptovi po domenu: `backend-ops-prompts.md`, `fe-alignment-prompts.md`, `fazni-dokument-promptova-za-{routing,sla}.md` |
| `docs/design/` | `Master UI-UX Design Constitution.md` (UX ugovor; na njega se pozivaju `.cursor/docs/theme.md` i `referenca-dizajn/README.md`) |
| `prompts/` | fazni promptovi performance programa (`PROMPT_FAZA_*`) |
| `perf/` | k6 paket, patchevi i izvještaji (`perf/results/`) |
| `ops/` | runbookovi (`ops/runbook/`), deploy procedure, SQL skripte |
| `demo/` | Pulse UI prototip, handoff i njegovi patchevi |

> Linkovi u `.cursor/` i `referenca-dizajn/` su ažurirani na nove putanje; stari
> nazivi fajlova su ostali isti, mijenja se samo lokacija.
