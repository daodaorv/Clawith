import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy.exc import MissingGreenlet

from app.core.security import get_current_user
from app.database import get_db
from app.main import app


class DummyResult:
    def __init__(self, values=None):
        self._values = list(values or [])

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class RecordingDB:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.added = []
        self.refreshed = []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        now = datetime.now(timezone.utc)
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if getattr(obj, "updated_at", None) is None:
                obj.updated_at = now

    async def refresh(self, obj):
        self.refreshed.append(obj)
        now = datetime.now(timezone.utc)
        if hasattr(obj, "mark_refreshed"):
            obj.mark_refreshed(now)
            return
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = now

    async def execute(self, _statement, _params=None):
        if self.responses:
            return self.responses.pop(0)
        return DummyResult()


class RefreshSensitiveWorkspace(SimpleNamespace):
    def __init__(self, **kwargs):
        updated_at = kwargs.pop("updated_at", None) or datetime.now(timezone.utc)
        super().__init__(updated_at=updated_at, **kwargs)
        self._updated_at_value = updated_at
        self._updated_at_expired = True

    @property
    def updated_at(self):
        if self._updated_at_expired:
            raise MissingGreenlet("updated_at requires refresh")
        return self._updated_at_value

    @updated_at.setter
    def updated_at(self, value):
        self._updated_at_value = value

    def mark_refreshed(self, value):
        self._updated_at_value = value
        self._updated_at_expired = False


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
async def test_create_founder_workspace_returns_persisted_shell(client, platform_admin_user):
    db = RecordingDB()

    async def _db_override():
        yield db

    app.dependency_overrides[get_current_user] = lambda: platform_admin_user
    app.dependency_overrides[get_db] = _db_override

    async with await client() as ac:
        response = await ac.post(
            "/api/founder-workspaces",
            json={
                "name": "Solo Growth Studio",
                "business_brief": "我想做一个面向出海创作者的一人公司。",
                "business_logic": {
                    "offer": "咨询 + 训练营",
                    "channel": "短视频 + 邮件",
                },
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Solo Growth Studio"
    assert payload["current_state"] == "intake"
    assert payload["materialization_status"] == "not_started"
    assert payload["latest_plan"]["plan_status"] == "step0_blocked"
    assert db.added[0].owner_user_id == platform_admin_user.id


@pytest.mark.asyncio
async def test_list_founder_workspaces_returns_existing_shells(client, platform_admin_user):
    workspace = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=platform_admin_user.tenant_id,
        owner_user_id=platform_admin_user.id,
        name="Existing Founder Workspace",
        business_brief="已有创业工作区",
        business_logic={"offer": "课程"},
        current_state="planning",
        materialization_status="not_started",
        latest_plan_json={
            "business_brief": "已有创业工作区",
            "plan_status": "ready_for_plan",
            "can_generate_plan": True,
            "model_ready_context": {
                "resolved_provider": "openai-compatible",
                "recommended_model": "gpt-4.1-mini",
                "normalized_base_url": "https://example.com/v1",
            },
            "answered_groups": [],
            "missing_groups": [],
            "next_questions": [],
        },
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = RecordingDB(responses=[DummyResult([workspace])])

    async def _db_override():
        yield db

    app.dependency_overrides[get_current_user] = lambda: platform_admin_user
    app.dependency_overrides[get_db] = _db_override

    async with await client() as ac:
        response = await ac.get("/api/founder-workspaces")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["name"] == "Existing Founder Workspace"
    assert payload[0]["latest_plan"]["plan_status"] == "ready_for_plan"


@pytest.mark.asyncio
async def test_save_founder_workspace_interview_progress_persists_planning_context(client, platform_admin_user):
    workspace = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=platform_admin_user.tenant_id,
        owner_user_id=platform_admin_user.id,
        name="Solo Growth Studio",
        business_brief="做出海创作者的一人公司",
        business_logic={"offer": "咨询"},
        current_state="intake",
        materialization_status="not_started",
        latest_plan_json={
            "business_brief": "做出海创作者的一人公司",
            "plan_status": "step0_blocked",
            "can_generate_plan": False,
            "model_ready_context": {},
            "answered_groups": [],
            "missing_groups": [],
            "next_questions": [],
        },
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = RecordingDB(responses=[DummyResult([workspace])])

    async def _db_override():
        yield db

    app.dependency_overrides[get_current_user] = lambda: platform_admin_user
    app.dependency_overrides[get_db] = _db_override

    async with await client() as ac:
        response = await ac.post(
            f"/api/founder-workspaces/{workspace.id}/planning/interview-progress",
            json={
                "business_brief": "做出海创作者的一人公司",
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                },
                "answers": [
                    {"group_id": "market_target_users", "answer_text": "出海内容创作者"},
                    {"group_id": "core_product_service", "answer_text": "咨询 + 训练营"},
                ],
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["planning_context"]["answers"][0]["group_id"] == "market_target_users"
    assert payload["latest_plan"]["plan_status"] == "interview_in_progress"
    assert payload["current_state"] == "planning"
    assert workspace.business_logic["_founder_runtime"]["model_ready_context"]["recommended_model"] == "gpt-4.1-mini"


@pytest.mark.asyncio
async def test_save_founder_workspace_interview_progress_refreshes_before_serializing(client, platform_admin_user):
    workspace = RefreshSensitiveWorkspace(
        id=uuid.uuid4(),
        tenant_id=platform_admin_user.tenant_id,
        owner_user_id=platform_admin_user.id,
        name="Solo Growth Studio",
        business_brief="Build a founder workspace.",
        business_logic={"offer": "Consulting"},
        current_state="intake",
        materialization_status="not_started",
        latest_plan_json={
            "business_brief": "Build a founder workspace.",
            "plan_status": "step0_blocked",
            "can_generate_plan": False,
            "model_ready_context": {},
            "answered_groups": [],
            "missing_groups": [],
            "next_questions": [],
        },
        created_at=datetime.now(timezone.utc),
    )
    db = RecordingDB(responses=[DummyResult([workspace])])

    async def _db_override():
        yield db

    app.dependency_overrides[get_current_user] = lambda: platform_admin_user
    app.dependency_overrides[get_db] = _db_override

    async with await client() as ac:
        response = await ac.post(
            f"/api/founder-workspaces/{workspace.id}/planning/interview-progress",
            json={
                "business_brief": "Build a founder workspace.",
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                },
                "answers": [
                    {"group_id": "market_target_users", "answer_text": "Overseas Chinese creators."},
                    {"group_id": "core_product_service", "answer_text": "Consulting and cohort program."},
                ],
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert db.refreshed == [workspace]
    payload = response.json()
    assert payload["updated_at"]


@pytest.mark.asyncio
async def test_generate_founder_workspace_draft_plan_persists_draft_and_review_state(client, platform_admin_user):
    workspace = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=platform_admin_user.tenant_id,
        owner_user_id=platform_admin_user.id,
        name="Solo Growth Studio",
        business_brief="做出海创作者的一人公司",
        business_logic={"offer": "咨询"},
        current_state="planning",
        materialization_status="not_started",
        latest_plan_json={
            "business_brief": "做出海创作者的一人公司",
            "plan_status": "ready_for_plan",
            "can_generate_plan": True,
            "model_ready_context": {
                "resolved_provider": "openai-compatible",
                "recommended_model": "gpt-4.1-mini",
                "normalized_base_url": "https://example.com/v1",
            },
            "answered_groups": [],
            "missing_groups": [],
            "next_questions": [],
        },
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = RecordingDB(responses=[DummyResult([workspace])])

    async def _db_override():
        yield db

    app.dependency_overrides[get_current_user] = lambda: platform_admin_user
    app.dependency_overrides[get_db] = _db_override

    async with await client() as ac:
        response = await ac.post(
            f"/api/founder-workspaces/{workspace.id}/planning/draft-plan",
            json={
                "business_brief": "做出海创作者的一人公司",
                "model_ready_context": {
                    "resolved_provider": "openai-compatible",
                    "recommended_model": "gpt-4.1-mini",
                    "normalized_base_url": "https://example.com/v1",
                },
                "answers": [
                    {"group_id": "market_target_users", "answer_text": "出海内容创作者"},
                    {"group_id": "core_product_service", "answer_text": "咨询 + 训练营"},
                    {"group_id": "acquisition_distribution_channels", "answer_text": "短视频 + 邮件"},
                    {"group_id": "conversion_sales_model", "answer_text": "内容到咨询转化"},
                    {"group_id": "delivery_service_model", "answer_text": "直播 + 社群交付"},
                    {"group_id": "content_language_requirements", "answer_text": "中英双语"},
                    {"group_id": "automation_human_boundary", "answer_text": "AI 起草，正式承诺人工确认"},
                    {"group_id": "team_gap_role_preference", "answer_text": "内容策略和全球分发"},
                ],
                "user_confirmed": True,
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["latest_plan"]["plan_status"] == "ready_for_deploy_prep"
    assert payload["draft_plan"]["plan_status"] == "ready_for_deploy_prep"
    assert payload["planning_context"]["user_confirmed"] is True
    assert payload["current_state"] == "review"
    assert workspace.business_logic["_founder_runtime"]["draft_plan"]["plan_status"] == "ready_for_deploy_prep"
