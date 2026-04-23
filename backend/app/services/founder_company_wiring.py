from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

import app.models.agent  # noqa: F401
from app.models.org import AgentAgentRelationship
from app.models.trigger import AgentTrigger
from app.schemas.founder_mainline import FounderMainlineDraftPlan


def _map_relationship_type(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"supervisor", "direct_leader", "manager"}:
        return "supervisor"
    if normalized in {"assistant", "delegate"}:
        return "assistant"
    if normalized in {"peer"}:
        return "peer"
    return "collaborator"


async def wire_founder_company(
    *,
    plan: FounderMainlineDraftPlan,
    created_agents_by_name: dict[str, object],
    db: AsyncSession,
):
    """Wire the generated company with agent relationships and starter triggers."""
    relationship_count = 0
    for relationship in plan.coordination_relationships:
        source_agent_id = created_agents_by_name.get(relationship.from_role)
        target_agent_id = created_agents_by_name.get(relationship.to_role)
        if not source_agent_id or not target_agent_id or source_agent_id == target_agent_id:
            continue

        description_parts = [relationship.handoff_rule_zh.strip(), relationship.escalation_rule_zh.strip()]
        db.add(
            AgentAgentRelationship(
                agent_id=source_agent_id,
                target_agent_id=target_agent_id,
                relation=_map_relationship_type(relationship.relationship_type),
                description="；".join(part for part in description_parts if part),
            )
        )
        relationship_count += 1

    trigger_count = 0
    for agent_name, agent_id in created_agents_by_name.items():
        db.add(
            AgentTrigger(
                agent_id=agent_id,
                name=f"{agent_name} starter cadence"[:100],
                type="interval",
                config={"minutes": 1440},
                reason=f"Founder starter cadence for {agent_name}",
                cooldown_seconds=300,
            )
        )
        trigger_count += 1

    await db.flush()

    return {
        "relationship_count": relationship_count,
        "trigger_count": trigger_count,
    }
