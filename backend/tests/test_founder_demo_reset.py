import uuid
from types import SimpleNamespace

from app.services.founder_demo_reset import (
    build_founder_demo_reset_summary,
    collect_founder_workspace_agent_ids,
)


def _workspace(name: str, *agent_ids: str):
    return SimpleNamespace(
        name=name,
        business_logic={
            "_founder_runtime": {
                "dashboard_snapshot": {
                    "created_agents": [{"id": item, "name": f"Agent {index}"} for index, item in enumerate(agent_ids)]
                }
            }
        },
    )


def test_collect_founder_workspace_agent_ids_reads_runtime_snapshot_and_dedupes():
    first_agent_id = uuid.uuid4()
    second_agent_id = uuid.uuid4()

    workspaces = [
        _workspace("Founder Workspace A", str(first_agent_id), str(second_agent_id)),
        _workspace("Founder Workspace B", str(first_agent_id), "not-a-uuid", ""),
    ]

    agent_ids = collect_founder_workspace_agent_ids(workspaces)

    assert agent_ids == [first_agent_id, second_agent_id]


def test_build_founder_demo_reset_summary_defaults_to_founder_linked_agents_only():
    founder_agent_id = uuid.uuid4()
    legacy_agent_id = uuid.uuid4()

    workspaces = [_workspace("Founder Workspace A", str(founder_agent_id))]
    tenant_agents = [
        SimpleNamespace(id=founder_agent_id, name="Founder Copilot"),
        SimpleNamespace(id=legacy_agent_id, name="Legacy Manual Agent"),
    ]

    summary = build_founder_demo_reset_summary(
        workspaces=workspaces,
        tenant_agents=tenant_agents,
        wipe_all_tenant_agents=False,
    )

    assert summary["founder_workspace_count"] == 1
    assert summary["target_agent_count"] == 1
    assert summary["target_agent_ids"] == [str(founder_agent_id)]
    assert summary["target_agent_names"] == ["Founder Copilot"]
    assert summary["tenant_agent_count"] == 2
    assert summary["wipe_all_tenant_agents"] is False


def test_build_founder_demo_reset_summary_can_wipe_all_tenant_agents():
    founder_agent_id = uuid.uuid4()
    legacy_agent_id = uuid.uuid4()
    missing_agent_id = uuid.uuid4()

    workspaces = [_workspace("Founder Workspace A", str(founder_agent_id), str(missing_agent_id))]
    tenant_agents = [
        SimpleNamespace(id=founder_agent_id, name="Founder Copilot"),
        SimpleNamespace(id=legacy_agent_id, name="Legacy Manual Agent"),
    ]

    summary = build_founder_demo_reset_summary(
        workspaces=workspaces,
        tenant_agents=tenant_agents,
        wipe_all_tenant_agents=True,
    )

    assert summary["target_agent_count"] == 2
    assert summary["target_agent_ids"] == [str(founder_agent_id), str(legacy_agent_id)]
    assert summary["target_agent_names"] == ["Founder Copilot", "Legacy Manual Agent"]
    assert summary["orphan_founder_agent_ids"] == [str(missing_agent_id)]
