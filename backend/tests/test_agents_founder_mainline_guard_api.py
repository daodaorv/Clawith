import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import get_current_user
from app.database import get_db
from app.main import app


UNREADY_CONFIRMATION_MESSAGE = "\u7b49\u5f85\u7528\u6237\u660e\u786e\u786e\u8ba4\u5f53\u524d\u65b9\u6848"
MODEL_UNAVAILABLE_MESSAGE = "\u6a21\u578b\u4e2d\u5fc3\u5f53\u524d\u672a\u5904\u4e8e\u53ef\u7528\u72b6\u6001"
TEMPLATE_MISALIGNED_MESSAGE = "\u5f53\u524d\u521b\u5efa\u8868\u5355\u672a\u5bf9\u9f50 founder \u63a8\u8350\u6a21\u677f"


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


async def _db_override():
    yield object()


@pytest.mark.asyncio
async def test_create_agent_route_rejects_unready_founder_assisted_create(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user
    app.dependency_overrides[get_db] = _db_override

    async with await client() as ac:
        response = await ac.post(
            "/api/agents/",
            json={
                "name": "Founder Guard Agent",
                "role_description": "Test founder-assisted create guard.",
                "founder_mainline_guard": {
                    "recommendation_applied": True,
                    "user_confirmed": False,
                    "scenario_id": "cn-team-global-content-knowledge",
                },
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 409
    assert UNREADY_CONFIRMATION_MESSAGE in response.text
    assert MODEL_UNAVAILABLE_MESSAGE in response.text
    assert TEMPLATE_MISALIGNED_MESSAGE in response.text
