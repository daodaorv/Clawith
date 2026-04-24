import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.founder_company_materializer import materialize_founder_workspace


class RecordingDB:
    def __init__(self, responses=None):
        self.added = []
        self.responses = list(responses or [])

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        now = datetime.now(timezone.utc)
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if hasattr(obj, "updated_at") and getattr(obj, "updated_at", None) is None:
                obj.updated_at = now

    async def execute(self, _statement):
        if not self.responses:
            raise AssertionError("unexpected execute() call")
        return self.responses.pop(0)


class DummyScalarResult:
    def __init__(self, values=None):
        self._values = list(values or [])

    def scalar_one_or_none(self):
        return self._values[0] if self._values else None

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class FakeAgentManager:
    def __init__(self, root: Path):
        self.root = root
        self.initialized_agents: list[uuid.UUID] = []
        self.started_agents: list[uuid.UUID] = []

    def _agent_dir(self, agent_id: uuid.UUID) -> Path:
        return self.root / str(agent_id)

    async def initialize_agent_files(self, db, agent, personality: str = "", boundaries: str = ""):
        self.initialized_agents.append(agent.id)
        agent_dir = self._agent_dir(agent.id)
        (agent_dir / "workspace").mkdir(parents=True, exist_ok=True)
        (agent_dir / "memory").mkdir(exist_ok=True)
        (agent_dir / "skills").mkdir(exist_ok=True)
        (agent_dir / "soul.md").write_text(f"# Soul\n\n{agent.name}\n", encoding="utf-8")

    async def start_container(self, db, agent):
        self.started_agents.append(agent.id)
        agent.status = "idle"
        agent.last_active_at = datetime.now(timezone.utc)
        return "fake-container"


def _ready_plan():
    return {
        "scenario_id": "cn-team-global-content-knowledge",
        "scenario_name_zh": "中文团队做出海内容 / 知识付费业务",
        "locale": "zh-CN",
        "plan_status": "ready_for_deploy_prep",
        "company_blueprint": {
            "company_name": "Solo Growth Studio",
        },
        "founder_copilot": {
            "canonical_name": "Founder Copilot",
            "display_name_zh": "创业导师",
            "role_level": "lead",
            "role_type": "strategy",
            "primary_goal": "拆解目标并统筹节奏",
            "template_key": "founder-copilot",
        },
        "teams": [
            {
                "team_id": "content-growth",
                "team_name_zh": "内容增长组",
                "team_goal": "产出内容并做全球分发",
                "priority": 1,
                "roles": [
                    {
                        "canonical_name": "Content Strategy Lead",
                        "display_name_zh": "内容策略负责人",
                        "role_level": "lead",
                        "role_type": "content",
                        "primary_goal": "规划内容选题与产出节奏",
                        "template_key": "content-strategy-lead",
                    },
                    {
                        "canonical_name": "Global Distribution Lead",
                        "display_name_zh": "全球分发负责人",
                        "role_level": "lead",
                        "role_type": "distribution",
                        "primary_goal": "多渠道分发内容并跟踪反馈",
                        "template_key": "global-distribution-lead",
                    },
                ],
            }
        ],
        "template_recommendations": [],
        "skill_pack_recommendations": [],
        "coordination_relationships": [],
        "approval_boundaries": ["价格与正式承诺需要人工确认"],
        "open_questions": [],
        "deployment_readiness": {
            "can_enter_deploy_prep": True,
            "blocker_reason_zh": "",
            "missing_items": [],
            "resolved_template_keys": [
                "founder-copilot",
                "content-strategy-lead",
                "global-distribution-lead",
            ],
            "resolved_pack_ids": [],
        },
        "traceability": [],
        "previous_plan_summary_zh": "",
        "change_summary_zh": [],
        "changed_template_keys": [],
        "changed_pack_ids": [],
    }


@pytest.mark.asyncio
async def test_materialize_founder_workspace_creates_multiple_agents_and_returns_ids(
    monkeypatch,
    tmp_path,
):
    import app.services.founder_company_materializer as founder_company_materializer

    db = RecordingDB(
        responses=[
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=uuid.uuid4(),
                        name="Founder Copilot",
                        default_skills=[],
                        default_autonomy_policy={"read_files": "L1"},
                    )
                ]
            ),
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=uuid.uuid4(),
                        name="Content Strategy Lead",
                        default_skills=[],
                        default_autonomy_policy={"read_files": "L1"},
                    )
                ]
            ),
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=uuid.uuid4(),
                        name="Global Distribution Lead",
                        default_skills=[],
                        default_autonomy_policy={"read_files": "L1"},
                    )
                ]
            ),
        ]
    )
    fake_agent_manager = FakeAgentManager(tmp_path)
    monkeypatch.setattr(founder_company_materializer, "agent_manager", fake_agent_manager)

    workspace = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        name="Solo Growth Studio",
        business_brief="做出海创作者咨询与训练营业务",
        business_logic={"offer": "咨询 + 训练营"},
        current_state="approved",
        materialization_status="not_started",
        latest_plan_json=_ready_plan(),
    )
    current_user = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=workspace.tenant_id,
    )
    result = await materialize_founder_workspace(
        workspace=workspace,
        current_user=current_user,
        db=db,
    )

    assert result["workspace_id"] == workspace.id
    assert result["current_state"] == "materialized"
    assert result["materialization_status"] == "completed"
    assert len(result["created_agents"]) == 3
    assert {item["name"] for item in result["created_agents"]} == {
        "Founder Copilot",
        "Content Strategy Lead",
        "Global Distribution Lead",
    }
    assert len(result["agent_id_by_name"]) == 3
    assert workspace.current_state == "materialized"
    assert workspace.materialization_status == "completed"


@pytest.mark.asyncio
async def test_materialize_founder_workspace_provisions_templates_model_skills_and_runtime_scaffold(
    monkeypatch,
    tmp_path,
):
    import app.services.founder_company_materializer as founder_company_materializer

    founder_template_id = uuid.uuid4()
    content_template_id = uuid.uuid4()
    distribution_template_id = uuid.uuid4()
    primary_model_id = uuid.uuid4()

    founder_skill = SimpleNamespace(
        id=uuid.uuid4(),
        folder_name="web-research",
        files=[SimpleNamespace(path="SKILL.md", content="# Founder research\n")],
    )
    content_skill = SimpleNamespace(
        id=uuid.uuid4(),
        folder_name="content-writing",
        files=[SimpleNamespace(path="SKILL.md", content="# Content writing\n")],
    )
    analytics_skill = SimpleNamespace(
        id=uuid.uuid4(),
        folder_name="data-analysis",
        files=[SimpleNamespace(path="SKILL.md", content="# Analytics\n")],
    )

    db = RecordingDB(
        responses=[
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=primary_model_id,
                        tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000123"),
                        provider="openai-compatible",
                        model="gpt-4.1-mini",
                        base_url="https://example.com/v1",
                        enabled=True,
                    )
                ]
            ),
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=founder_template_id,
                        name="Founder Copilot",
                        default_skills=["web-research", "data-analysis"],
                        default_autonomy_policy={"read_files": "L1", "write_workspace_files": "L1"},
                    )
                ]
            ),
            DummyScalarResult([founder_skill, analytics_skill]),
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=content_template_id,
                        name="Content Strategy Lead",
                        default_skills=["content-writing"],
                        default_autonomy_policy={"read_files": "L1", "write_workspace_files": "L1"},
                    )
                ]
            ),
            DummyScalarResult([content_skill, analytics_skill]),
            DummyScalarResult(
                [
                    SimpleNamespace(
                        id=distribution_template_id,
                        name="Global Distribution Lead",
                        default_skills=["content-writing"],
                        default_autonomy_policy={"read_files": "L1", "write_workspace_files": "L1"},
                    )
                ]
            ),
            DummyScalarResult([content_skill, analytics_skill]),
        ]
    )
    fake_agent_manager = FakeAgentManager(tmp_path)
    monkeypatch.setattr(founder_company_materializer, "agent_manager", fake_agent_manager)

    workspace = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.UUID("00000000-0000-0000-0000-000000000123"),
        name="Solo Growth Studio",
        business_brief="Build a solo growth business for overseas Chinese creators.",
        business_logic={
            "_founder_runtime": {
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                }
            }
        },
        current_state="approved",
        materialization_status="not_started",
        latest_plan_json=_ready_plan(),
    )
    current_user = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=workspace.tenant_id,
    )

    result = await materialize_founder_workspace(
        workspace=workspace,
        current_user=current_user,
        db=db,
    )

    agent_records = [item for item in db.added if item.__class__.__name__ == "Agent"]
    permission_records = [item for item in db.added if item.__class__.__name__ == "AgentPermission"]
    participant_records = [item for item in db.added if item.__class__.__name__ == "Participant"]

    assert len(agent_records) == 3
    assert len(permission_records) == 3
    assert len(participant_records) == 3
    assert len(fake_agent_manager.initialized_agents) == 3
    assert len(fake_agent_manager.started_agents) == 3
    assert {item["template_key"] for item in result["created_agents"]} == {
        "founder-copilot",
        "content-strategy-lead",
        "global-distribution-lead",
    }

    agent_ids = {agent.id for agent in agent_records}
    assert {participant.ref_id for participant in participant_records} == agent_ids
    assert {permission.agent_id for permission in permission_records} == agent_ids
    assert all(permission.scope_type == "company" for permission in permission_records)
    assert all(permission.access_level == "use" for permission in permission_records)
    assert all(agent.primary_model_id == primary_model_id for agent in agent_records)
    assert {agent.template_id for agent in agent_records} == {
        founder_template_id,
        content_template_id,
        distribution_template_id,
    }

    founder_agent = next(agent for agent in agent_records if agent.name == "Founder Copilot")
    founder_skill_path = fake_agent_manager._agent_dir(founder_agent.id) / "skills" / "web-research" / "SKILL.md"
    analytics_skill_path = fake_agent_manager._agent_dir(founder_agent.id) / "skills" / "data-analysis" / "SKILL.md"
    assert founder_skill_path.read_text(encoding="utf-8") == "# Founder research\n"
    assert analytics_skill_path.read_text(encoding="utf-8") == "# Analytics\n"
