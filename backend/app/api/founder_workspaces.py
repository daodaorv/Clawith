"""Founder workspace API routes."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.founder_workspace import FounderWorkspace
from app.models.user import User
from app.schemas.founder_workspace import (
    FounderWorkspaceCreate,
    FounderWorkspaceMaterializationOut,
    FounderWorkspaceOut,
)
from app.services.founder_company_materializer import materialize_founder_workspace
from app.services.founder_company_wiring import wire_founder_company
from app.services.founder_mainline_service import (
    build_founder_mainline_interview_progress,
    generate_founder_mainline_draft_plan,
)
from app.schemas.founder_mainline import (
    FounderMainlineDraftPlanRequest,
    FounderMainlineInterviewProgressRequest,
)

router = APIRouter(prefix="/founder-workspaces", tags=["founder_workspaces"])
_FOUNDER_RUNTIME_KEY = "_founder_runtime"


def _get_founder_runtime(workspace: FounderWorkspace) -> tuple[dict[str, Any], dict[str, Any]]:
    business_logic = dict(workspace.business_logic or {})
    runtime = business_logic.get(_FOUNDER_RUNTIME_KEY)
    if not isinstance(runtime, dict):
        runtime = {}
    return business_logic, dict(runtime)


def _build_planning_context(workspace: FounderWorkspace) -> dict[str, Any]:
    latest_plan = workspace.latest_plan_json or {}
    _, runtime = _get_founder_runtime(workspace)
    model_ready_context = runtime.get("model_ready_context")
    if not isinstance(model_ready_context, dict):
        model_ready_context = latest_plan.get("model_ready_context") or {}
    answers = runtime.get("answers")
    if not isinstance(answers, list):
        answers = []
    correction_notes = runtime.get("correction_notes")
    if correction_notes is not None and not isinstance(correction_notes, str):
        correction_notes = str(correction_notes)
    return {
        "business_brief": runtime.get("business_brief") or workspace.business_brief,
        "locale": runtime.get("locale") or "zh-CN",
        "scenario_id": runtime.get("scenario_id"),
        "model_ready_context": model_ready_context,
        "answers": answers,
        "correction_notes": correction_notes,
        "user_confirmed": bool(runtime.get("user_confirmed", False)),
    }


def _update_founder_runtime(workspace: FounderWorkspace, **updates: Any) -> dict[str, Any]:
    business_logic, runtime = _get_founder_runtime(workspace)
    for key, value in updates.items():
        if value is not None:
            runtime[key] = value
    business_logic[_FOUNDER_RUNTIME_KEY] = runtime
    workspace.business_logic = business_logic
    return runtime


def _build_dashboard_snapshot(
    *,
    materialization: dict[str, Any],
    relationship_count: int,
    trigger_count: int,
) -> dict[str, Any]:
    created_agents = []
    for item in materialization.get("created_agents", []):
        created_agents.append(
            {
                "id": str(item["id"]),
                "name": item["name"],
                "canonical_name": item["canonical_name"],
                "template_key": item["template_key"],
            }
        )
    return {
        "workspace_id": str(materialization["workspace_id"]),
        "current_state": materialization["current_state"],
        "materialization_status": materialization["materialization_status"],
        "created_agents": created_agents,
        "relationship_count": relationship_count,
        "trigger_count": trigger_count,
    }


async def _get_owned_workspace(
    *,
    workspace_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> FounderWorkspace:
    result = await db.execute(
        select(FounderWorkspace).where(
            FounderWorkspace.id == workspace_id,
            FounderWorkspace.owner_user_id == uuid.UUID(str(current_user.id)),
        )
    )
    if hasattr(result, "scalar_one_or_none"):
        workspace = result.scalar_one_or_none()
    else:
        values = result.scalars().all()
        workspace = values[0] if values else None
    if workspace is None:
        raise HTTPException(status_code=404, detail="Founder workspace not found")
    return workspace


def _serialize_founder_workspace(workspace: FounderWorkspace) -> FounderWorkspaceOut:
    _, runtime = _get_founder_runtime(workspace)
    draft_plan = runtime.get("draft_plan")
    if not isinstance(draft_plan, dict):
        draft_plan = None
    dashboard_snapshot = runtime.get("dashboard_snapshot")
    if not isinstance(dashboard_snapshot, dict):
        dashboard_snapshot = {}
    return FounderWorkspaceOut(
        id=workspace.id,
        tenant_id=workspace.tenant_id,
        owner_user_id=workspace.owner_user_id,
        name=workspace.name,
        business_brief=workspace.business_brief,
        business_logic=workspace.business_logic or {},
        current_state=workspace.current_state,
        materialization_status=workspace.materialization_status,
        latest_plan=workspace.latest_plan_json or {},
        planning_context=_build_planning_context(workspace),
        draft_plan=draft_plan,
        dashboard_snapshot=dashboard_snapshot,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


async def _flush_refresh_and_serialize_founder_workspace(
    workspace: FounderWorkspace,
    db: AsyncSession,
) -> FounderWorkspaceOut:
    """Persist workspace changes and reload server-managed fields before serializing."""
    await db.flush()
    await db.refresh(workspace)
    return _serialize_founder_workspace(workspace)


@router.get("", response_model=list[FounderWorkspaceOut])
async def list_founder_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List founder workspaces owned by the current user."""
    result = await db.execute(
        select(FounderWorkspace)
        .where(FounderWorkspace.owner_user_id == uuid.UUID(str(current_user.id)))
        .order_by(FounderWorkspace.updated_at.desc())
    )
    workspaces = result.scalars().all()
    return [_serialize_founder_workspace(item) for item in workspaces]


@router.post("", response_model=FounderWorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_founder_workspace(
    payload: FounderWorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create the minimal persisted founder workspace shell."""
    initial_plan = build_founder_mainline_interview_progress(
        payload.business_brief,
        model_ready_context={},
        answers=[],
    )
    workspace = FounderWorkspace(
        tenant_id=current_user.tenant_id,
        owner_user_id=current_user.id,
        name=payload.name.strip(),
        business_brief=payload.business_brief.strip(),
        business_logic=payload.business_logic or {},
        current_state="intake",
        materialization_status="not_started",
        latest_plan_json=initial_plan.model_dump(mode="python"),
    )
    db.add(workspace)
    return await _flush_refresh_and_serialize_founder_workspace(workspace, db)


@router.post("/{workspace_id}/materialize", response_model=FounderWorkspaceMaterializationOut)
async def materialize_founder_workspace_endpoint(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Materialize a ready founder workspace into agents, relationships, and starter triggers."""
    workspace = await _get_owned_workspace(
        workspace_id=workspace_id,
        current_user=current_user,
        db=db,
    )

    try:
        materialization = await materialize_founder_workspace(
            workspace=workspace,
            current_user=current_user,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    wiring = await wire_founder_company(
        plan=materialization["plan"],
        created_agents_by_name=materialization["agent_id_by_name"],
        db=db,
    )
    dashboard_snapshot = _build_dashboard_snapshot(
        materialization=materialization,
        relationship_count=wiring["relationship_count"],
        trigger_count=wiring["trigger_count"],
    )
    _update_founder_runtime(workspace, dashboard_snapshot=dashboard_snapshot)
    await db.flush()

    return FounderWorkspaceMaterializationOut(
        workspace_id=materialization["workspace_id"],
        current_state=materialization["current_state"],
        materialization_status=materialization["materialization_status"],
        created_agents=materialization["created_agents"],
        relationship_count=wiring["relationship_count"],
        trigger_count=wiring["trigger_count"],
        dashboard_snapshot=dashboard_snapshot,
    )


@router.post("/{workspace_id}/planning/interview-progress", response_model=FounderWorkspaceOut)
async def save_founder_workspace_interview_progress(
    workspace_id: uuid.UUID,
    payload: FounderMainlineInterviewProgressRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist founder planning interview progress onto the workspace runtime state."""
    workspace = await _get_owned_workspace(
        workspace_id=workspace_id,
        current_user=current_user,
        db=db,
    )

    progress = build_founder_mainline_interview_progress(
        payload.business_brief,
        model_ready_context=payload.model_ready_context,
        answers=payload.answers,
    )
    progress_payload = progress.model_dump(mode="python")
    _update_founder_runtime(
        workspace,
        business_brief=payload.business_brief.strip(),
        locale=payload.locale,
        scenario_id=payload.scenario_id,
        model_ready_context=payload.model_ready_context.model_dump(mode="python"),
        answers=[item.model_dump(mode="python") for item in payload.answers],
    )
    workspace.business_brief = payload.business_brief.strip()
    workspace.latest_plan_json = progress_payload
    if progress.plan_status != "step0_blocked":
        workspace.current_state = "planning"
    return await _flush_refresh_and_serialize_founder_workspace(workspace, db)


@router.post("/{workspace_id}/planning/draft-plan", response_model=FounderWorkspaceOut)
async def generate_founder_workspace_draft_plan(
    workspace_id: uuid.UUID,
    payload: FounderMainlineDraftPlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and persist the latest founder workspace draft plan."""
    workspace = await _get_owned_workspace(
        workspace_id=workspace_id,
        current_user=current_user,
        db=db,
    )

    progress = build_founder_mainline_interview_progress(
        payload.business_brief,
        model_ready_context=payload.model_ready_context,
        answers=payload.answers,
    )
    if progress.plan_status != "ready_for_plan":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "创业导师主链尚未达到生成草案的条件，请先补齐关键信息。",
                "plan_status": progress.plan_status,
                "missing_groups": progress.missing_groups,
                "next_questions": [item.model_dump() for item in progress.next_questions],
            },
        )

    plan = generate_founder_mainline_draft_plan(
        payload.business_brief,
        locale=payload.locale,
        scenario_id=payload.scenario_id,
        model_ready_context=payload.model_ready_context,
        answers=payload.answers,
        correction_notes=payload.correction_notes,
        user_confirmed=payload.user_confirmed,
    )
    plan_payload = plan.model_dump(mode="python")
    _update_founder_runtime(
        workspace,
        business_brief=payload.business_brief.strip(),
        locale=payload.locale,
        scenario_id=payload.scenario_id,
        model_ready_context=(payload.model_ready_context.model_dump(mode="python") if payload.model_ready_context else {}),
        answers=[item.model_dump(mode="python") for item in payload.answers],
        correction_notes=payload.correction_notes,
        user_confirmed=payload.user_confirmed,
        draft_plan=plan_payload,
    )
    workspace.business_brief = payload.business_brief.strip()
    workspace.latest_plan_json = plan_payload
    workspace.current_state = "review"
    return await _flush_refresh_and_serialize_founder_workspace(workspace, db)
