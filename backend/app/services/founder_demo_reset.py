from __future__ import annotations

import uuid
from typing import Any, Iterable

_FOUNDER_RUNTIME_KEY = "_founder_runtime"


def _coerce_uuid(value: Any) -> uuid.UUID | None:
    if isinstance(value, uuid.UUID):
        return value
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        try:
            return uuid.UUID(normalized)
        except ValueError:
            return None
    return None


def _extract_dashboard_snapshot(workspace: Any) -> dict[str, Any]:
    dashboard_snapshot = getattr(workspace, "dashboard_snapshot", None)
    if isinstance(dashboard_snapshot, dict):
        return dashboard_snapshot

    business_logic = getattr(workspace, "business_logic", {}) or {}
    if not isinstance(business_logic, dict):
        return {}

    runtime = business_logic.get(_FOUNDER_RUNTIME_KEY)
    if not isinstance(runtime, dict):
        return {}

    dashboard_snapshot = runtime.get("dashboard_snapshot")
    return dashboard_snapshot if isinstance(dashboard_snapshot, dict) else {}


def collect_founder_workspace_agent_ids(workspaces: Iterable[Any]) -> list[uuid.UUID]:
    ordered_ids: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()

    for workspace in workspaces:
        dashboard_snapshot = _extract_dashboard_snapshot(workspace)
        created_agents = dashboard_snapshot.get("created_agents")
        if not isinstance(created_agents, list):
            continue

        for item in created_agents:
            if not isinstance(item, dict):
                continue
            agent_id = _coerce_uuid(item.get("id"))
            if agent_id is None or agent_id in seen:
                continue
            seen.add(agent_id)
            ordered_ids.append(agent_id)

    return ordered_ids


def build_founder_demo_reset_summary(
    *,
    workspaces: Iterable[Any],
    tenant_agents: Iterable[Any],
    wipe_all_tenant_agents: bool,
) -> dict[str, Any]:
    workspace_list = list(workspaces)
    tenant_agent_list = list(tenant_agents)
    founder_agent_ids = collect_founder_workspace_agent_ids(workspace_list)
    founder_agent_id_set = set(founder_agent_ids)

    target_agents = (
        tenant_agent_list
        if wipe_all_tenant_agents
        else [item for item in tenant_agent_list if getattr(item, "id", None) in founder_agent_id_set]
    )

    tenant_agent_id_set = {
        agent_id
        for agent_id in (getattr(item, "id", None) for item in tenant_agent_list)
        if isinstance(agent_id, uuid.UUID)
    }

    orphan_founder_agent_ids = [
        str(agent_id)
        for agent_id in founder_agent_ids
        if agent_id not in tenant_agent_id_set
    ]

    return {
        "founder_workspace_count": len(workspace_list),
        "founder_workspace_names": [str(getattr(item, "name", "")).strip() for item in workspace_list if getattr(item, "name", None)],
        "founder_agent_ids": [str(item) for item in founder_agent_ids],
        "target_agent_count": len(target_agents),
        "target_agent_ids": [str(getattr(item, "id")) for item in target_agents if getattr(item, "id", None)],
        "target_agent_names": [str(getattr(item, "name", "")).strip() for item in target_agents if getattr(item, "name", None)],
        "tenant_agent_count": len(tenant_agent_list),
        "wipe_all_tenant_agents": wipe_all_tenant_agents,
        "orphan_founder_agent_ids": orphan_founder_agent_ids,
    }
