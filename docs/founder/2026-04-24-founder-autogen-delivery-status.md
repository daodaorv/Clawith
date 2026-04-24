# Founder Autogen Delivery Status (2026-04-24)

## Current Stage

The founder-facing product line is now at a working MVP stage on top of Clawith:

- A founder can create a persisted founder workspace instead of starting from raw single-agent creation.
- The system can run `interview -> draft -> approval -> materialize`.
- Materialization creates a runnable multi-agent company scaffold inside the existing Clawith runtime.
- The founder lands on a dedicated dashboard that combines stored snapshot data with live runtime agent state.

This closes the main implementation plan tracked in:

- `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`

## Delivered Product Slice

### Backend

- `backend/app/models/founder_workspace.py`
  - persisted founder workspace shell above single-agent creation
- `backend/app/api/founder_workspaces.py`
  - founder workspace create, planning, and materialize APIs
- `backend/app/services/founder_company_materializer.py`
  - converts approved founder plan into a real company package
- `backend/app/services/founder_company_wiring.py`
  - maps generated roles to template-backed Clawith agents, skills, relationships, permissions, and starter triggers

Key shipped backend change set:

- `de5d5e45` `Make founder-generated companies usable inside the Clawith runtime`

### Frontend

- `frontend/src/pages/FounderWorkspace.tsx`
  - dedicated founder workflow entry page
- `frontend/src/pages/FounderCompanyDashboard.tsx`
  - founder control surface after materialization
- `frontend/src/services/founderCompanyDashboard.ts`
  - dashboard summary and blocker derivation
- `frontend/src/services/founderWorkspace.ts`
  - founder workspace API client

Key shipped frontend change set:

- `89fd4d3e` `Ground founder dashboards in live runtime state and blocker signals`

## Automated Verification

Verified on 2026-04-24:

- `python -m pytest backend/tests -q`
  - passed: `85 passed`
- `python -m ruff check backend/app/services/founder_company_materializer.py backend/app/services/founder_company_wiring.py backend/tests/test_founder_company_materializer.py backend/tests/test_founder_company_wiring.py`
  - passed
- `node --test frontend/tests/*.mjs`
  - passed: `19/19`
- `cd frontend && npm run build`
  - passed

## Real UI / API Mainline Verification

The founder happy path was also run through the real UI and API on 2026-04-24.

Environment:

- latest source frontend: `http://127.0.0.1:3010`
- backend/API path proxied through the stable Docker web entrypoint on `http://127.0.0.1:3008`

Natural flow that was completed:

1. Register or log in
2. Create company
3. Create founder workspace
4. Select a configured model
5. Fill the eight interview answers
6. Save interview progress
7. Generate draft plan
8. Confirm readiness
9. Materialize the company
10. Land on founder dashboard

Observed API evidence:

- `POST /api/tenants/self-create` -> `201`
- `POST /api/founder-workspaces` -> `201`
- `POST /api/founder-workspaces/{id}/planning/interview-progress` -> `200`
- `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- second `POST /api/founder-workspaces/{id}/planning/draft-plan` after confirmation -> `200`
- `POST /api/founder-workspaces/{id}/materialize` -> `200`

Verified runtime result:

- workspace name: `Founder Natural Flow Studio`
- workspace id: `8f7cdea2-724d-4f1b-a83c-b33625089771`
- final route: `/founder-workspace/dashboard`
- dashboard headline: `Founder Natural Flow Studio currently has 4 active agents`
- total agents: `4`
- active agents: `4`
- paused agents: `0`
- blockers: `0`
- collaborations: `3`
- starter triggers: `4`

Materialized agent cards shown on the dashboard:

- `Founder Copilot`
- `Project Chief of Staff`
- `Content Strategy Lead`
- `Global Distribution Lead`

Screenshot artifacts:

- `output/playwright/founder-natural-dashboard.png`
- `output/playwright/founder-natural-dashboard-full.png`
- `output/playwright/founder-dashboard-final.png`
- `output/playwright/founder-dashboard-full.png`

## Known Caveats

- The dashboard currently counts `idle` agents as active. This is intentional in the current implementation and is why the headline reports four active agents.
- The local test tenant still contains older hand-injected agent records from earlier dashboard experiments. The current dashboard path stays correct because it hydrates live status against the snapshot's stored `agent.id` values instead of matching only by name.
- The founder happy path has been validated manually against the real UI/API, but it is not yet covered by a CI-grade browser test.

## Recommended Follow-up

- Promote `output/founder-e2e-flow.cjs` into a stable automated E2E check for the founder happy path.
- Add a reset/cleanup routine for local founder demo tenants so manual verification starts from a cleaner state.
- If product delivery needs stronger operator guidance, add a user-facing founder onboarding document that explains the required model setup before the workflow begins.
