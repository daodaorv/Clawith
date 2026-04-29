import uuid
from types import SimpleNamespace

from app.services.founder_self_bootstrap_cleanup import (
    FounderSelfBootstrapCleanupTargets,
    build_founder_self_bootstrap_cleanup_summary,
    is_self_bootstrap_identity_email,
    is_self_bootstrap_tenant_name,
)


def _identity(email: str):
    return SimpleNamespace(id=uuid.uuid4(), email=email)


def _tenant(name: str, slug: str):
    return SimpleNamespace(id=uuid.uuid4(), name=name, slug=slug)


def _user(email: str):
    return SimpleNamespace(id=uuid.uuid4(), email=email)


def _workspace(name: str):
    return SimpleNamespace(id=uuid.uuid4(), name=name)


def _agent(name: str):
    return SimpleNamespace(id=uuid.uuid4(), name=name)


def _model(label: str):
    return SimpleNamespace(id=uuid.uuid4(), label=label)


def test_self_bootstrap_matchers_stay_tight_to_e2e_naming_contract():
    assert is_self_bootstrap_identity_email("founder-e2e-2026-04-26t12-14-02-982z@example.com") is True
    assert is_self_bootstrap_identity_email("founder@example.com") is False
    assert is_self_bootstrap_identity_email("") is False
    assert is_self_bootstrap_tenant_name("Founder E2E Company 2026-04-26t12-14-02-982z") is True
    assert is_self_bootstrap_tenant_name("Solo Founder Lab") is False
    assert is_self_bootstrap_tenant_name("") is False


def test_build_founder_self_bootstrap_cleanup_summary_counts_related_artifacts():
    tenant = _tenant(
        "Founder E2E Company 2026-04-26t12-14-02-982z",
        "founder-e2e-company-2026-04-26t12-14-02--a5a4f2",
    )
    identity = _identity("founder-e2e-2026-04-26t12-14-02-982z@example.com")
    user = _user(identity.email)
    workspace = _workspace("Founder Workspace 12-14-02")
    agents = [
        _agent("Founder Copilot"),
        _agent("Project Chief of Staff"),
        _agent("Content Strategy Lead"),
        _agent("Global Distribution Lead"),
    ]
    model = _model("Dummy Founder Self-Bootstrap Model")

    summary = build_founder_self_bootstrap_cleanup_summary(
        FounderSelfBootstrapCleanupTargets(
            tenant=tenant,
            identities=[identity],
            users=[user],
            workspaces=[workspace],
            agents=agents,
            llm_models=[model],
        )
    )

    assert summary["tenant_name"] == tenant.name
    assert summary["tenant_slug"] == tenant.slug
    assert summary["identity_emails"] == [identity.email]
    assert summary["user_count"] == 1
    assert summary["founder_workspace_names"] == [workspace.name]
    assert summary["agent_names"] == [agent.name for agent in agents]
    assert summary["llm_model_labels"] == [model.label]
    assert summary["agent_count"] == 4
