"""Reset founder demo data for a tenant.

This script is intended for local operator use when repeatedly validating the
founder mainline flow against the same demo tenant.

By default it performs a dry run and only prints what would be removed.
Pass --yes to execute.

Usage:
  Source:
    cd backend && python -m app.scripts.reset_founder_demo_tenant --tenant-slug solo-founder-lab-3cf969
    cd backend && python -m app.scripts.reset_founder_demo_tenant --tenant-slug solo-founder-lab-3cf969 --wipe-tenant-agents --yes

  Docker:
    docker exec clawith-backend-1 python3 -m app.scripts.reset_founder_demo_tenant --tenant-slug solo-founder-lab-3cf969
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from loguru import logger
from sqlalchemy import select, text

from app.database import async_session
from app.models.agent import Agent
from app.models.founder_workspace import FounderWorkspace
from app.models.tenant import Tenant
from app.services.agent_manager import agent_manager
from app.services.founder_demo_reset import build_founder_demo_reset_summary


async def _delete_agent_record(db, agent: Agent) -> None:
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
                        "reason": "founder demo tenant reset",
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


async def _load_target_tenant(*, tenant_slug: str | None, tenant_name: str | None):
    async with async_session() as db:
        statement = select(Tenant)
        if tenant_slug:
            statement = statement.where(Tenant.slug == tenant_slug.strip())
        elif tenant_name:
            statement = statement.where(Tenant.name == tenant_name.strip())
        else:
            raise ValueError("Either tenant_slug or tenant_name is required.")

        result = await db.execute(statement)
        tenant = result.scalar_one_or_none()
        if tenant is None:
            raise ValueError(
                f"Tenant not found for {'slug' if tenant_slug else 'name'} "
                f"{tenant_slug or tenant_name!r}."
            )
        return tenant


async def reset_founder_demo_tenant(
    *,
    tenant_slug: str | None,
    tenant_name: str | None,
    wipe_tenant_agents: bool,
    execute: bool,
) -> int:
    tenant = await _load_target_tenant(tenant_slug=tenant_slug, tenant_name=tenant_name)

    async with async_session() as db:
        workspace_result = await db.execute(
            select(FounderWorkspace)
            .where(FounderWorkspace.tenant_id == tenant.id)
            .order_by(FounderWorkspace.updated_at.desc())
        )
        workspaces = workspace_result.scalars().all()

        agent_result = await db.execute(
            select(Agent)
            .where(Agent.tenant_id == tenant.id)
            .order_by(Agent.created_at.asc())
        )
        tenant_agents = agent_result.scalars().all()

        summary = build_founder_demo_reset_summary(
            workspaces=workspaces,
            tenant_agents=tenant_agents,
            wipe_all_tenant_agents=wipe_tenant_agents,
        )

        logger.info(f"Tenant: {tenant.name} ({tenant.slug})")
        logger.info(
            "Founder workspaces: {} | Tenant agents: {} | Target agents: {} | Wipe all tenant agents: {}",
            summary["founder_workspace_count"],
            summary["tenant_agent_count"],
            summary["target_agent_count"],
            summary["wipe_all_tenant_agents"],
        )

        if summary["founder_workspace_names"]:
            logger.info("Founder workspaces queued for removal: {}", summary["founder_workspace_names"])
        if summary["target_agent_names"]:
            logger.info("Agents queued for removal: {}", summary["target_agent_names"])
        if summary["orphan_founder_agent_ids"]:
            logger.warning(
                "Founder workspaces referenced agent ids that are no longer present in the tenant: {}",
                summary["orphan_founder_agent_ids"],
            )

        if not execute:
            logger.warning("Dry run only. Re-run with --yes to execute the reset.")
            return 0

        deleted_agents = 0
        failed_agents: list[str] = []
        target_agent_id_set = set(summary["target_agent_ids"])
        for agent in tenant_agents:
            if str(agent.id) not in target_agent_id_set:
                continue
            try:
                await _delete_agent_record(db, agent)
                await db.commit()
                deleted_agents += 1
                logger.info(f"Deleted agent: {agent.name} ({agent.id})")
            except Exception as exc:
                await db.rollback()
                failed_agents.append(f"{agent.name} ({agent.id})")
                logger.error(f"Failed to delete agent {agent.name} ({agent.id}): {exc}")

        deleted_workspaces = 0
        failed_workspaces: list[str] = []
        for workspace in workspaces:
            try:
                await db.delete(workspace)
                await db.commit()
                deleted_workspaces += 1
                logger.info(f"Deleted founder workspace: {workspace.name} ({workspace.id})")
            except Exception as exc:
                await db.rollback()
                failed_workspaces.append(f"{workspace.name} ({workspace.id})")
                logger.error(f"Failed to delete founder workspace {workspace.name} ({workspace.id}): {exc}")

        logger.info(
            "Founder demo reset complete. Deleted {} agents and {} workspaces.",
            deleted_agents,
            deleted_workspaces,
        )
        if failed_agents:
            logger.warning("Agent deletions that failed: {}", failed_agents)
        if failed_workspaces:
            logger.warning("Founder workspace deletions that failed: {}", failed_workspaces)
        return 1 if failed_agents or failed_workspaces else 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reset founder demo data for a tenant.")
    parser.add_argument("--tenant-slug", help="Preferred tenant identifier for the reset target.")
    parser.add_argument("--tenant-name", help="Fallback tenant name if slug is not available.")
    parser.add_argument(
        "--wipe-tenant-agents",
        action="store_true",
        help="Delete all agents in the tenant, not only the agents referenced by founder workspaces.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Execute the reset. Without this flag the script only prints a dry-run summary.",
    )
    return parser


async def _main_async() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    if not args.tenant_slug and not args.tenant_name:
        parser.error("one of --tenant-slug or --tenant-name is required")

    return await reset_founder_demo_tenant(
        tenant_slug=args.tenant_slug,
        tenant_name=args.tenant_name,
        wipe_tenant_agents=args.wipe_tenant_agents,
        execute=args.yes,
    )


def main() -> None:
    raise SystemExit(asyncio.run(_main_async()))


if __name__ == "__main__":
    main()
