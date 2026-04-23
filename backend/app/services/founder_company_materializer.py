from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.founder_workspace import FounderWorkspace
from app.schemas.founder_mainline import FounderMainlineDraftPlan, FounderMainlineRolePlan


def _iter_unique_roles(plan: FounderMainlineDraftPlan) -> list[FounderMainlineRolePlan]:
    ordered_roles: list[FounderMainlineRolePlan] = [plan.founder_copilot]
    for team in plan.teams:
        ordered_roles.extend(team.roles)

    deduped: list[FounderMainlineRolePlan] = []
    seen: set[str] = set()
    for role in ordered_roles:
        key = role.canonical_name.strip()
        if not key or key in seen:
            continue
        deduped.append(role)
        seen.add(key)
    return deduped


def _build_agent_description(workspace: FounderWorkspace, role: FounderMainlineRolePlan) -> str:
    parts = [role.primary_goal.strip(), role.reason_zh.strip(), workspace.business_brief.strip()]
    description = " ".join(part for part in parts if part).strip()
    return description[:500]


async def materialize_founder_workspace(
    *,
    workspace: FounderWorkspace,
    current_user,
    db: AsyncSession,
):
    """Convert a ready founder workspace plan into real agent records."""
    plan = FounderMainlineDraftPlan.model_validate(workspace.latest_plan_json or {})
    if plan.plan_status != "ready_for_deploy_prep":
        raise ValueError("founder workspace plan is not ready for materialization")

    created_pairs: list[tuple[FounderMainlineRolePlan, Agent]] = []
    for role in _iter_unique_roles(plan):
        agent = Agent(
            name=role.canonical_name[:100],
            role_description=_build_agent_description(workspace, role),
            creator_id=current_user.id,
            tenant_id=workspace.tenant_id or getattr(current_user, "tenant_id", None),
            agent_type="native",
            status="idle",
        )
        db.add(agent)
        created_pairs.append((role, agent))

    await db.flush()

    created_agents = []
    agent_id_by_name = {}
    for role, agent in created_pairs:
        agent_id_by_name[role.canonical_name] = agent.id
        created_agents.append(
            {
                "id": agent.id,
                "name": role.canonical_name,
                "canonical_name": role.canonical_name,
                "template_key": role.template_key,
            }
        )

    workspace.current_state = "materialized"
    workspace.materialization_status = "completed"

    return {
        "workspace_id": workspace.id,
        "current_state": workspace.current_state,
        "materialization_status": workspace.materialization_status,
        "created_agents": created_agents,
        "agent_id_by_name": agent_id_by_name,
        "plan": plan,
    }
