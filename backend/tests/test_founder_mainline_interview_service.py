from app.services.founder_mainline_service import build_founder_mainline_interview_progress


def test_interview_progress_blocks_when_model_step0_not_ready():
    progress = build_founder_mainline_interview_progress(
        business_brief="我们想做出海知识付费内容。",
        model_ready_context={},
    )

    assert progress.plan_status == "step0_blocked"
    assert progress.can_generate_plan is False
    assert "market_target_users" in progress.missing_groups


def test_interview_progress_stays_in_progress_when_required_groups_missing():
    progress = build_founder_mainline_interview_progress(
        business_brief="我们是中文团队，想做出海知识付费内容。",
        model_ready_context={
            "resolved_provider": "openai-compatible",
            "recommended_model": "gpt-4.1-mini",
            "normalized_base_url": "https://example.com/v1",
        },
        answers=[
            {"group_id": "market_target_users", "answer_text": "主要面向海外华人创作者。"},
            {"group_id": "core_product_service", "answer_text": "卖训练营和咨询。"},
        ],
    )

    assert progress.plan_status == "interview_in_progress"
    assert progress.can_generate_plan is False
    assert "acquisition_distribution_channels" in progress.missing_groups
    assert len(progress.next_questions) > 0


def test_interview_progress_becomes_ready_for_plan_when_all_groups_covered():
    progress = build_founder_mainline_interview_progress(
        business_brief="我们是中文团队，想做出海知识付费内容。",
        model_ready_context={
            "resolved_provider": "openai-compatible",
            "recommended_model": "gpt-4.1-mini",
            "normalized_base_url": "https://example.com/v1",
        },
        answers=[
            {"group_id": "market_target_users", "answer_text": "主要面向海外华人创作者。"},
            {"group_id": "core_product_service", "answer_text": "卖训练营和咨询。"},
            {"group_id": "acquisition_distribution_channels", "answer_text": "短视频、图文和邮件。"},
            {"group_id": "conversion_sales_model", "answer_text": "先内容获客，再转训练营和咨询。"},
            {"group_id": "delivery_service_model", "answer_text": "直播加社群交付。"},
            {"group_id": "content_language_requirements", "answer_text": "需要中英双语内容。"},
            {"group_id": "automation_human_boundary", "answer_text": "内容初稿可自动化，正式承诺需人工审批。"},
            {"group_id": "team_gap_role_preference", "answer_text": "最缺内容策划、分发和跟进。"},
        ],
    )

    assert progress.plan_status == "ready_for_plan"
    assert progress.can_generate_plan is True
    assert progress.missing_groups == []
    assert progress.next_questions == []


def test_interview_progress_blocks_when_critical_groups_are_still_unknown():
    progress = build_founder_mainline_interview_progress(
        business_brief="我们是中文团队，想做出海内容。",
        model_ready_context={
            "resolved_provider": "openai-compatible",
            "recommended_model": "gpt-4.1-mini",
            "normalized_base_url": "https://example.com/v1",
        },
        answers=[
            {"group_id": "market_target_users", "answer_text": "不清楚目标用户是谁。"},
            {"group_id": "core_product_service", "answer_text": "暂不确定卖什么。"},
            {"group_id": "acquisition_distribution_channels", "answer_text": "先做短视频和图文。"},
            {"group_id": "conversion_sales_model", "answer_text": "待确认转化方式。"},
            {"group_id": "delivery_service_model", "answer_text": "先用直播和社群。"},
            {"group_id": "content_language_requirements", "answer_text": "先中文，后续可能双语。"},
            {"group_id": "automation_human_boundary", "answer_text": "未知。"},
            {"group_id": "team_gap_role_preference", "answer_text": "最缺内容策划。"},
        ],
    )

    assert progress.plan_status == "blocked_by_open_questions"
    assert progress.can_generate_plan is False
    assert set(progress.missing_groups) == {
        "market_target_users",
        "core_product_service",
        "conversion_sales_model",
        "automation_human_boundary",
    }
    assert {item.group_id for item in progress.next_questions} <= set(progress.missing_groups)
