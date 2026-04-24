# Founder Autogen Delivery Status (2026-04-24)

## Current Stage

The founder-facing product line is now at a working MVP stage on top of Clawith:

- A founder can create a persisted founder workspace instead of starting from raw single-agent creation.
- The system can run `interview -> draft -> approval -> materialize`.
- Materialization creates a runnable multi-agent company scaffold inside the existing Clawith runtime.
- The founder lands on a dedicated dashboard that combines stored snapshot data with live runtime agent state.

This closes the main implementation plan tracked in:

- `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`

Related founder docs:

- `docs/founder/founder-onboarding.md`

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
- `frontend/src/services/founderMainlineE2e.ts`
  - shared config and scenario builder for founder mainline browser coverage
- `frontend/tests/e2e/founderMainlineE2e.mjs`
  - self-bootstrapping live browser runner for the founder mainline flow

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
- `node --test frontend/tests/founderCompanyDashboard.test.mjs frontend/tests/founderMainlineE2eRuntime.test.mjs`
  - passed
- `cd frontend && npm run build`
  - passed

Founder browser automation is now repo-versioned and runnable through:

```bash
cd frontend
FOUNDER_E2E_EMAIL=<seeded-user-email> \
FOUNDER_E2E_PASSWORD=<seeded-user-password> \
FOUNDER_E2E_BASE_URL=http://127.0.0.1:3010 \
FOUNDER_E2E_TENANT="Solo Founder Lab (solo-founder-lab-3cf969)" \
npm run test:e2e:founder
```

Notes about the browser runner:

- It installs `playwright-core@1.59.1` into a temporary runtime directory on demand instead of adding Playwright to repo dependencies.
- It launches the system Microsoft Edge executable and writes screenshots to `output/playwright/`.
- It covers `login -> tenant select (when required) -> founder workspace create -> planning interview -> draft -> confirm -> materialize -> founder dashboard assertions`.

## Real UI / API Mainline Verification

The founder happy path was run through the real UI and API on 2026-04-24, both manually and through the automated browser runner.

Environment:

- latest source frontend: `http://127.0.0.1:3010`
- backend/API path proxied through the stable Docker web entrypoint on `http://127.0.0.1:3008`

Natural flow that was completed:

1. Register or log in
2. Select the correct tenant when multi-tenant login is required
3. Create company
4. Create founder workspace
5. Select a configured model
6. Fill the eight interview answers
7. Save interview progress
8. Generate draft plan
9. Confirm readiness
10. Materialize the company
11. Land on founder dashboard

Observed API evidence:

- `POST /api/tenants/self-create` -> `201`
- `POST /api/founder-workspaces` -> `201`
- `POST /api/founder-workspaces/{id}/planning/interview-progress` -> `200`
- `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- second `POST /api/founder-workspaces/{id}/planning/draft-plan` after confirmation -> `200`
- `POST /api/founder-workspaces/{id}/materialize` -> `200`

Verified runtime result from the automated run:

- workspace name: `Founder Workspace 13-10-15`
- final route: `/founder-workspace/dashboard`
- dashboard headline: `Founder Workspace 13-10-15 currently has 4 active agents`
- total displayed agents: `4`
- blockers: `0`
- relationships: `3`
- starter triggers: `4`

Materialized agent cards shown on the dashboard:

- `Founder Copilot`
- `Project Chief of Staff`
- `Content Strategy Lead`
- `Global Distribution Lead`

Screenshot artifacts:

- `output/playwright/2026-04-24T13-10-15-461Z-*.png`
- `output/playwright/founder-natural-dashboard.png`
- `output/playwright/founder-natural-dashboard-full.png`
- `output/playwright/founder-dashboard-final.png`
- `output/playwright/founder-dashboard-full.png`

## Known Caveats

- The dashboard currently counts `idle` agents as active. This is intentional in the current implementation and is why the headline reports four active agents.
- The local test tenant still contains older hand-injected agent records from earlier dashboard experiments. The current dashboard path stays correct because it hydrates live status against the snapshot's stored `agent.id` values instead of matching only by name.
- The automated founder E2E runner is now available, but it still depends on a live frontend/backend environment, a seeded multi-tenant test account, and a local Microsoft Edge install. It is not yet wired into CI.

## Recommended Follow-up

- Wire `npm run test:e2e:founder` into an optional CI or release-readiness lane once a stable seeded test account strategy is in place.
- Use `cd backend && python -m app.scripts.reset_founder_demo_tenant --tenant-slug <slug>` for a dry-run cleanup summary, then add `--wipe-tenant-agents --yes` when you want to reset a dedicated founder demo tenant before rerunning the flow.
- Expand the founder onboarding guide with annotated screenshots once the UI copy stabilizes.
