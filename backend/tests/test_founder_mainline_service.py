from app.services.founder_mainline_service import generate_founder_mainline_draft_plan


def _ready_answers():
    return [
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
    ]


def _ready_model_context():
    return {
        "resolved_provider": "openai-compatible",
        "recommended_model": "gpt-4.1-mini",
        "normalized_base_url": "https://example.com/v1",
    }


def test_generate_founder_mainline_draft_plan_resolves_founder_and_pack():
    plan = generate_founder_mainline_draft_plan(
        "Chinese-first knowledge business with \u8ddf\u8fdb, \u54a8\u8be2, and \u8f6c\u5316 needs.",
    )

    assert plan.plan_status == "plan_draft_ready"
    assert plan.founder_copilot.canonical_name == "Founder Copilot"

    template_names = {item.canonical_name for item in plan.template_recommendations}
    assert "Founder Copilot" in template_names

    pack_ids = {item.pack_id for item in plan.skill_pack_recommendations}
    assert "founder-strategy-pack" in pack_ids

    team_ids = {team.team_id for team in plan.teams}
    assert "content-growth" in team_ids
    assert "customer-success" in team_ids

    assert plan.deployment_readiness.can_enter_deploy_prep is False


def test_generate_founder_mainline_draft_plan_uses_structured_answers_to_refine_recommendations():
    plan = generate_founder_mainline_draft_plan(
        "Chinese-first knowledge business.",
        answers=[
            {"group_id": "conversion_sales_model", "answer_text": "Use content first, then \u8ddf\u8fdb \u54a8\u8be2 conversion."},
            {"group_id": "team_gap_role_preference", "answer_text": "The biggest gap is \u8ddf\u8fdb \u8f6c\u5316."},
            {"group_id": "content_language_requirements", "answer_text": "Chinese-English bilingual output."},
        ],
    )

    team_ids = {team.team_id for team in plan.teams}
    assert "customer-success" in team_ids
    assert not any("\u53cc\u8bed" in item for item in plan.open_questions)


def test_generate_founder_mainline_draft_plan_applies_correction_notes():
    plan = generate_founder_mainline_draft_plan(
        "Chinese-first global knowledge business with \u8ddf\u8fdb, \u54a8\u8be2, and \u8f6c\u5316 needs.",
        model_ready_context=_ready_model_context(),
        answers=_ready_answers(),
        correction_notes=(
            "\u5ba2\u670d\u5148\u4e0d\u8981\u5355\u72ec\u6210\u961f\uff0c"
            "\u6211\u66f4\u60f3\u5148\u628a\u53cc\u8bed\u5185\u5bb9\u548c\u6d77\u5916\u5206\u53d1\u505a\u597d\u3002"
            "Founder \u8fd8\u8981\u66f4\u504f\u589e\u957f\uff0c\u4e0d\u53ea\u662f\u89c4\u5212\u3002"
        ),
    )

    team_ids = {team.team_id for team in plan.teams}
    template_keys = {item.template_key for item in plan.template_recommendations}
    pack_ids = {item.pack_id for item in plan.skill_pack_recommendations}

    assert plan.plan_status == "plan_draft_ready"
    assert plan.previous_plan_summary_zh
    assert len(plan.change_summary_zh) >= 3
    assert "customer-success" not in team_ids
    assert "customer-followup-lead" not in template_keys
    assert "customer-followup-pack" not in pack_ids
    assert "customer-followup-lead" in plan.changed_template_keys
    assert "customer-followup-pack" in plan.changed_pack_ids
    assert "\u589e\u957f" in plan.founder_copilot.primary_goal
    assert any("\u53cc\u8bed" in item for item in plan.change_summary_zh)
    assert any(team.team_id == "content-growth" and team.priority == 1 for team in plan.teams)


def test_generate_founder_mainline_draft_plan_enters_deploy_prep_after_user_confirmation():
    plan = generate_founder_mainline_draft_plan(
        "Chinese-first global knowledge business with \u8ddf\u8fdb, \u54a8\u8be2, and \u8f6c\u5316 needs.",
        model_ready_context=_ready_model_context(),
        answers=_ready_answers(),
        user_confirmed=True,
    )

    assert plan.plan_status == "ready_for_deploy_prep"
    assert plan.deployment_readiness.can_enter_deploy_prep is True
    assert plan.deployment_readiness.blocker_reason_zh == ""
    assert plan.deployment_readiness.missing_items == []
