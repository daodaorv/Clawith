import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import get_current_user
from app.duoduo.skill_packs import FIRST_SCENARIO_ID, FIRST_SCENARIO_NAME_ZH
from app.main import app


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
async def test_duoduo_template_library_returns_cn_friendly_catalog(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get("/api/enterprise/duoduo/template-library")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["display_name_zh"] == FIRST_SCENARIO_NAME_ZH
    assert payload["count"] >= 1
    assert payload["items"][0]["display_name_zh"]
    assert "recommended_skill_packs" in payload["items"][0]


@pytest.mark.asyncio
async def test_duoduo_template_library_supports_scenario_filter(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get(
            "/api/enterprise/duoduo/template-library",
            params={"scenario": FIRST_SCENARIO_ID},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= 1
    assert all(FIRST_SCENARIO_ID in item["applicable_scenarios"] for item in payload["items"])


@pytest.mark.asyncio
async def test_duoduo_skill_packs_return_pack_contract(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get("/api/enterprise/duoduo/skill-packs")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == FIRST_SCENARIO_ID
    assert payload["count"] >= 1
    assert payload["items"][0]["display_name_zh"]
    assert payload["items"][0]["included_skills"]
    assert isinstance(payload["items"][0]["status"], str)


@pytest.mark.asyncio
async def test_skills_pack_catalog_endpoints_expose_runtime_pack_contract(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get("/api/skills/packs")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= 1
    first_pack = payload["items"][0]
    assert first_pack["pack_id"]
    assert first_pack["display_name_zh"]
    assert isinstance(first_pack["included_skills"], list)


@pytest.mark.asyncio
async def test_skills_pack_catalog_detail_returns_single_pack(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        list_response = await ac.get("/api/skills/packs")
        pack_id = list_response.json()["items"][0]["pack_id"]
        response = await ac.get(f"/api/skills/packs/{pack_id}")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["pack_id"] == pack_id
    assert payload["display_name_zh"]
