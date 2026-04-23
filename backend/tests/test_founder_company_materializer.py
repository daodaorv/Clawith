import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.founder_company_materializer import materialize_founder_workspace


class RecordingDB:
    def __init__(self):
        self.added = []

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
async def test_materialize_founder_workspace_creates_multiple_agents_and_returns_ids():
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
    db = RecordingDB()

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
