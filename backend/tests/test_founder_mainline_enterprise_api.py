import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import get_current_user
from app.main import app


def _ready_founder_mainline_payload(
    *,
    business_brief: str,
    overrides: dict | None = None,
) -> dict:
    payload = {
        "business_brief": business_brief,
        "model_ready_context": {
            "resolved_provider": "openai-compatible",
            "recommended_model": "gpt-4.1-mini",
            "normalized_base_url": "https://example.com/v1",
        },
        "answers": [
            {"group_id": "market_target_users", "answer_text": "Overseas Chinese creators."},
            {"group_id": "core_product_service", "answer_text": "Courses and consulting."},
            {"group_id": "acquisition_distribution_channels", "answer_text": "Short video, posts, and email."},
            {"group_id": "conversion_sales_model", "answer_text": "Content to consulting conversion."},
            {"group_id": "delivery_service_model", "answer_text": "Live workshops and community delivery."},
            {"group_id": "content_language_requirements", "answer_text": "Chinese-English bilingual."},
            {
                "group_id": "automation_human_boundary",
                "answer_text": "Drafting can be automated, pricing and promises require human approval.",
            },
            {"group_id": "team_gap_role_preference", "answer_text": "Content strategy, distribution, and follow-up."},
        ],
    }
    if overrides:
        payload.update(overrides)
    return payload


@pytest.fixture
def platform_admin_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        role="platform_admin",
        tenant_id=uuid.uuid4(),
        is_active=True,
        department_id=None,
    )


@pytest.fixture
def client():
    transport = httpx.ASGITransport(app=app)

    async def _build():
        return httpx.AsyncClient(transport=transport, base_url="http://test")

    return _build


@pytest.mark.asyncio
async def test_founder_mainline_draft_plan_route_returns_contract(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/draft-plan",
            json=_ready_founder_mainline_payload(
                business_brief="Chinese-first global knowledge business with \u8ddf\u8fdb and \u8f6c\u5316 needs.",
            ),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_status"] == "plan_draft_ready"
    assert payload["founder_copilot"]["canonical_name"] == "Founder Copilot"

    pack_ids = {item["pack_id"] for item in payload["skill_pack_recommendations"]}
    assert "founder-strategy-pack" in pack_ids


@pytest.mark.asyncio
async def test_founder_mainline_draft_plan_route_uses_structured_answers(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/draft-plan",
            json=_ready_founder_mainline_payload(
                business_brief="Chinese-first business.",
                overrides={
                    "answers": [
                        {"group_id": "market_target_users", "answer_text": "Overseas Chinese creators."},
                        {"group_id": "core_product_service", "answer_text": "Courses and consulting."},
                        {"group_id": "acquisition_distribution_channels", "answer_text": "Short video, posts, and email."},
                        {"group_id": "conversion_sales_model", "answer_text": "Advisor-led \u8ddf\u8fdb conversion."},
                        {"group_id": "delivery_service_model", "answer_text": "Live workshops and community delivery."},
                        {"group_id": "content_language_requirements", "answer_text": "Chinese-English bilingual."},
                        {
                            "group_id": "automation_human_boundary",
                            "answer_text": "Drafting can be automated, pricing and promises require human approval.",
                        },
                        {"group_id": "team_gap_role_preference", "answer_text": "The biggest gap is \u8ddf\u8fdb conversion."},
                    ],
                },
            ),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert "customer-success" in {team["team_id"] for team in payload["teams"]}
    assert not any("\u53cc\u8bed" in item for item in payload["open_questions"])


@pytest.mark.asyncio
async def test_founder_template_library_route_returns_saas_ops_scenario_metadata(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/template-library",
            params={"scenario": "cn-saas-ops-automation"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == "cn-saas-ops-automation"
    assert payload["scenario"]["display_name_zh"] == "中文团队做 SaaS / 运营自动化业务"
    assert payload["count"] >= 3
    assert {"Founder Copilot", "Project Chief of Staff", "Customer Follow-up Lead"}.issubset(
        {item["canonical_name"] for item in payload["items"]}
    )


@pytest.mark.asyncio
async def test_founder_template_library_route_returns_local_service_scenario_metadata(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/template-library",
            params={"scenario": "cn-local-service-leadgen"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == "cn-local-service-leadgen"
    assert "本地服务" in payload["scenario"]["display_name_zh"]
    assert {"Founder Copilot", "Content Strategy Lead", "Customer Follow-up Lead", "Project Chief of Staff"}.issubset(
        {item["canonical_name"] for item in payload["items"]}
    )


@pytest.mark.asyncio
async def test_founder_template_library_route_returns_cross_border_ecommerce_scenario_metadata(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/template-library",
            params={"scenario": "cn-cross-border-ecommerce-ops"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == "cn-cross-border-ecommerce-ops"
    assert {"Founder Copilot", "Global Distribution Lead", "Customer Follow-up Lead", "Project Chief of Staff"}.issubset(
        {item["canonical_name"] for item in payload["items"]}
    )


@pytest.mark.asyncio
async def test_founder_skill_pack_route_returns_saas_ops_packs(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/skill-packs",
            params={"scenario": "cn-saas-ops-automation"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["display_name_zh"] == "中文团队做 SaaS / 运营自动化业务"
    assert {"founder-strategy-pack", "customer-followup-pack", "report-output-pack"}.issubset(
        {item["pack_id"] for item in payload["items"]}
    )


@pytest.mark.asyncio
async def test_founder_skill_pack_route_returns_local_service_packs(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/skill-packs",
            params={"scenario": "cn-local-service-leadgen"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == "cn-local-service-leadgen"
    assert {"founder-strategy-pack", "content-production-pack", "customer-followup-pack", "report-output-pack"}.issubset(
        {item["pack_id"] for item in payload["items"]}
    )


@pytest.mark.asyncio
async def test_founder_skill_pack_route_returns_cross_border_ecommerce_packs(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/skill-packs",
            params={"scenario": "cn-cross-border-ecommerce-ops"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == "cn-cross-border-ecommerce-ops"
    assert {"founder-strategy-pack", "global-distribution-pack", "customer-followup-pack", "ecommerce-ops-pack"}.issubset(
        {item["pack_id"] for item in payload["items"]}
    )


@pytest.mark.asyncio
async def test_founder_mainline_draft_plan_route_rejects_when_interview_not_ready(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/draft-plan",
            json={
                "business_brief": "Chinese-first business.",
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                },
                "answers": [
                    {"group_id": "market_target_users", "answer_text": "Unknown target", "is_unknown": True},
                    {"group_id": "core_product_service", "answer_text": "Unknown offer", "is_unknown": True},
                    {"group_id": "acquisition_distribution_channels", "answer_text": "Short video and posts."},
                    {"group_id": "conversion_sales_model", "answer_text": "Unknown conversion", "is_unknown": True},
                    {"group_id": "delivery_service_model", "answer_text": "Live workshops."},
                    {"group_id": "content_language_requirements", "answer_text": "Chinese first."},
                    {"group_id": "automation_human_boundary", "answer_text": "Unknown boundary", "is_unknown": True},
                    {"group_id": "team_gap_role_preference", "answer_text": "Content strategy."},
                ],
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 409
    payload = response.json()
    assert payload["detail"]["plan_status"] == "blocked_by_open_questions"
    assert set(payload["detail"]["missing_groups"]) == {
        "market_target_users",
        "core_product_service",
        "conversion_sales_model",
        "automation_human_boundary",
    }


@pytest.mark.asyncio
async def test_founder_mainline_draft_plan_route_applies_correction_notes(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/draft-plan",
            json=_ready_founder_mainline_payload(
                business_brief="Chinese-first global knowledge business with \u8ddf\u8fdb and \u8f6c\u5316 needs.",
                overrides={
                    "correction_notes": (
                        "\u5ba2\u670d\u5148\u4e0d\u8981\u5355\u72ec\u6210\u961f\uff0c"
                        "\u6211\u66f4\u60f3\u5148\u628a\u53cc\u8bed\u5185\u5bb9\u548c\u6d77\u5916\u5206\u53d1\u505a\u597d\u3002"
                        "Founder \u8fd8\u8981\u66f4\u504f\u589e\u957f\uff0c\u4e0d\u53ea\u662f\u89c4\u5212\u3002"
                    ),
                },
            ),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_status"] == "plan_draft_ready"
    assert payload["previous_plan_summary_zh"]
    assert "customer-followup-pack" in payload["changed_pack_ids"]
    assert "customer-followup-lead" in payload["changed_template_keys"]
    assert "customer-success" not in {team["team_id"] for team in payload["teams"]}
    assert any("\u53cc\u8bed" in item for item in payload["change_summary_zh"])


@pytest.mark.asyncio
async def test_founder_mainline_interview_progress_route_returns_contract(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/interview-progress",
            json={
                "business_brief": "Chinese-first global knowledge business.",
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                },
                "answers": [
                    {"group_id": "market_target_users", "answer_text": "Overseas Chinese creators."},
                    {"group_id": "core_product_service", "answer_text": "Courses and consulting."},
                ],
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_status"] == "interview_in_progress"
    assert payload["can_generate_plan"] is False
    assert "acquisition_distribution_channels" in payload["missing_groups"]
    assert len(payload["next_questions"]) > 0


@pytest.mark.asyncio
async def test_founder_mainline_interview_progress_route_blocks_open_questions(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/interview-progress",
            json={
                "business_brief": "Chinese-first business.",
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                },
                "answers": [
                    {"group_id": "market_target_users", "answer_text": "Unknown target", "is_unknown": True},
                    {"group_id": "core_product_service", "answer_text": "Unknown offer", "is_unknown": True},
                    {"group_id": "acquisition_distribution_channels", "answer_text": "Short video and posts."},
                    {"group_id": "conversion_sales_model", "answer_text": "Unknown conversion", "is_unknown": True},
                    {"group_id": "delivery_service_model", "answer_text": "Live workshops."},
                    {"group_id": "content_language_requirements", "answer_text": "Chinese first."},
                    {"group_id": "automation_human_boundary", "answer_text": "Unknown boundary", "is_unknown": True},
                    {"group_id": "team_gap_role_preference", "answer_text": "Content strategy."},
                ],
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_status"] == "blocked_by_open_questions"
    assert payload["can_generate_plan"] is False
    assert set(payload["missing_groups"]) == {
        "market_target_users",
        "core_product_service",
        "conversion_sales_model",
        "automation_human_boundary",
    }


@pytest.mark.asyncio
async def test_founder_mainline_interview_progress_route_rejects_invalid_payload(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/interview-progress",
            json={
                "business_brief": "",
                "unexpected": True,
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_founder_mainline_draft_plan_route_enters_deploy_prep_after_user_confirmation(
    client, platform_admin_user
):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/duoduo/founder-mainline/draft-plan",
            json=_ready_founder_mainline_payload(
                business_brief="Chinese-first global knowledge business with \u8ddf\u8fdb and \u8f6c\u5316 needs.",
                overrides={"user_confirmed": True},
            ),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan_status"] == "ready_for_deploy_prep"
    assert payload["deployment_readiness"]["can_enter_deploy_prep"] is True
    assert payload["deployment_readiness"]["blocker_reason_zh"] == ""
    assert payload["deployment_readiness"]["missing_items"] == []
