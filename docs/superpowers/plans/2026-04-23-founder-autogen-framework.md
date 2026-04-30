# Founder Autogen Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a founder-facing product layer on top of Clawith that lets a non-technical entrepreneur describe the business once, then automatically generate and run a multi-agent company scaffold.

**Architecture:** Keep Clawith as the execution substrate, but move the创业者产品层 out of `AgentCreate`. Persist a founder workspace, use the existing `founder_mainline_service` as an internal planning engine, then add a materialization layer that creates agents, relationships, skills, and starter triggers from the approved plan.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, React, TypeScript, TanStack Query, existing Duoduo catalogs, existing Clawith agent/relationship/trigger models

---

## Execution Status (2026-04-30)

This plan has been implemented and verified as the current Founder Autogen MVP lane. The detailed task checklist below is preserved as the original execution handoff, so unchecked boxes in the historical sections should not be treated as the current source of open work.

Delivered product path:

- A founder can create and resume a persisted founder workspace without opening raw `AgentCreate`.
- The founder workspace now owns `interview -> draft -> approval -> materialize`.
- The founder mainline can now branch beyond the original content/global-distribution scenario into SaaS / operations-automation and local-service lead-generation scaffolds when the business brief signals product-led subscriptions, CRM/workflow automation, customer success, neighborhood leads, appointments, or booking conversion.
- Materialization creates real Clawith agents, assigns model/template context, provisions skills, creates permissions and participants, and starts the agent runtime scaffold.
- Company wiring creates agent-agent relationships and starter triggers from the generated plan.
- The founder dashboard hydrates the stored materialization snapshot with live agent runtime state and blocker signals.
- The live founder E2E runner now self-bootstraps a disposable founder account/company/model and cleans those artifacts after the run by default.

Latest verification evidence:

- `cd backend && python -m app.scripts.founder_release_readiness --include-live-e2e`
  - backend founder ruff: passed
  - backend founder pytest: `35 passed`
  - frontend founder node tests: `9 pass`
  - frontend production build: passed
  - live founder E2E: passed in `self_bootstrap` mode
- Live E2E cleanup deleted `4` agents, `1` founder workspace, `1` dummy model, `1` user, `1` identity, and `1` tenant with `errors: []`.
- `docker exec clawith-backend-1 python3 -m app.scripts.cleanup_founder_self_bootstrap`
  - reported no remaining founder self-bootstrap E2E artifacts.

Remaining follow-ups:

- Promote the live browser E2E path to an optional CI job once a stable browser/runtime strategy exists for hosted runners.
- Add annotated screenshot walkthroughs after the founder UI copy stabilizes.
- Continue expanding the scenario library beyond the current content/global-distribution, SaaS/operations-automation, and local-service lead-generation scaffolds.

---

## Current Gap Snapshot

The current implementation is centered on:

- `backend/app/services/founder_mainline_service.py`
- `backend/app/api/enterprise.py`
- `frontend/src/pages/AgentCreate.tsx`

That flow only produces:

- interview progress
- draft preview
- template recommendations
- skill-pack recommendations
- single-agent create guard

The target product must instead produce:

- a persisted founder workspace
- a generated multi-agent company package
- real agent instances
- real agent relationships
- real starter triggers / operating loops
- a founder-facing control surface

## Planned File Structure

### Backend new files

- `backend/app/models/founder_workspace.py`
- `backend/app/schemas/founder_workspace.py`
- `backend/app/api/founder_workspaces.py`
- `backend/app/services/founder_company_materializer.py`
- `backend/app/services/founder_company_wiring.py`
- `backend/tests/test_founder_workspaces_api.py`
- `backend/tests/test_founder_company_materializer.py`
- `backend/tests/test_founder_company_wiring.py`

### Backend modified files

- `backend/app/main.py`
- `backend/app/models/__init__.py`
- `backend/app/api/agents.py`
- `backend/app/services/founder_mainline_service.py`

### Frontend new files

- `frontend/src/pages/FounderWorkspace.tsx`
- `frontend/src/pages/FounderCompanyDashboard.tsx`
- `frontend/src/services/founderWorkspace.ts`
- `frontend/src/services/founderCompanyDashboard.ts`
- `frontend/src/services/founderProviderPresets.ts`
- `frontend/tests/founderWorkspaceState.test.mjs`
- `frontend/tests/founderCompanyDashboard.test.mjs`
- `frontend/tests/founderProviderPresets.test.mjs`

### Frontend modified files

- `frontend/src/App.tsx`
- `frontend/src/pages/AgentCreate.tsx`
- `frontend/src/services/api.ts`

### Docs

- `output/founder-product-gap-analysis-2026-04-23.md`
- `README.md`
- `README_zh-CN.md`

---

### Task 1: Persist a Founder Workspace Above Single-Agent Creation

**Files:**
- Create: `backend/app/models/founder_workspace.py`
- Create: `backend/app/schemas/founder_workspace.py`
- Create: `backend/app/api/founder_workspaces.py`
- Test: `backend/tests/test_founder_workspaces_api.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Write the failing backend contract test**

```python
import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import get_current_user
from app.main import app


@pytest.mark.asyncio
async def test_create_founder_workspace_returns_persisted_shell():
    user = SimpleNamespace(
        id=uuid.uuid4(),
        role="platform_admin",
        tenant_id=uuid.uuid4(),
        is_active=True,
        department_id=None,
    )
    app.dependency_overrides[get_current_user] = lambda: user
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/founder-workspaces",
            json={
                "name": "Solo Growth Studio",
                "business_brief": "我想做一个面向出海创作者的单人公司。",
                "business_logic": {
                    "offer": "咨询 + 训练营",
                    "channel": "短视频 + 邮件",
                },
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Solo Growth Studio"
    assert payload["current_state"] == "intake"
    assert payload["latest_plan"]["plan_status"] in {"step0_blocked", "interview_in_progress"}
```

- [ ] **Step 2: Run the test to verify the route does not exist yet**

Run: `python -m pytest backend/tests/test_founder_workspaces_api.py -q`

Expected: FAIL with `404` or import errors for missing founder workspace modules.

- [ ] **Step 3: Implement the minimal founder workspace model, schema, and route**

```python
# backend/app/models/founder_workspace.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FounderWorkspace(Base):
    __tablename__ = "founder_workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    business_brief: Mapped[str] = mapped_column(Text, default="")
    business_logic: Mapped[dict] = mapped_column(JSONB, default=dict)
    current_state: Mapped[str] = mapped_column(String(32), default="intake")
    latest_plan_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
```

```python
# backend/app/api/founder_workspaces.py
from fastapi import APIRouter, Depends, status

from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/founder-workspaces", tags=["founder_workspaces"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_founder_workspace(payload: FounderWorkspaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    draft_plan = build_founder_mainline_interview_progress(
        payload.business_brief,
        model_ready_context={},
        answers=[],
    )
    workspace = FounderWorkspace(
        tenant_id=current_user.tenant_id,
        owner_user_id=current_user.id,
        name=payload.name,
        business_brief=payload.business_brief,
        business_logic=payload.business_logic,
        current_state="intake",
        latest_plan_json=draft_plan.model_dump(),
    )
    db.add(workspace)
    await db.flush()
    return FounderWorkspaceOut.model_validate(workspace)
```

- [ ] **Step 4: Run the backend contract test again**

Run: `python -m pytest backend/tests/test_founder_workspaces_api.py -q`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/founder_workspace.py backend/app/schemas/founder_workspace.py backend/app/api/founder_workspaces.py backend/app/main.py backend/app/models/__init__.py backend/tests/test_founder_workspaces_api.py
git commit -m "Create a founder workspace above single-agent creation"
```

---

### Task 2: Replace the Product Entry Surface With a Dedicated Founder Workspace Page

**Files:**
- Create: `frontend/src/pages/FounderWorkspace.tsx`
- Create: `frontend/src/services/founderWorkspace.ts`
- Test: `frontend/tests/founderWorkspaceState.test.mjs`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Write the failing frontend state test**

```javascript
import assert from "node:assert/strict";

import { deriveFounderWorkspaceStep } from "../src/services/founderWorkspace.ts";

assert.equal(
  deriveFounderWorkspaceStep({
    current_state: "intake",
    latest_plan: { plan_status: "step0_blocked" },
    materialization_status: "not_started",
  }),
  "intake",
);

assert.equal(
  deriveFounderWorkspaceStep({
    current_state: "planning",
    latest_plan: { plan_status: "ready_for_deploy_prep" },
    materialization_status: "not_started",
  }),
  "review",
);

assert.equal(
  deriveFounderWorkspaceStep({
    current_state: "materialized",
    latest_plan: { plan_status: "ready_for_deploy_prep" },
    materialization_status: "completed",
  }),
  "operate",
);

console.log("founderWorkspaceState tests passed");
```

- [ ] **Step 2: Run the test to verify the service does not exist yet**

Run: `node --test frontend/tests/founderWorkspaceState.test.mjs`

Expected: FAIL with module-not-found or missing export error.

- [ ] **Step 3: Implement the workspace service and a dedicated route**

```ts
// frontend/src/services/founderWorkspace.ts
export interface FounderWorkspaceRecord {
    id: string;
    name: string;
    current_state: "intake" | "planning" | "approved" | "materialized" | "operating";
    latest_plan: { plan_status: string };
    materialization_status: "not_started" | "running" | "completed" | "failed";
}

export function deriveFounderWorkspaceStep(workspace: FounderWorkspaceRecord): "intake" | "plan" | "review" | "operate" {
    if (workspace.materialization_status === "completed" || workspace.current_state === "materialized") {
        return "operate";
    }
    if (workspace.latest_plan?.plan_status === "ready_for_deploy_prep" || workspace.current_state === "approved") {
        return "review";
    }
    if (workspace.current_state === "planning") {
        return "plan";
    }
    return "intake";
}
```

```tsx
// frontend/src/App.tsx
<Route path="/founder" element={<FounderWorkspace />} />
```

```tsx
// frontend/src/pages/FounderWorkspace.tsx
export default function FounderWorkspace() {
    return (
        <div className="page-shell">
            <h1>创业者工作区</h1>
            <p>这里负责采集业务目标、生成团队方案、批准后物化多 Agent 公司系统。</p>
        </div>
    );
}
```

- [ ] **Step 4: Run the frontend state test**

Run: `node --test frontend/tests/founderWorkspaceState.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FounderWorkspace.tsx frontend/src/services/founderWorkspace.ts frontend/src/App.tsx frontend/src/services/api.ts frontend/tests/founderWorkspaceState.test.mjs
git commit -m "Move founder flow into a dedicated workspace entry"
```

---

### Task 3: Materialize an Approved Plan Into Real Agents Instead of a Preview Summary

**Files:**
- Create: `backend/app/services/founder_company_materializer.py`
- Create: `backend/tests/test_founder_company_materializer.py`
- Modify: `backend/app/api/founder_workspaces.py`
- Modify: `backend/app/api/agents.py`

- [ ] **Step 1: Write the failing materialization test**

```python
@pytest.mark.asyncio
async def test_materialize_founder_workspace_creates_multiple_agents_and_returns_ids():
    workspace = FounderWorkspace(
        name="Solo Growth Studio",
        business_brief="做出海创作者咨询与训练营业务",
        business_logic={"offer": "咨询 + 训练营"},
        current_state="approved",
        latest_plan_json={
            "plan_status": "ready_for_deploy_prep",
            "founder_copilot": {"template_key": "founder-copilot"},
            "teams": [
                {
                    "team_id": "content-growth",
                    "roles": [
                        {"template_key": "content-strategy-lead"},
                        {"template_key": "global-distribution-lead"},
                    ],
                }
            ],
        },
    )

    result = await materialize_founder_workspace(db, workspace)

    assert result.created_agent_ids
    assert len(result.created_agent_ids) >= 3
    assert result.primary_agent_name == "Founder Copilot"
```

- [ ] **Step 2: Run the materialization test**

Run: `python -m pytest backend/tests/test_founder_company_materializer.py -q`

Expected: FAIL with missing materializer service.

- [ ] **Step 3: Implement the minimal materializer**

```python
# backend/app/services/founder_company_materializer.py
async def materialize_founder_workspace(db: AsyncSession, workspace: FounderWorkspace) -> FounderWorkspaceMaterializationResult:
    plan = FounderMainlineDraftPlan.model_validate(workspace.latest_plan_json)
    template_catalog = {item["template_key"]: item for item in get_template_library_catalog()["role_templates"]}

    role_template_keys = [
        plan.founder_copilot.template_key,
        *[role.template_key for team in plan.teams for role in team.roles],
    ]

    created_agents: list[Agent] = []
    for template_key in role_template_keys:
        template_meta = template_catalog[template_key]
        agent = Agent(
            name=template_meta["canonical_name"],
            role_description=template_meta["primary_goal"],
            tenant_id=workspace.tenant_id,
            creator_id=workspace.owner_user_id,
        )
        db.add(agent)
        created_agents.append(agent)

    await db.flush()
    return FounderWorkspaceMaterializationResult(
        created_agent_ids=[str(agent.id) for agent in created_agents],
        primary_agent_name=created_agents[0].name,
    )
```

- [ ] **Step 4: Expose the materialization endpoint**

Run after adding route:

```bash
python -m pytest backend/tests/test_founder_company_materializer.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/founder_company_materializer.py backend/app/api/founder_workspaces.py backend/tests/test_founder_company_materializer.py backend/app/api/agents.py
git commit -m "Materialize approved founder plans into real agents"
```

---

### Task 4: Auto-Wire Relationships, Skill Packs, and Starter Triggers for the Generated Company

**Files:**
- Create: `backend/app/services/founder_company_wiring.py`
- Create: `backend/tests/test_founder_company_wiring.py`
- Modify: `backend/app/services/founder_company_materializer.py`

- [ ] **Step 1: Write the failing wiring test**

```python
@pytest.mark.asyncio
async def test_wire_founder_company_creates_relationships_and_triggers():
    created_agents = {
        "Founder Copilot": uuid.uuid4(),
        "Content Strategy Lead": uuid.uuid4(),
        "Global Distribution Lead": uuid.uuid4(),
    }
    plan = FounderMainlineDraftPlan.model_validate({
        "scenario_id": "cn-team-global-content-knowledge",
        "scenario_name_zh": "中文团队做出海内容 / 知识付费业务",
        "locale": "zh-CN",
        "plan_status": "ready_for_deploy_prep",
        "company_blueprint": {},
        "founder_copilot": {
            "canonical_name": "Founder Copilot",
            "display_name_zh": "创业导师",
            "role_level": "lead",
            "role_type": "strategy",
            "primary_goal": "拆解目标",
            "template_key": "founder-copilot",
            "recommended_skill_packs": ["founder-strategy-pack"],
            "human_approval_required": True,
            "reason_zh": "主控",
        },
        "teams": [],
        "template_recommendations": [],
        "skill_pack_recommendations": [],
        "coordination_relationships": [
            {
                "from_role": "Founder Copilot",
                "to_role": "Content Strategy Lead",
                "relationship_type": "goal_to_execution",
                "handoff_rule_zh": "拆解后交接",
                "escalation_rule_zh": "高风险升级",
            }
        ],
        "approval_boundaries": ["正式承诺需要人工确认"],
        "open_questions": [],
        "deployment_readiness": {
            "can_enter_deploy_prep": True,
            "blocker_reason_zh": "",
            "missing_items": [],
            "resolved_template_keys": ["founder-copilot"],
            "resolved_pack_ids": ["founder-strategy-pack"],
        },
        "traceability": [],
        "previous_plan_summary_zh": "",
        "change_summary_zh": [],
        "changed_template_keys": [],
        "changed_pack_ids": [],
    })

    result = build_founder_company_wiring(plan, created_agents)

    assert result.relationship_count == 1
    assert result.trigger_specs
```

- [ ] **Step 2: Run the wiring test**

Run: `python -m pytest backend/tests/test_founder_company_wiring.py -q`

Expected: FAIL with missing wiring module.

- [ ] **Step 3: Implement deterministic wiring specs**

```python
# backend/app/services/founder_company_wiring.py
def build_founder_company_wiring(plan: FounderMainlineDraftPlan, created_agents: dict[str, uuid.UUID]) -> FounderCompanyWiringResult:
    relationships = []
    for item in plan.coordination_relationships:
        source_id = created_agents.get(item.from_role)
        target_id = created_agents.get(item.to_role)
        if source_id and target_id:
            relationships.append((source_id, target_id))

    trigger_specs = [
        {
            "role": "Founder Copilot",
            "type": "cron",
            "config": {"cron": "0 9 * * 1-5"},
            "reason": "工作日晨间目标校准",
        },
        {
            "role": "Project Chief of Staff",
            "type": "cron",
            "config": {"cron": "0 18 * * 1-5"},
            "reason": "工作日收尾复盘",
        },
    ]

    return FounderCompanyWiringResult(
        relationship_count=len(relationships),
        relationships=relationships,
        trigger_specs=trigger_specs,
    )
```

- [ ] **Step 4: Connect wiring into materialization**

Run: `python -m pytest backend/tests/test_founder_company_materializer.py backend/tests/test_founder_company_wiring.py -q`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/founder_company_wiring.py backend/app/services/founder_company_materializer.py backend/tests/test_founder_company_wiring.py backend/tests/test_founder_company_materializer.py
git commit -m "Auto-wire generated founder companies with relationships and starter triggers"
```

---

### Task 5: Add a Founder Dashboard for Operating the Generated One-Person Company

**Files:**
- Create: `frontend/src/pages/FounderCompanyDashboard.tsx`
- Create: `frontend/src/services/founderCompanyDashboard.ts`
- Test: `frontend/tests/founderCompanyDashboard.test.mjs`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write the failing dashboard summarizer test**

```javascript
import assert from "node:assert/strict";

import { summarizeFounderCompanyDashboard } from "../src/services/founderCompanyDashboard.ts";

const summary = summarizeFounderCompanyDashboard({
  companyName: "Solo Growth Studio",
  agents: [
    { name: "Founder Copilot", status: "active" },
    { name: "Content Strategy Lead", status: "active" },
    { name: "Global Distribution Lead", status: "paused" },
  ],
  blockers: ["未配置邮件渠道"],
});

assert.equal(summary.activeAgentCount, 2);
assert.equal(summary.hasBlockers, true);
assert.equal(summary.headlineZh, "Solo Growth Studio 当前有 2 个活跃 Agent");

console.log("founderCompanyDashboard tests passed");
```

- [ ] **Step 2: Run the dashboard test**

Run: `node --test frontend/tests/founderCompanyDashboard.test.mjs`

Expected: FAIL with missing dashboard service.

- [ ] **Step 3: Implement the summarizer and dashboard page**

```ts
// frontend/src/services/founderCompanyDashboard.ts
export function summarizeFounderCompanyDashboard(input: {
    companyName: string;
    agents: Array<{ name: string; status: string }>;
    blockers: string[];
}) {
    const activeAgentCount = input.agents.filter((item) => item.status === "active").length;
    return {
        activeAgentCount,
        hasBlockers: input.blockers.length > 0,
        headlineZh: `${input.companyName} 当前有 ${activeAgentCount} 个活跃 Agent`,
    };
}
```

```tsx
// frontend/src/pages/FounderCompanyDashboard.tsx
export default function FounderCompanyDashboard() {
    return (
        <div className="page-shell">
            <h1>一人公司控制台</h1>
            <p>查看 Agent 状态、阻塞、日常节奏和重规划入口。</p>
        </div>
    );
}
```

- [ ] **Step 4: Run the dashboard test**

Run: `node --test frontend/tests/founderCompanyDashboard.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FounderCompanyDashboard.tsx frontend/src/services/founderCompanyDashboard.ts frontend/src/App.tsx frontend/tests/founderCompanyDashboard.test.mjs
git commit -m "Add a founder dashboard for operating generated companies"
```

---

### Task 6: Hide Raw Engineering Concepts Behind Beginner-Friendly Provider Presets

**Files:**
- Create: `frontend/src/services/founderProviderPresets.ts`
- Test: `frontend/tests/founderProviderPresets.test.mjs`
- Modify: `frontend/src/pages/FounderWorkspace.tsx`
- Modify: `frontend/src/pages/AgentCreate.tsx`

- [ ] **Step 1: Write the failing provider preset test**

```javascript
import assert from "node:assert/strict";

import { buildFounderProviderPresetCards } from "../src/services/founderProviderPresets.ts";

const cards = buildFounderProviderPresetCards([
  { provider: "deepseek", display_name: "DeepSeek", default_base_url: "https://api.deepseek.com/v1" },
  { provider: "openai", display_name: "OpenAI", default_base_url: "https://api.openai.com/v1" },
]);

assert.equal(cards.length, 2);
assert.equal(cards[0].labelZh, "DeepSeek（推荐）");
assert.equal(cards[0].showRawBaseUrlInput, false);

console.log("founderProviderPresets tests passed");
```

- [ ] **Step 2: Run the provider preset test**

Run: `node --test frontend/tests/founderProviderPresets.test.mjs`

Expected: FAIL with missing preset service.

- [ ] **Step 3: Implement beginner-mode provider cards**

```ts
// frontend/src/services/founderProviderPresets.ts
export function buildFounderProviderPresetCards(providers: Array<{
    provider: string;
    display_name: string;
    default_base_url?: string;
}>) {
    return providers.map((item, index) => ({
        provider: item.provider,
        labelZh: index === 0 ? `${item.display_name}（推荐）` : item.display_name,
        baseUrl: item.default_base_url || "",
        showRawBaseUrlInput: false,
        requiresAdvancedMode: item.provider === "custom",
    }));
}
```

- [ ] **Step 4: Use beginner mode on the founder surface and keep raw `AgentCreate` behind an advanced action**

Run: `node --test frontend/tests/founderProviderPresets.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/founderProviderPresets.ts frontend/src/pages/FounderWorkspace.tsx frontend/src/pages/AgentCreate.tsx frontend/tests/founderProviderPresets.test.mjs
git commit -m "Hide raw model configuration behind founder-friendly presets"
```

---

### Task 7: Final Verification, Migration Safety, and Product Docs

**Files:**
- Modify: `README.md`
- Modify: `README_zh-CN.md`
- Modify: `output/founder-product-gap-analysis-2026-04-23.md`

- [ ] **Step 1: Write the final verification checklist into docs**

```md
- Founder can create a workspace without opening raw AgentCreate
- Founder can save business brief and business logic
- Founder can run interview -> draft -> approve -> materialize
- System creates multiple agents instead of one
- Relationships and starter triggers are auto-wired
- Founder dashboard shows active agents and blockers
```

- [ ] **Step 2: Run backend verification**

Run: `python -m pytest backend/tests/test_founder_workspaces_api.py backend/tests/test_founder_company_materializer.py backend/tests/test_founder_company_wiring.py backend/tests/test_founder_mainline_service.py -q`

Expected: PASS

- [ ] **Step 3: Run frontend verification**

Run: `node --test frontend/tests/founderWorkspaceState.test.mjs frontend/tests/founderCompanyDashboard.test.mjs frontend/tests/founderProviderPresets.test.mjs`

Expected: PASS

- [ ] **Step 4: Run build verification**

Run: `cd frontend && npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md README_zh-CN.md output/founder-product-gap-analysis-2026-04-23.md
git commit -m "Document and verify the founder autogen product path"
```

---

## Self-Review

### Spec coverage

This plan explicitly closes the main gaps against the clarified product goal:

- Clawith remains the base: handled by building a founder product layer on top of existing models and APIs
- Zero-AI / zero-engineering founder UX: handled by Task 2 and Task 6
- Automatic generation of a multi-agent company scaffold: handled by Task 3 and Task 4
- One-person-company operation loop: handled by Task 5
- Delivery-grade documentation and verification: handled by Task 7

### Placeholder scan

The plan avoids `TBD`, `TODO`, and “similar to” references. Every task names exact files and concrete commands.

### Type consistency

The same domain terms are used throughout:

- `FounderWorkspace`
- `FounderWorkspaceOut`
- `materialize_founder_workspace`
- `build_founder_company_wiring`
- `FounderCompanyDashboard`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
