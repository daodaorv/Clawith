from pathlib import Path

from app.scripts.founder_release_readiness import (
    build_founder_release_readiness_steps,
    discover_founder_backend_test_targets,
    discover_founder_frontend_test_targets,
    discover_founder_ruff_targets,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def test_discover_founder_release_targets_stays_scoped_to_founder_files(tmp_path: Path):
    backend_dir = tmp_path / "backend"
    frontend_dir = tmp_path / "frontend"

    _touch(backend_dir / "app" / "services" / "founder_company_materializer.py")
    _touch(backend_dir / "app" / "services" / "founder_demo_reset.py")
    _touch(backend_dir / "app" / "services" / "agent_manager.py")
    _touch(backend_dir / "app" / "duoduo" / "skill_packs.py")
    _touch(backend_dir / "app" / "duoduo" / "template_library.py")
    _touch(backend_dir / "tests" / "test_founder_mainline_service.py")
    _touch(backend_dir / "tests" / "test_founder_company_wiring.py")
    _touch(backend_dir / "tests" / "test_duoduo_catalog_registry.py")
    _touch(backend_dir / "tests" / "test_duoduo_structured_catalog_consistency.py")
    _touch(backend_dir / "tests" / "test_enterprise_duoduo_catalog_api.py")
    _touch(backend_dir / "tests" / "test_agents_founder_mainline_guard_api.py")
    _touch(backend_dir / "tests" / "test_agent_delete_api.py")

    _touch(frontend_dir / "tests" / "founderWorkspaceState.test.mjs")
    _touch(frontend_dir / "tests" / "founderMainlineDraftPlanSummary.test.mjs")
    _touch(frontend_dir / "tests" / "authBootstrap.test.mjs")
    _touch(frontend_dir / "tests" / "e2e" / "founderMainlineE2e.mjs")

    assert discover_founder_ruff_targets(backend_dir) == [
        "app/duoduo/skill_packs.py",
        "app/duoduo/template_library.py",
        "app/services/founder_company_materializer.py",
        "app/services/founder_demo_reset.py",
        "tests/test_agents_founder_mainline_guard_api.py",
        "tests/test_duoduo_catalog_registry.py",
        "tests/test_duoduo_structured_catalog_consistency.py",
        "tests/test_enterprise_duoduo_catalog_api.py",
        "tests/test_founder_company_wiring.py",
        "tests/test_founder_mainline_service.py",
    ]
    assert discover_founder_backend_test_targets(backend_dir) == [
        "tests/test_agents_founder_mainline_guard_api.py",
        "tests/test_duoduo_catalog_registry.py",
        "tests/test_duoduo_structured_catalog_consistency.py",
        "tests/test_enterprise_duoduo_catalog_api.py",
        "tests/test_founder_company_wiring.py",
        "tests/test_founder_mainline_service.py",
    ]
    assert discover_founder_frontend_test_targets(frontend_dir) == [
        "tests/founderMainlineDraftPlanSummary.test.mjs",
        "tests/founderWorkspaceState.test.mjs",
    ]


def test_build_founder_release_readiness_steps_adds_live_gate_only_when_requested(tmp_path: Path):
    _touch(tmp_path / "backend" / "app" / "services" / "founder_company_materializer.py")
    _touch(tmp_path / "backend" / "tests" / "test_founder_company_materializer.py")
    _touch(tmp_path / "frontend" / "tests" / "founderCompanyDashboard.test.mjs")

    standard_steps = build_founder_release_readiness_steps(repo_root=tmp_path)
    live_steps = build_founder_release_readiness_steps(repo_root=tmp_path, include_live_e2e=True)

    assert [step.name for step in standard_steps] == [
        "Backend founder ruff",
        "Backend founder pytest",
        "Frontend founder node tests",
        "Frontend build",
    ]
    assert [step.name for step in live_steps] == [
        "Backend founder ruff",
        "Backend founder pytest",
        "Frontend founder node tests",
        "Frontend build",
        "Frontend live founder E2E",
    ]


def test_founder_live_e2e_workflow_uploads_screenshots_and_walkthrough():
    workflow_text = (REPO_ROOT / ".github" / "workflows" / "founder-live-e2e.yml").read_text(
        encoding="utf-8",
    )

    assert "founder-live-e2e-screenshots" in workflow_text
    assert "output/playwright/*.png" in workflow_text
    assert "output/playwright/*.md" in workflow_text
