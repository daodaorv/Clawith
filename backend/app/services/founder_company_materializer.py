from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.duoduo.skill_packs import get_pack_skill_slugs
from app.models.agent import Agent, AgentPermission, AgentTemplate
from app.models.founder_workspace import FounderWorkspace
from app.models.llm import LLMModel
from app.models.participant import Participant
from app.models.skill import Skill
from app.schemas.founder_mainline import FounderMainlineDraftPlan, FounderMainlineRolePlan
from app.services.agent_manager import agent_manager

_FOUNDER_RUNTIME_KEY = "_founder_runtime"


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


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in values:
        normalized = (item or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def _normalize_base_url(value: str | None) -> str | None:
    normalized = (value or "").strip()
    return normalized or None


def _get_workspace_model_context(workspace: FounderWorkspace) -> dict[str, str]:
    business_logic = getattr(workspace, "business_logic", {}) or {}
    if not isinstance(business_logic, dict):
        return {}
    runtime = business_logic.get(_FOUNDER_RUNTIME_KEY)
    if not isinstance(runtime, dict):
        return {}
    model_context = runtime.get("model_ready_context")
    return model_context if isinstance(model_context, dict) else {}


async def _resolve_workspace_primary_model_id(
    db: AsyncSession,
    workspace: FounderWorkspace,
) -> object | None:
    model_context = _get_workspace_model_context(workspace)
    provider = (model_context.get("resolved_provider") or "").strip()
    model_name = (model_context.get("recommended_model") or "").strip()
    if not provider or not model_name:
        return None

    target_base_url = _normalize_base_url(model_context.get("normalized_base_url"))
    result = await db.execute(
        select(LLMModel).where(
            LLMModel.provider == provider,
            LLMModel.model == model_name,
            LLMModel.enabled.is_(True),
        )
    )
    candidates = result.scalars().all()
    if not candidates:
        raise ValueError("founder workspace selected model is no longer available")

    def sort_key(item: object) -> tuple[int, int, int]:
        same_tenant = int(getattr(item, "tenant_id", None) == getattr(workspace, "tenant_id", None))
        same_base_url = int(_normalize_base_url(getattr(item, "base_url", None)) == target_base_url)
        global_model = int(getattr(item, "tenant_id", None) is None)
        return (same_tenant, same_base_url, global_model)

    return max(candidates, key=sort_key).id


async def _resolve_role_template(
    db: AsyncSession,
    role: FounderMainlineRolePlan,
) -> object:
    result = await db.execute(
        select(AgentTemplate).where(
            AgentTemplate.name == role.canonical_name,
            AgentTemplate.is_builtin.is_(True),
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise ValueError(f"missing founder builtin template: {role.canonical_name}")
    return template


def _build_role_skill_slugs(template: object, role: FounderMainlineRolePlan) -> list[str]:
    template_skills = list(getattr(template, "default_skills", []) or [])
    pack_skills = get_pack_skill_slugs(list(role.recommended_skill_packs or []))
    return _dedupe_keep_order([*template_skills, *pack_skills])


async def _resolve_role_skills(
    db: AsyncSession,
    skill_slugs: list[str],
) -> list[object]:
    if not skill_slugs:
        return []

    result = await db.execute(
        select(Skill)
        .where(Skill.folder_name.in_(skill_slugs))
        .options(selectinload(Skill.files))
    )
    skills = result.scalars().all()
    skill_by_slug = {
        getattr(skill, "folder_name", ""): skill
        for skill in skills
        if getattr(skill, "folder_name", "")
    }
    return [skill_by_slug[slug] for slug in skill_slugs if slug in skill_by_slug]


def _copy_skills_to_agent_workspace(agent_id: object, skills: list[object]) -> None:
    if not skills:
        return

    skills_dir = Path(agent_manager._agent_dir(agent_id)) / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)

    for skill in skills:
        folder_name = getattr(skill, "folder_name", "").strip()
        if not folder_name:
            continue
        skill_dir = skills_dir / folder_name
        skill_dir.mkdir(parents=True, exist_ok=True)
        for skill_file in list(getattr(skill, "files", []) or []):
            file_path = skill_dir / getattr(skill_file, "path", "SKILL.md")
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(getattr(skill_file, "content", ""), encoding="utf-8")


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

    primary_model_id = await _resolve_workspace_primary_model_id(db, workspace)
    created_pairs: list[tuple[FounderMainlineRolePlan, Agent]] = []
    for role in _iter_unique_roles(plan):
        template = await _resolve_role_template(db, role)
        agent = Agent(
            name=role.canonical_name[:100],
            role_description=_build_agent_description(workspace, role),
            creator_id=current_user.id,
            tenant_id=workspace.tenant_id or getattr(current_user, "tenant_id", None),
            agent_type="native",
            status="creating",
            primary_model_id=primary_model_id,
            template_id=getattr(template, "id", None),
        )
        template_policy = dict(getattr(template, "default_autonomy_policy", {}) or {})
        if template_policy:
            agent.autonomy_policy = template_policy
        db.add(agent)
        await db.flush()

        db.add(
            Participant(
                type="agent",
                ref_id=agent.id,
                display_name=agent.name,
                avatar_url=agent.avatar_url,
            )
        )
        db.add(
            AgentPermission(
                agent_id=agent.id,
                scope_type="company",
                access_level="use",
            )
        )
        await db.flush()

        await agent_manager.initialize_agent_files(db, agent)
        role_skills = await _resolve_role_skills(db, _build_role_skill_slugs(template, role))
        _copy_skills_to_agent_workspace(agent.id, role_skills)
        await agent_manager.start_container(db, agent)
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
