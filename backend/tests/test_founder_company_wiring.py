import uuid
from datetime import datetime, timezone

import pytest

from app.schemas.founder_mainline import FounderMainlineDraftPlan
from app.services.founder_company_wiring import wire_founder_company


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


@pytest.mark.asyncio
async def test_wire_founder_company_creates_relationships_and_triggers():
    created_agents = {
        "Founder Copilot": uuid.uuid4(),
        "Content Strategy Lead": uuid.uuid4(),
        "Global Distribution Lead": uuid.uuid4(),
    }
    plan = FounderMainlineDraftPlan.model_validate(
        {
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
            },
            "teams": [
                {
                    "team_id": "content-growth",
                    "team_name_zh": "内容增长组",
                    "team_goal": "做内容增长",
                    "priority": 1,
                    "roles": [
                        {
                            "canonical_name": "Content Strategy Lead",
                            "display_name_zh": "内容策略负责人",
                            "role_level": "lead",
                            "role_type": "content",
                            "primary_goal": "规划内容",
                            "template_key": "content-strategy-lead",
                        },
                        {
                            "canonical_name": "Global Distribution Lead",
                            "display_name_zh": "全球分发负责人",
                            "role_level": "lead",
                            "role_type": "distribution",
                            "primary_goal": "分发内容",
                            "template_key": "global-distribution-lead",
                        },
                    ],
                }
            ],
            "template_recommendations": [],
            "skill_pack_recommendations": [],
            "coordination_relationships": [
                {
                    "from_role": "Founder Copilot",
                    "to_role": "Content Strategy Lead",
                    "relationship_type": "supervisor",
                    "handoff_rule_zh": "Founder 负责拆解月目标，内容负责人承接周计划。",
                    "escalation_rule_zh": "如周计划偏航，回到 Founder 调整。",
                },
                {
                    "from_role": "Content Strategy Lead",
                    "to_role": "Global Distribution Lead",
                    "relationship_type": "collaborator",
                    "handoff_rule_zh": "内容完成后交给分发负责人做多渠道改写。",
                    "escalation_rule_zh": "若渠道反馈差，回到内容负责人重做。",
                },
            ],
            "approval_boundaries": ["价格与正式承诺需要人工确认"],
            "open_questions": [],
            "deployment_readiness": {
                "can_enter_deploy_prep": True,
                "blocker_reason_zh": "",
                "missing_items": [],
                "resolved_template_keys": [],
                "resolved_pack_ids": [],
            },
            "traceability": [],
            "previous_plan_summary_zh": "",
            "change_summary_zh": [],
            "changed_template_keys": [],
            "changed_pack_ids": [],
        }
    )
    db = RecordingDB()

    result = await wire_founder_company(
        plan=plan,
        created_agents_by_name=created_agents,
        db=db,
    )

    relationship_records = [item for item in db.added if item.__class__.__name__ == "AgentAgentRelationship"]
    trigger_records = [item for item in db.added if item.__class__.__name__ == "AgentTrigger"]

    assert result["relationship_count"] == 2
    assert result["trigger_count"] == 3
    assert len(relationship_records) == 2
    assert len(trigger_records) == 3
    assert {item.relation for item in relationship_records} == {"supervisor", "collaborator"}

    trigger_by_agent_id = {item.agent_id: item for item in trigger_records}
    founder_trigger = trigger_by_agent_id[created_agents["Founder Copilot"]]
    content_trigger = trigger_by_agent_id[created_agents["Content Strategy Lead"]]
    distribution_trigger = trigger_by_agent_id[created_agents["Global Distribution Lead"]]

    assert founder_trigger.type == "cron"
    assert founder_trigger.config == {"expr": "0 9 * * 1-5"}
    assert founder_trigger.cooldown_seconds == 1800

    assert content_trigger.type == "cron"
    assert content_trigger.config == {"expr": "0 10 * * 1-5"}
    assert content_trigger.cooldown_seconds == 1800

    assert distribution_trigger.type == "cron"
    assert distribution_trigger.config == {"expr": "0 14 * * 1-5"}
    assert distribution_trigger.cooldown_seconds == 1800
