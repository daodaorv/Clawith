import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import get_current_user
from app.duoduo.skill_packs import FIRST_SCENARIO_ID
from app.main import app


@pytest.fixture
def current_user():
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
async def test_list_skill_packs_returns_catalog_payload(client, current_user):
    app.dependency_overrides[get_current_user] = lambda: current_user

    async with await client() as ac:
        response = await ac.get("/api/skills/packs")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["scenario"]["scenario_id"] == FIRST_SCENARIO_ID
    assert payload["count"] >= 1
    assert any(item["pack_id"] == "content-production-pack" for item in payload["items"])


@pytest.mark.asyncio
async def test_get_skill_pack_returns_single_pack(client, current_user):
    app.dependency_overrides[get_current_user] = lambda: current_user

    async with await client() as ac:
        response = await ac.get("/api/skills/packs/report-output-pack")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["pack_id"] == "report-output-pack"
    assert payload["display_name_zh"] == "报告输出包"
    assert payload["included_skills"]


@pytest.mark.asyncio
async def test_get_skill_pack_returns_404_for_unknown_pack(client, current_user):
    app.dependency_overrides[get_current_user] = lambda: current_user

    async with await client() as ac:
        response = await ac.get("/api/skills/packs/unknown-pack")

    app.dependency_overrides.clear()

    assert response.status_code == 404
