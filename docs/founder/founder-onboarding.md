# Founder Onboarding Guide

## Who This Is For

This guide is for a founder who wants Clawith to generate the first version of a multi-agent company scaffold without needing to understand AI engineering details first.

If you can clearly explain your business goal, customer, offer, and where human approval is still required, you are ready to use the founder flow.

## What You Need Before Starting

Prepare these four things first:

1. A Clawith account that can log in and enter the correct company tenant.
2. One reachable LLM provider account and API key.
3. At least one enabled model in `Enterprise settings`.
4. A short business description covering offer, audience, acquisition, conversion, and delivery.

You do not need to design every agent manually. The founder flow is meant to turn the business description into the first runnable structure for you.

## Recommended First-Run Setup

For the first run, keep the business narrow:

- One core offer
- One main customer segment
- One main acquisition channel
- One clear conversion path
- A simple human approval boundary

Good first-run example:

- Offer: consulting plus a cohort sprint
- Audience: creators or small business operators in one niche
- Acquisition: short video plus email
- Human approval boundary: pricing, promises, and final client-facing commitments

Avoid trying to model every future product, market, or automation rule in the first workspace. The first goal is a usable operating scaffold, not a perfect simulation of the business.

## Fastest Path Through The Product

### Step 1: Configure a provider and model

Open `Enterprise settings` and add at least one usable provider and one enabled model.

If you are not sure which provider to use:

- Start with the recommended founder preset shown in `Founder Workspace`.
- Use a provider with a stable API key flow and a model you can actually call from your current network environment.

The founder workflow cannot move past the first planning step if no enabled model is available.

### Step 2: Log in and choose the right tenant

Open the app and log in.

If your account belongs to multiple tenants, Clawith may show a tenant selection modal during login. Choose the company you want to build the founder workspace under before continuing.

### Step 3: Open Founder Workspace

Go to:

- `/founder-workspace`

Create a workspace using:

- `Workspace name`
- `Core offer`
- `Acquisition channel`
- `Business brief`

This saves the business shell before any draft plan is generated.

### Step 4: Choose the model for planning

Inside the founder planning section, select the model that should be used for the current planning run.

If the model list is empty:

- go back to `Enterprise settings`
- confirm the provider is configured
- confirm the model is enabled

### Step 5: Complete the founder interview

Answer the eight interview fields as concretely as possible.

The most important answers are:

- target user
- core product or service
- acquisition channels
- conversion model
- delivery model
- automation versus human approval boundary

Write answers the way you would brief a chief of staff, not the way you would write marketing copy.

### Step 6: Save progress and generate the draft

Use:

- `Save interview progress` if you want to persist partial work
- `Generate founder draft plan` once all interview fields are ready

If the system still asks follow-up questions, answer those gaps first. That means the plan is not ready for materialization yet.

### Step 7: Review the draft like an operator

Before materialization, check:

- does the team structure match the business?
- are the channels realistic?
- are there still open questions?
- is the human approval boundary explicit enough?

Use `Correction notes` if the first draft is directionally right but needs changes to roles, channels, delivery, or approval boundaries.

Only confirm the draft when you are comfortable turning it into the first company scaffold.

### Step 8: Materialize the company scaffold

When the plan reaches deploy prep readiness, run materialization.

This creates real runtime records instead of keeping the output as a draft only.

The generated result includes:

- founder workspace record
- approved planning context
- materialized agent records
- relationships between agents
- starter triggers and operating loops
- founder dashboard snapshot

### Step 9: Use the founder dashboard as the operating surface

After materialization, Clawith sends you to:

- `/founder-workspace/dashboard`

Use the dashboard to verify:

- agent cards are visible
- blockers are not unexpectedly high
- relationship count is non-zero
- starter trigger count is non-zero

This is the first proof that the founder description has been converted into a real multi-agent operating scaffold.

## How To Write Better Inputs

Use plain business language.

Good:

- "We sell a weekly conversion teardown for independent coaches and use short video plus DMs to book calls."

Less useful:

- "Build an AI growth empire with full automation."

The system works best when you specify:

- who the customer is
- what they buy
- how they arrive
- how they convert
- what delivery looks like
- what AI may draft versus what a human must approve

## What Clawith Will And Will Not Do For You

Clawith can:

- structure the business into an initial multi-agent scaffold
- generate draft planning context
- create agents, relationships, and starter triggers
- give you a dashboard to inspect the resulting operating system

Clawith does not automatically guarantee:

- correct pricing
- correct legal or compliance decisions
- correct promises to customers
- final go-to-market fit

Those decisions should stay under founder approval, especially in the first runs.

## Common Sticking Points

### No model appears in Founder Workspace

Go to `Enterprise settings` and confirm:

- a provider is configured
- the model is enabled
- the current user can access that tenant's configuration

### Login keeps stopping at tenant selection

This is expected for multi-tenant accounts. Choose the target tenant first, then continue into the founder flow.

### The draft is not ready for materialization

Usually one of these is still missing:

- concrete interview answers
- model selection
- clear automation versus human boundary
- enough information for deploy prep

### The dashboard shows agents as active even when they are idle

The current founder dashboard intentionally counts `idle` agents as active in the headline.

## Suggested Operator Verification

After your first successful run, verify these outcomes:

1. The route ends on `/founder-workspace/dashboard`.
2. The dashboard shows the generated team instead of an empty state.
3. The relationship and trigger counts are populated.
4. You can explain what each generated role is supposed to own.

If those four checks pass, you have a valid first operating scaffold. You can refine from there instead of starting over.

## Local Verification Route For Operators

If you are testing the latest source frontend against the stable Docker-backed backend chain:

```bash
cd frontend
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3008 npm run dev -- --host 127.0.0.1 --port 3010
```

Then open:

- `http://127.0.0.1:3010/founder-workspace`

If you want to run the deterministic founder release-readiness lane before manual browser validation:

```bash
cd backend
python -m app.scripts.founder_release_readiness
```

If you want to run the automated founder browser check against a fresh self-bootstrapped company:

```bash
cd frontend
npm run test:e2e:founder
```

That default path now:

- registers a disposable founder account
- creates a disposable company
- seeds a tenant-scoped dummy LLM model when the new company has none
- runs the full founder flow through dashboard assertions
- cleans up the disposable account, company, workspace, agents, and dummy model after the assertions finish

If you want to keep the generated self-bootstrap artifacts for debugging, add:

```bash
FOUNDER_E2E_SKIP_CLEANUP=1
```

If you want to target an existing model-ready founder tenant instead, provide explicit credentials:

```bash
cd frontend
FOUNDER_E2E_EMAIL=<seeded-user-email> \
FOUNDER_E2E_PASSWORD=<seeded-user-password> \
FOUNDER_E2E_BASE_URL=http://127.0.0.1:3010 \
FOUNDER_E2E_TENANT="Solo Founder Lab (solo-founder-lab-3cf969)" \
npm run test:e2e:founder
```

You can append the live gate to the deterministic lane from the backend directory without exporting any founder credentials:

```bash
cd backend
python -m app.scripts.founder_release_readiness --include-live-e2e
```
