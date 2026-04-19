import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.core.security import get_current_admin, get_current_user
from app.main import app


class _FakeResponse:
    def __init__(self, *, content=None, reasoning_content=None):
        self.content = content
        self.reasoning_content = reasoning_content
        self.model = "gpt-4.1-mini"
        self.usage = {"total_tokens": 12}
        self.finish_reason = "stop"


class _FakeClient:
    async def complete(self, *, messages, max_tokens, **_kwargs):
        return _FakeResponse(content="ok")


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
async def test_llm_probe_returns_normalized_provider_and_base_url(monkeypatch, client, platform_admin_user):
    from app.services import llm_probe as llm_probe_service

    monkeypatch.setattr(llm_probe_service, "create_llm_client", lambda **_kwargs: _FakeClient())
    app.dependency_overrides[get_current_admin] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/llm-probe",
            json={
                "provider": "openai_response",
                "model": "gpt-4.1-mini",
                "api_key": "sk-test",
                "base_url": "https://api.openai.com",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["resolved_provider"] == "openai-response"
    assert payload["normalized_base_url"] == "https://api.openai.com"
    assert payload["autofill"]["applied_fields"] == []
    assert payload["base_url_source"] == "api_input"


@pytest.mark.asyncio
async def test_llm_probe_treats_reasoning_content_as_success(monkeypatch, client, platform_admin_user):
    from app.services import llm_probe as llm_probe_service

    class _ReasoningClient:
        async def complete(self, *, messages, max_tokens, **_kwargs):
            return _FakeResponse(content=None, reasoning_content="thinking ok")

    monkeypatch.setattr(llm_probe_service, "create_llm_client", lambda **_kwargs: _ReasoningClient())
    app.dependency_overrides[get_current_admin] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/llm-probe",
            json={"provider": "openai", "model": "gpt-4.1-mini", "api_key": "sk-test"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["supports_reasoning_signal"] is True


@pytest.mark.asyncio
async def test_llm_probe_rejects_unknown_provider(monkeypatch, client, platform_admin_user):
    app.dependency_overrides[get_current_admin] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/llm-probe",
            json={"provider": "mystery-provider", "model": "foo", "api_key": "sk-test"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is False
    assert payload["error_code"] == "PROBE_PROVIDER_UNSUPPORTED"


@pytest.mark.asyncio
async def test_llm_providers_manifest_exposes_probe_metadata(client, platform_admin_user):
    app.dependency_overrides[get_current_user] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.get("/api/enterprise/llm-providers")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    providers = response.json()
    openai = next(item for item in providers if item["provider"] == "openai")
    assert "base_url_required" in openai
    assert "base_url_examples" in openai
    assert "probe_strategy" in openai


@pytest.mark.asyncio
async def test_llm_test_keeps_legacy_success_shape(monkeypatch, client, platform_admin_user):
    from app.services import llm_probe as llm_probe_service

    monkeypatch.setattr(llm_probe_service, "create_llm_client", lambda **_kwargs: _FakeClient())
    app.dependency_overrides[get_current_admin] = lambda: platform_admin_user

    async with await client() as ac:
        response = await ac.post(
            "/api/enterprise/llm-test",
            json={"provider": "openai", "model": "gpt-4.1-mini", "api_key": "sk-test"},
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert "reply" in payload
    assert payload["resolved_provider"] == "openai"
