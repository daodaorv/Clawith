from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.founder_workspace import FounderWorkspace
from app.models.llm import LLMModel
from app.models.tenant import Tenant
from app.models.user import Identity, User
from app.services.agent_manager import agent_manager

SELF_BOOTSTRAP_EMAIL_PREFIX = "founder-e2e-"
SELF_BOOTSTRAP_EMAIL_SUFFIX = "@example.com"
SELF_BOOTSTRAP_COMPANY_PREFIX = "Founder E2E Company "
SELF_BOOTSTRAP_MODEL_LABEL = "Dummy Founder Self-Bootstrap Model"

_TENANT_SCOPED_SQL = [
    "DELETE FROM invitation_codes WHERE tenant_id = :tenant_id",
    "DELETE FROM org_members WHERE tenant_id = :tenant_id",
    "DELETE FROM org_departments WHERE tenant_id = :tenant_id",
    "DELETE FROM enterprise_info WHERE tenant_id = :tenant_id",
    "DELETE FROM published_pages WHERE tenant_id = :tenant_id",
    "DELETE FROM skills WHERE tenant_id = :tenant_id",
    "DELETE FROM daily_token_usage WHERE tenant_id = :tenant_id",
]

_USER_SCOPED_SQL = [
    "DELETE FROM agent_schedules WHERE created_by = :user_id",
    "DELETE FROM agent_templates WHERE created_by = :user_id",
    "UPDATE approval_requests SET resolved_by = NULL WHERE resolved_by = :user_id",
    "DELETE FROM audit_logs WHERE user_id = :user_id",
    "DELETE FROM chat_messages WHERE user_id = :user_id",
    "DELETE FROM chat_sessions WHERE user_id = :user_id",
    "UPDATE enterprise_info SET updated_by = NULL WHERE updated_by = :user_id",
    "DELETE FROM gateway_messages WHERE sender_user_id = :user_id",
    "DELETE FROM notifications WHERE user_id = :user_id",
    "DELETE FROM published_pages WHERE user_id = :user_id",
    "DELETE FROM task_logs WHERE task_id IN (SELECT id FROM tasks WHERE created_by = :user_id OR supervision_target_user_id = :user_id)",
    "DELETE FROM tasks WHERE created_by = :user_id OR supervision_target_user_id = :user_id",
    "DELETE FROM participants WHERE type = 'user' AND ref_id = :user_id",
]


@dataclass(frozen=True)
class FounderSelfBootstrapCleanupTargets:
    tenant: Tenant | None
    identities: list[Identity]
    users: list[User]
    workspaces: list[FounderWorkspace]
    agents: list[Agent]
    llm_models: list[LLMModel]


def is_self_bootstrap_identity_email(email: str | None) -> bool:
    normalized = (email or "").strip().lower()
    return normalized.startswith(SELF_BOOTSTRAP_EMAIL_PREFIX) and normalized.endswith(SELF_BOOTSTRAP_EMAIL_SUFFIX)


def is_self_bootstrap_tenant_name(name: str | None) -> bool:
    normalized = (name or "").strip()
    return normalized.startswith(SELF_BOOTSTRAP_COMPANY_PREFIX)


def build_founder_self_bootstrap_cleanup_summary(
    targets: FounderSelfBootstrapCleanupTargets,
) -> dict[str, Any]:
    identity_emails = sorted(
        {
            str(getattr(identity, "email", "")).strip()
            for identity in targets.identities
            if getattr(identity, "email", None)
        }
    )
    return {
        "tenant_name": getattr(targets.tenant, "name", None),
        "tenant_slug": getattr(targets.tenant, "slug", None),
        "identity_emails": identity_emails,
        "identity_count": len(targets.identities),
        "user_count": len(targets.users),
        "founder_workspace_count": len(targets.workspaces),
        "founder_workspace_names": [
            str(getattr(workspace, "name", "")).strip()
            for workspace in targets.workspaces
            if getattr(workspace, "name", None)
        ],
        "agent_count": len(targets.agents),
        "agent_names": [
            str(getattr(agent, "name", "")).strip()
            for agent in targets.agents
            if getattr(agent, "name", None)
        ],
        "llm_model_count": len(targets.llm_models),
        "llm_model_labels": [
            str(getattr(model, "label", "")).strip()
            for model in targets.llm_models
            if getattr(model, "label", None)
        ],
    }


def is_self_bootstrap_cleanup_target(targets: FounderSelfBootstrapCleanupTargets) -> bool:
    return bool(
        (targets.tenant is not None and is_self_bootstrap_tenant_name(getattr(targets.tenant, "name", None)))
        or any(is_self_bootstrap_identity_email(getattr(identity, "email", None)) for identity in targets.identities)
    )


async def _delete_agent_record(db: AsyncSession, agent: Agent, *, reason: str) -> None:
    archive_dir: Path | None = None
    try:
        await agent_manager.remove_container(agent)
    except Exception as exc:  # pragma: no cover - best effort cleanup
        logger.warning(f"Failed to remove container for agent {agent.name}: {exc}")

    try:
        archive_dir = await agent_manager.archive_agent_files(agent.id)
    except Exception as exc:  # pragma: no cover - best effort cleanup
        logger.warning(f"Failed to archive files for agent {agent.name}: {exc}")

    if archive_dir is not None:
        try:
            (archive_dir / "reset-metadata.json").write_text(
                json.dumps(
                    {
                        "agent_id": str(agent.id),
                        "agent_name": agent.name,
                        "tenant_id": str(agent.tenant_id) if agent.tenant_id else None,
                        "reason": reason,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception as exc:  # pragma: no cover - best effort cleanup
            logger.warning(f"Failed to write reset metadata for agent {agent.name}: {exc}")

    cleanup_tables = [
        "agent_activity_logs",
        "audit_logs",
        "approval_requests",
        "chat_messages",
        "chat_sessions",
        "agent_schedules",
        "agent_triggers",
        "channel_configs",
        "agent_permissions",
        "agent_tools",
        "agent_relationships",
        "gateway_messages",
        "published_pages",
        "notifications",
        "daily_token_usage",
    ]
    for table in cleanup_tables:
        try:
            async with db.begin_nested():
                await db.execute(text(f"DELETE FROM {table} WHERE agent_id = :aid"), {"aid": agent.id})
        except Exception:
            pass

    secondary_fk_cleanups = [
        "DELETE FROM task_logs WHERE task_id IN (SELECT id FROM tasks WHERE agent_id = :aid)",
        "DELETE FROM tasks WHERE agent_id = :aid",
        "DELETE FROM chat_sessions WHERE peer_agent_id = :aid",
        "DELETE FROM gateway_messages WHERE sender_agent_id = :aid",
        "UPDATE chat_messages SET sender_agent_id = NULL WHERE sender_agent_id = :aid",
    ]
    for sql in secondary_fk_cleanups:
        try:
            async with db.begin_nested():
                await db.execute(text(sql), {"aid": agent.id})
        except Exception:
            pass

    try:
        async with db.begin_nested():
            await db.execute(
                text("DELETE FROM agent_agent_relationships WHERE agent_id = :aid OR target_agent_id = :aid"),
                {"aid": agent.id},
            )
    except Exception:
        pass

    try:
        async with db.begin_nested():
            await db.execute(text("DELETE FROM plaza_posts WHERE author_id = :aid"), {"aid": str(agent.id)})
    except Exception:
        pass

    try:
        async with db.begin_nested():
            await db.execute(
                text("DELETE FROM participants WHERE type = 'agent' AND ref_id = :aid"),
                {"aid": agent.id},
            )
    except Exception:
        pass

    await db.delete(agent)


async def load_founder_self_bootstrap_cleanup_targets_for_tenant(
    db: AsyncSession,
    *,
    tenant: Tenant,
) -> FounderSelfBootstrapCleanupTargets:
    user_result = await db.execute(
        select(User)
        .where(User.tenant_id == tenant.id)
        .order_by(User.created_at.asc())
    )
    users = user_result.scalars().all()
    identity_ids = list(dict.fromkeys([item.identity_id for item in users if item.identity_id]))

    identities: list[Identity] = []
    if identity_ids:
        identity_result = await db.execute(select(Identity).where(Identity.id.in_(identity_ids)))
        identities = identity_result.scalars().all()

    workspace_result = await db.execute(
        select(FounderWorkspace)
        .where(FounderWorkspace.tenant_id == tenant.id)
        .order_by(FounderWorkspace.updated_at.desc())
    )
    agent_result = await db.execute(
        select(Agent)
        .where(Agent.tenant_id == tenant.id)
        .order_by(Agent.created_at.asc())
    )
    model_result = await db.execute(
        select(LLMModel)
        .where(LLMModel.tenant_id == tenant.id)
        .order_by(LLMModel.created_at.asc())
    )

    return FounderSelfBootstrapCleanupTargets(
        tenant=tenant,
        identities=identities,
        users=users,
        workspaces=workspace_result.scalars().all(),
        agents=agent_result.scalars().all(),
        llm_models=model_result.scalars().all(),
    )


async def load_founder_self_bootstrap_cleanup_targets_for_identity(
    db: AsyncSession,
    *,
    identity: Identity,
) -> FounderSelfBootstrapCleanupTargets:
    user_result = await db.execute(
        select(User)
        .where(User.identity_id == identity.id, User.tenant_id.is_(None))
        .order_by(User.created_at.asc())
    )
    users = user_result.scalars().all()
    return FounderSelfBootstrapCleanupTargets(
        tenant=None,
        identities=[identity],
        users=users,
        workspaces=[],
        agents=[],
        llm_models=[],
    )


async def list_all_founder_self_bootstrap_cleanup_targets(
    db: AsyncSession,
) -> list[FounderSelfBootstrapCleanupTargets]:
    tenant_result = await db.execute(
        select(Tenant)
        .where(Tenant.name.like(f"{SELF_BOOTSTRAP_COMPANY_PREFIX}%"))
        .order_by(Tenant.created_at.desc())
    )
    targets = [
        await load_founder_self_bootstrap_cleanup_targets_for_tenant(db, tenant=tenant)
        for tenant in tenant_result.scalars().all()
    ]

    identity_result = await db.execute(
        select(Identity)
        .where(Identity.email.like(f"{SELF_BOOTSTRAP_EMAIL_PREFIX}%{SELF_BOOTSTRAP_EMAIL_SUFFIX}"))
        .order_by(Identity.created_at.desc())
    )
    for identity in identity_result.scalars().all():
        tenantless_target = await load_founder_self_bootstrap_cleanup_targets_for_identity(db, identity=identity)
        if tenantless_target.users:
            targets.append(tenantless_target)
    return targets


async def load_founder_self_bootstrap_identity(
    db: AsyncSession,
    *,
    identity_id: uuid.UUID | None,
) -> Identity | None:
    if identity_id is None:
        return None
    result = await db.execute(select(Identity).where(Identity.id == identity_id))
    return result.scalar_one_or_none()


async def _cleanup_tenant_scoped_rows(db: AsyncSession, *, tenant_id: uuid.UUID) -> None:
    for sql in _TENANT_SCOPED_SQL:
        try:
            async with db.begin_nested():
                await db.execute(text(sql), {"tenant_id": tenant_id})
        except Exception:
            pass


async def _cleanup_user_scoped_rows(db: AsyncSession, *, user_id: uuid.UUID) -> None:
    for sql in _USER_SCOPED_SQL:
        try:
            async with db.begin_nested():
                await db.execute(text(sql), {"user_id": user_id})
        except Exception:
            pass


async def cleanup_founder_self_bootstrap_targets(
    db: AsyncSession,
    *,
    targets: FounderSelfBootstrapCleanupTargets,
    execute: bool,
    reason: str,
) -> dict[str, Any]:
    summary = build_founder_self_bootstrap_cleanup_summary(targets)
    result: dict[str, Any] = {
        **summary,
        "ok": True,
        "executed": execute,
        "deleted_agent_count": 0,
        "deleted_founder_workspace_count": 0,
        "deleted_llm_model_count": 0,
        "deleted_user_count": 0,
        "deleted_identity_count": 0,
        "deleted_tenant_count": 0,
        "errors": [],
    }
    if not execute:
        return result

    for agent in targets.agents:
        try:
            await _delete_agent_record(db, agent, reason=reason)
            await db.commit()
            result["deleted_agent_count"] += 1
        except Exception as exc:
            await db.rollback()
            result["errors"].append(f"agent:{agent.name}:{exc}")

    for workspace in targets.workspaces:
        try:
            await db.delete(workspace)
            await db.commit()
            result["deleted_founder_workspace_count"] += 1
        except Exception as exc:
            await db.rollback()
            result["errors"].append(f"workspace:{workspace.name}:{exc}")

    for model in targets.llm_models:
        try:
            await db.execute(update(Agent).where(Agent.primary_model_id == model.id).values(primary_model_id=None))
            await db.execute(update(Agent).where(Agent.fallback_model_id == model.id).values(fallback_model_id=None))
            await db.delete(model)
            await db.commit()
            result["deleted_llm_model_count"] += 1
        except Exception as exc:
            await db.rollback()
            result["errors"].append(f"model:{model.label}:{exc}")

    if targets.tenant is not None:
        await _cleanup_tenant_scoped_rows(db, tenant_id=targets.tenant.id)

    for user in targets.users:
        try:
            await _cleanup_user_scoped_rows(db, user_id=user.id)
            await db.delete(user)
            await db.commit()
            result["deleted_user_count"] += 1
        except Exception as exc:
            await db.rollback()
            result["errors"].append(f"user:{user.id}:{exc}")

    for identity in targets.identities:
        try:
            remaining_users = await db.execute(select(User).where(User.identity_id == identity.id))
            if remaining_users.scalars().first() is not None:
                continue
            await db.delete(identity)
            await db.commit()
            result["deleted_identity_count"] += 1
        except Exception as exc:
            await db.rollback()
            result["errors"].append(f"identity:{identity.id}:{exc}")

    if targets.tenant is not None:
        try:
            await db.delete(targets.tenant)
            await db.commit()
            result["deleted_tenant_count"] += 1
        except Exception as exc:
            await db.rollback()
            result["errors"].append(f"tenant:{targets.tenant.id}:{exc}")

    result["ok"] = len(result["errors"]) == 0
    return result
