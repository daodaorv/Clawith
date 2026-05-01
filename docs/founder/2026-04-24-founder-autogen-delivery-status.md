# Founder Autogen Delivery Status (2026-04-24)

## Current Stage

The founder-facing product line is now at a working MVP stage on top of Clawith:

- A founder can create a persisted founder workspace instead of starting from raw single-agent creation.
- The system can run `interview -> draft -> approval -> materialize`.
- Materialization creates a runnable multi-agent company scaffold inside the existing Clawith runtime.
- The founder lands on a dedicated dashboard that combines stored snapshot data with live runtime agent state.

This closes the main implementation plan tracked in:

- `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`

Latest status refresh:

- 2026-04-30: the implementation plan is now repository-tracked with an execution-status section, and the self-bootstrap live E2E cleanup path has been verified against the running Docker-backed stack.
- 2026-04-30: a manual GitHub Actions live gate is available at `.github/workflows/founder-live-e2e.yml` for reachable staging/local-tunnel environments without making push or pull-request CI brittle.
- 2026-04-30: the founder scenario selector now detects SaaS / operations-automation briefs and generates a distinct `cn-saas-ops-automation` company scaffold instead of always falling back to the original content / knowledge-business scenario.
- 2026-04-30: the Founder Workspace draft review now explains the selected scenario with matched signals, priority-focus chips, template preview, and skill-pack preview so non-technical founders can understand why the scaffold was generated.
- 2026-04-30: the scenario selector now also detects local-service lead-generation briefs and generates a `cn-local-service-leadgen` scaffold for appointments, booking conversion, customer follow-up, and delivery scheduling.
- 2026-04-30: the live founder E2E runner can now select a scenario through `FOUNDER_E2E_SCENARIO`, and the local-service scenario was verified through the real browser path.
- 2026-05-01: the scenario selector now detects cross-border ecommerce briefs and generates a `cn-cross-border-ecommerce-ops` scaffold for product listings, marketplace/channel distribution, inventory fulfillment, after-sales, reviews, and repeat purchase follow-up.

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
- `backend/app/services/founder_mainline_service.py`
  - selects between the original content/global-distribution scaffold and the SaaS/operations-automation scaffold from the business brief and structured answers

Key shipped backend change set:

- `de5d5e45` `Make founder-generated companies usable inside the Clawith runtime`

### Frontend

- `frontend/src/pages/FounderWorkspace.tsx`
  - dedicated founder workflow entry page
  - draft review shows scenario rationale, matched signals, priority focus, template preview, and skill-pack preview before materialization
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

Founder now also has a deterministic release-readiness entrypoint that chains founder-scoped backend verification, founder frontend tests, and the frontend production build:

```bash
cd backend
python -m app.scripts.founder_release_readiness
```

The same command is wired into:

- `.github/workflows/founder-release-readiness.yml`

Founder browser automation is now repo-versioned and runnable through a self-bootstrapping default path:

```bash
cd frontend
npm run test:e2e:founder
```

Notes about the browser runner:

- It installs `playwright-core@1.59.1` into a temporary runtime directory on demand instead of adding Playwright to repo dependencies.
- It launches the system Microsoft Edge executable and writes screenshots to `output/playwright/`.
- Set `FOUNDER_E2E_SCENARIO` to `content-knowledge`, `saas-ops-automation`, `local-service-leadgen`, or `cross-border-ecommerce` to choose which founder scenario the browser runner exercises. The default remains `content-knowledge`.
- With no `FOUNDER_E2E_*` credentials it self-bootstraps a disposable founder account, creates a disposable company, seeds a tenant-scoped dummy model when needed, and then runs the founder mainline flow.
- That self-bootstrap default now also deletes the disposable account, company, workspace, agents, and dummy model at the end of the run so the local database stays clean.
- With explicit `FOUNDER_E2E_EMAIL/FOUNDER_E2E_PASSWORD` values it reuses an existing model-ready founder tenant and still covers `login -> tenant select (when required) -> founder workspace create -> planning interview -> draft -> confirm -> materialize -> founder dashboard assertions`.
- Set `FOUNDER_E2E_SKIP_CLEANUP=1` only when you intentionally want to keep the generated self-bootstrap artifacts for debugging.

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

Latest release-readiness refresh on 2026-04-30:

- `cd backend && python -m app.scripts.founder_release_readiness --include-live-e2e`
  - backend founder ruff: passed
  - backend founder pytest: `35 passed`
  - frontend founder node tests: `9 pass`
  - frontend production build: passed
  - live founder E2E: passed in `self_bootstrap` mode
- Latest live E2E result:
  - workspace name: `Founder Workspace 23-36-57`
  - final route: `/founder-workspace/dashboard?workspaceId=e3bf151a-8054-4d95-9520-b6fb2d8b0b34`
  - dashboard headline: `Founder Workspace 23-36-57 currently has 4 active agents`
  - displayed agents: `Founder Copilot`, `Project Chief of Staff`, `Content Strategy Lead`, `Global Distribution Lead`
  - blockers: `0`
  - relationships: `3`
  - starter triggers: `4`
- Cleanup evidence from that run:
  - deleted agents: `4`
  - deleted founder workspaces: `1`
  - deleted dummy models: `1`
  - deleted users: `1`
  - deleted identities: `1`
  - deleted tenants: `1`
  - errors: `[]`
- Follow-up sweep:
  - `docker exec clawith-backend-1 python3 -m app.scripts.cleanup_founder_self_bootstrap`
  - result: `No founder self-bootstrap E2E artifacts were found.`

Latest local-service live E2E refresh on 2026-04-30:

- `cd frontend && FOUNDER_E2E_SCENARIO=local-service-leadgen npm run test:e2e:founder`
  - auth mode: `self_bootstrap`
  - workspace name: `Founder Workspace 15-52-05`
  - final route: `/founder-workspace/dashboard?workspaceId=cadc6e41-a2ea-4ed4-86b8-6e437dfb3c95`
  - scenario key: `local-service-leadgen`
  - displayed agents: `Founder Copilot`, `Content Strategy Lead`, `Customer Follow-up Lead`, `Project Chief of Staff`
  - blockers: `0`
  - relationships: `3`
  - starter triggers: `4`
  - cleanup deleted: `4` agents, `1` founder workspace, `1` dummy model, `1` user, `1` identity, `1` tenant
  - cleanup errors: `[]`
  - follow-up sweep result: `No founder self-bootstrap E2E artifacts were found.`

Cross-border ecommerce live E2E refresh on 2026-05-01:

- `cd frontend && FOUNDER_E2E_SCENARIO=cross-border-ecommerce FOUNDER_E2E_BASE_URL=http://127.0.0.1:3010 npm run test:e2e:founder`
  - auth mode: `self_bootstrap`
  - workspace name: `Founder Workspace 09-35-32`
  - final route: `/founder-workspace/dashboard?workspaceId=fd05d945-07e2-4ce1-a8a9-83ae3755b95e`
  - scenario key: `cross-border-ecommerce`
  - displayed agents: `Founder Copilot`, `Content Strategy Lead`, `Global Distribution Lead`, `Project Chief of Staff`, `Customer Follow-up Lead`
  - blockers: `0`
  - relationships: `4`
  - starter triggers: `5`
  - request failures: `[]`
  - cleanup deleted: `5` agents, `1` founder workspace, `1` dummy model, `1` user, `1` identity, `1` tenant
  - cleanup errors: `[]`
  - follow-up sweep result: `No founder self-bootstrap E2E artifacts were found.`

Manual GitHub Actions live gate:

- Workflow: `.github/workflows/founder-live-e2e.yml`
- Trigger: `workflow_dispatch` only
- Required input: `base_url`, which must be reachable from the GitHub runner
- Optional secrets:
  - `FOUNDER_E2E_EMAIL`
  - `FOUNDER_E2E_PASSWORD`
  - `FOUNDER_E2E_TENANT`
  - `FOUNDER_E2E_MODEL_LABEL`
- Optional input:
  - `scenario` = `content-knowledge`, `saas-ops-automation`, `local-service-leadgen`, or `cross-border-ecommerce`
- If credentials are omitted, the workflow uses the self-bootstrap path and cleanup remains enabled unless the manual `skip_cleanup` input is set.
- Screenshots are uploaded as the `founder-live-e2e-screenshots` artifact.

Scenario coverage:

- `cn-team-global-content-knowledge`: original Chinese-first content, global distribution, knowledge-business scaffold.
- `cn-saas-ops-automation`: SaaS / operations-automation scaffold for subscription products, CRM/spreadsheet workflow replacement, onboarding, customer success, and recurring reporting.
- `cn-local-service-leadgen`: local-service lead-generation scaffold for neighborhood leads, appointment booking, customer follow-up, and delivery scheduling.
- `cn-cross-border-ecommerce-ops`: cross-border ecommerce operations scaffold for product listings, Shopify/Amazon/TikTok Shop-style channel distribution, inventory fulfillment, after-sales, reviews, and repeat purchase follow-up.

Screenshot artifacts:

- `output/playwright/2026-04-24T13-10-15-461Z-*.png`
- `output/playwright/founder-natural-dashboard.png`
- `output/playwright/founder-natural-dashboard-full.png`
- `output/playwright/founder-dashboard-final.png`
- `output/playwright/founder-dashboard-full.png`

## Known Caveats

- The dashboard currently counts `idle` agents as active. This is intentional in the current implementation and is why the headline reports four active agents.
- The local test tenant still contains older hand-injected agent records from earlier dashboard experiments. The current dashboard path stays correct because it hydrates live status against the snapshot's stored `agent.id` values instead of matching only by name.
- The deterministic founder release-readiness lane is now wired into CI, but the live founder E2E runner still depends on a live frontend/backend environment and a local Microsoft Edge install. The new self-bootstrap path removes the seeded multi-tenant test-account requirement, but the live browser gate is still environment-dependent.

## Recommended Follow-up

- Use the manual `Founder Live E2E (Manual)` workflow against a reachable staging or tunnel URL before releases that touch founder onboarding, workspace selection, materialization, or dashboard behavior.
- Use `cd backend && python -m app.scripts.reset_founder_demo_tenant --tenant-slug <slug>` for a dry-run cleanup summary, then add `--wipe-tenant-agents --yes` when you want to reset a dedicated founder demo tenant before rerunning the flow.
- Use `cd backend && python -m app.scripts.cleanup_founder_self_bootstrap --yes` if an interrupted or pre-fix self-bootstrap run leaves disposable founder E2E artifacts behind.
- Continue expanding the scenario library beyond the current four scaffolds when a new founder business family has clear signals, role composition, and live E2E coverage.
- Expand the founder onboarding guide with annotated screenshots once the UI copy stabilizes.
