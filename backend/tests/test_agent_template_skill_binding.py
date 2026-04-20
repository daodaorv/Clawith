import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import agents as agents_api


UNREADY_CONFIRMATION_MESSAGE = "\u7b49\u5f85\u7528\u6237\u660e\u786e\u786e\u8ba4\u5f53\u524d\u65b9\u6848"
TEMPLATE_MISALIGNED_MESSAGE = "\u5f53\u524d\u521b\u5efa\u8868\u5355\u672a\u5bf9\u9f50 founder \u63a8\u8350\u6a21\u677f"
GROWTH_TEAM_BRIEF = "\u6211\u4eec\u8981\u5148\u642d\u5efa\u51fa\u6d77\u5185\u5bb9\u589e\u957f\u56e2\u961f\u3002"
FOLLOWUP_BRIEF = "\u6211\u4eec\u901a\u8fc7\u79c1\u4fe1\u54a8\u8be2\u505a\u8bad\u7ec3\u8425\u8f6c\u5316\uff0c\u9700\u8981\u6709\u4eba\u8ddf\u8fdb\u7ebf\u7d22\u3002"
REMOVE_CUSTOMER_TEAM_NOTES = "\u5148\u4e0d\u8981\u5355\u72ec\u6210\u961f\uff0c\u5ba2\u670d\u8ddf\u8fdb\u5e76\u5165\u73b0\u6709\u56e2\u961f\u3002"


class DummyScalarResult:
    def __init__(self, values=None):
        self._values = list(values or [])

    def scalar_one_or_none(self):
        return self._values[0] if self._values else None

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class SequenceDB:
    def __init__(self, responses):
        self.responses = list(responses)

    async def execute(self, _statement):
        if not self.responses:
            raise AssertionError("unexpected execute() call")
        return self.responses.pop(0)


def test_match_template_skill_ids_uses_folder_name_and_ignores_missing():
    research_id = uuid.uuid4()
    writing_id = uuid.uuid4()
    skills = [
        SimpleNamespace(id=research_id, folder_name="web-research"),
        SimpleNamespace(id=writing_id, folder_name="content-writing"),
    ]

    resolved = agents_api._match_template_skill_ids(
        ["web-research", "missing-skill", "content-writing"],
        skills,
    )

    assert resolved == {research_id, writing_id}


@pytest.mark.asyncio
async def test_collect_requested_skill_ids_merges_selected_default_and_template_skills():
    explicit_id = uuid.uuid4()
    default_id = uuid.uuid4()
    template_skill_id = uuid.uuid4()
    template = SimpleNamespace(default_skills=["web-research", "content-writing"])

    db = SequenceDB(
        responses=[
            DummyScalarResult([SimpleNamespace(id=default_id)]),
            DummyScalarResult([template]),
            DummyScalarResult(
                [
                    SimpleNamespace(id=template_skill_id, folder_name="web-research"),
                    SimpleNamespace(id=uuid.uuid4(), folder_name="other-skill"),
                ]
            ),
        ]
    )

    resolved = await agents_api._collect_requested_skill_ids(
        db,
        explicit_skill_ids=[explicit_id],
        template_id=uuid.uuid4(),
    )

    assert resolved == {explicit_id, default_id, template_skill_id}


@pytest.mark.asyncio
async def test_validate_founder_mainline_create_guard_blocks_unready_founder_assisted_create():
    with pytest.raises(HTTPException) as excinfo:
        await agents_api._validate_founder_mainline_create_guard(
            SequenceDB(responses=[]),
            SimpleNamespace(
                primary_model_id=None,
                template_id=None,
                founder_mainline_guard=SimpleNamespace(
                    recommendation_applied=True,
                    can_enter_deploy_prep=False,
                    blocker_reason_zh="draft not confirmed",
                    missing_items=["confirm current draft", "fill approval boundaries"],
                    user_confirmed=False,
                    scenario_id="cn-team-global-content-knowledge",
                    resolved_template_keys=["founder-copilot"],
                    resolved_pack_ids=["founder-strategy-pack"],
                    approval_boundaries=["formal commitments require human review"],
                ),
            ),
        )

    assert excinfo.value.status_code == 409
    assert UNREADY_CONFIRMATION_MESSAGE in str(excinfo.value.detail)


@pytest.mark.asyncio
async def test_validate_founder_mainline_create_guard_allows_manual_or_ready_create():
    await agents_api._validate_founder_mainline_create_guard(
        SequenceDB(responses=[]),
        SimpleNamespace(
            primary_model_id=None,
            template_id=None,
            founder_mainline_guard=SimpleNamespace(
                recommendation_applied=False,
                can_enter_deploy_prep=False,
                blocker_reason_zh="",
                missing_items=[],
                user_confirmed=False,
                scenario_id="cn-team-global-content-knowledge",
                resolved_template_keys=[],
                resolved_pack_ids=[],
                approval_boundaries=[],
            ),
        ),
    )


@pytest.mark.asyncio
async def test_validate_founder_mainline_create_guard_derives_template_context_when_missing():
    await agents_api._validate_founder_mainline_create_guard(
        SequenceDB(
            responses=[
                DummyScalarResult([SimpleNamespace(name="Founder Copilot")]),
                DummyScalarResult(
                    [SimpleNamespace(enabled=True, provider="openai", model="gpt-4o-mini", base_url=None)]
                ),
            ]
        ),
        SimpleNamespace(
            role_description=GROWTH_TEAM_BRIEF,
            primary_model_id=uuid.uuid4(),
            template_id=uuid.uuid4(),
            founder_mainline_guard=SimpleNamespace(
                recommendation_applied=True,
                can_enter_deploy_prep=True,
                blocker_reason_zh="",
                missing_items=[],
                user_confirmed=True,
                scenario_id="cn-team-global-content-knowledge",
                resolved_template_keys=[],
                resolved_pack_ids=[],
                approval_boundaries=[],
            ),
        ),
    )


@pytest.mark.asyncio
async def test_validate_founder_mainline_create_guard_blocks_template_drift():
    with pytest.raises(HTTPException) as excinfo:
        await agents_api._validate_founder_mainline_create_guard(
            SequenceDB(
                responses=[
                    DummyScalarResult([SimpleNamespace(name="Customer Follow-up Lead")]),
                    DummyScalarResult(
                        [SimpleNamespace(enabled=True, provider="openai", model="gpt-4o-mini", base_url=None)]
                    ),
                ]
            ),
            SimpleNamespace(
                role_description=FOLLOWUP_BRIEF,
                primary_model_id=uuid.uuid4(),
                template_id=uuid.uuid4(),
                founder_mainline_guard=SimpleNamespace(
                    recommendation_applied=True,
                    can_enter_deploy_prep=True,
                    blocker_reason_zh="",
                    missing_items=[],
                    user_confirmed=True,
                    scenario_id="cn-team-global-content-knowledge",
                    resolved_template_keys=[],
                    resolved_pack_ids=[],
                    approval_boundaries=[],
                    answers=[],
                    correction_notes=REMOVE_CUSTOMER_TEAM_NOTES,
                ),
            ),
        )

    assert excinfo.value.status_code == 409
    assert TEMPLATE_MISALIGNED_MESSAGE in str(excinfo.value.detail)

    await agents_api._validate_founder_mainline_create_guard(
        SequenceDB(
            responses=[
                DummyScalarResult([SimpleNamespace(name="Founder Copilot")]),
                DummyScalarResult(
                    [SimpleNamespace(enabled=True, provider="openai", model="gpt-4o-mini", base_url=None)]
                ),
            ]
        ),
        SimpleNamespace(
            role_description=FOLLOWUP_BRIEF,
            primary_model_id=uuid.uuid4(),
            template_id=uuid.uuid4(),
            founder_mainline_guard=SimpleNamespace(
                recommendation_applied=True,
                can_enter_deploy_prep=True,
                blocker_reason_zh="",
                missing_items=[],
                user_confirmed=True,
                scenario_id="cn-team-global-content-knowledge",
                resolved_template_keys=[],
                resolved_pack_ids=[],
                approval_boundaries=[],
                answers=[],
                correction_notes=REMOVE_CUSTOMER_TEAM_NOTES,
            ),
        ),
    )
