import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.api import enterprise as enterprise_api
from app.config import get_settings
from app.core.security import decrypt_data, encrypt_data
from app.schemas.schemas import LLMModelCreate


class DummyResult:
    def __init__(self, values=None):
        self._values = list(values or [])

    def scalar_one_or_none(self):
        return self._values[0] if self._values else None

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class RecordingDB:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        now = datetime.now(timezone.utc)
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now

    async def execute(self, _statement, _params=None):
        if self.responses:
            return self.responses.pop(0)
        return DummyResult()


@pytest.mark.asyncio
async def test_add_llm_model_encrypts_api_key_before_storage():
    db = RecordingDB()
    current_user = SimpleNamespace(role="platform_admin", tenant_id=uuid.uuid4())
    payload = LLMModelCreate(
        provider="openai",
        model="gpt-4.1-mini",
        api_key="sk-test-plain-secret",
        base_url="https://api.openai.com/v1",
        label="OpenAI",
    )

    await enterprise_api.add_llm_model(
        data=payload,
        tenant_id=str(current_user.tenant_id),
        current_user=current_user,
        db=db,
    )

    stored_model = db.added[0]
    assert stored_model.api_key_encrypted != payload.api_key
    assert decrypt_data(stored_model.api_key_encrypted, get_settings().SECRET_KEY) == payload.api_key


@pytest.mark.asyncio
async def test_resolve_probe_api_key_decrypts_stored_model_key():
    encrypted_key = encrypt_data("sk-test-probe-secret", get_settings().SECRET_KEY)
    db = RecordingDB(
        responses=[DummyResult([SimpleNamespace(api_key_encrypted=encrypted_key)])]
    )

    resolved = await enterprise_api._resolve_probe_api_key(
        enterprise_api.LLMTestRequest(
            provider="openai",
            model="gpt-4.1-mini",
            model_id=str(uuid.uuid4()),
        ),
        db,
    )

    assert resolved == "sk-test-probe-secret"


@pytest.mark.asyncio
async def test_list_llm_models_masks_plaintext_tail_even_when_stored_encrypted():
    encrypted_key = encrypt_data("sk-test-tail-4321", get_settings().SECRET_KEY)
    model = SimpleNamespace(
        id=uuid.uuid4(),
        provider="openai",
        model="gpt-4.1-mini",
        api_key_encrypted=encrypted_key,
        base_url="https://api.openai.com/v1",
        label="OpenAI",
        temperature=None,
        max_tokens_per_day=None,
        enabled=True,
        supports_vision=False,
        max_output_tokens=None,
        request_timeout=None,
        created_at=datetime.now(timezone.utc),
    )
    db = RecordingDB(responses=[DummyResult([model])])
    current_user = SimpleNamespace(role="platform_admin", tenant_id=uuid.uuid4())

    models = await enterprise_api.list_llm_models(
        tenant_id=None,
        current_user=current_user,
        db=db,
    )

    assert models[0].api_key_masked == "****4321"
