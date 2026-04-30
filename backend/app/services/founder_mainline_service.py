from __future__ import annotations

from collections import OrderedDict

from app.duoduo.skill_packs import (
    FIRST_SCENARIO_ID,
    SAAS_OPS_SCENARIO_ID,
    get_scenario_name_zh,
    list_skill_packs,
)
from app.duoduo.template_library import get_template_library_catalog
from app.schemas.founder_mainline import (
    FounderMainlineDeploymentReadiness,
    FounderMainlineDraftPlan,
    FounderMainlineInterviewAnswer,
    FounderMainlineInterviewProgress,
    FounderMainlineInterviewQuestion,
    FounderMainlineModelReadyContext,
    FounderMainlineRelationship,
    FounderMainlineRolePlan,
    FounderMainlineSkillPackRecommendation,
    FounderMainlineTeamPlan,
    FounderMainlineTemplateRecommendation,
    FounderMainlineTraceability,
)


INTERVIEW_QUESTION_BANK: OrderedDict[str, tuple[str, str]] = OrderedDict(
    [
        (
            "market_target_users",
            (
                "你们当前最想服务的目标用户是谁？是海外华人、国内出海团队，还是更广泛的全球用户？",
                "明确第一批用户画像，避免团队方案过早发散。",
            ),
        ),
        (
            "core_product_service",
            (
                "你们核心准备卖什么？是训练营、咨询服务、订阅内容，还是其他产品形态？",
                "锁定主产品，才能推导团队与模板组合。",
            ),
        ),
        (
            "acquisition_distribution_channels",
            (
                "你们准备主要通过哪些渠道获客和分发？比如短视频、图文、邮件、社群。",
                "明确增长链路，决定内容与分发角色的优先级。",
            ),
        ),
        (
            "conversion_sales_model",
            (
                "用户从看到内容到付费，准备走什么转化链路？比如私聊咨询、训练营报名、订阅付费。",
                "明确成交方式，判断是否需要跟进和销售承接角色。",
            ),
        ),
        (
            "delivery_service_model",
            (
                "成交后的交付方式是什么？是直播、录播、社群陪跑，还是一对一服务？",
                "决定交付协作和运营支撑方式。",
            ),
        ),
        (
            "content_language_requirements",
            (
                "内容输出需要中文优先、双语，还是多语种？",
                "保证方案对中文团队和海外场景都足够友好。",
            ),
        ),
        (
            "automation_human_boundary",
            (
                "哪些环节可以自动化，哪些环节必须保留人工审核或人工交付？",
                "提前划清自动化边界，避免部署前返工。",
            ),
        ),
        (
            "team_gap_role_preference",
            (
                "当前团队最缺哪类角色？你更想优先补内容、分发、跟进，还是项目推进？",
                "帮助主链优先推荐第一批团队和角色。",
            ),
        ),
    ]
)

EXPLICIT_UNKNOWN_VALUES = {"unknown", "未知", "暂不确定", "暂时不确定", "待确认"}
EXPLICIT_UNKNOWN_MARKERS = (
    "不清楚",
    "不确定",
    "不明确",
    "待确认",
    "未知",
    "没想清楚",
    "还没想好",
)
BLOCKING_OPEN_QUESTION_GROUPS = (
    "market_target_users",
    "core_product_service",
    "acquisition_distribution_channels",
    "conversion_sales_model",
    "automation_human_boundary",
)
MULTILINGUAL_SIGNALS = ("双语", "多语", "英文", "中英", "英语", "本地化")
CORRECTION_REMOVE_CUSTOMER_TEAM_MARKERS = ("不要单独成队", "先不要单独成队", "不用单独成队")
CORRECTION_BILINGUAL_MARKERS = ("双语", "多语")
CORRECTION_DISTRIBUTION_PRIORITY_MARKERS = ("海外分发", "分发做好", "优先分发", "多渠道")
CORRECTION_FOUNDER_GROWTH_MARKERS = ("更偏增长", "增长", "转化")
SAAS_OPS_SCENARIO_MARKERS = (
    "saas",
    "b2b",
    "subscription",
    "workflow",
    "workflows",
    "crm",
    "product-led",
    "onboarding",
    "软件",
    "订阅",
    "自动化",
    "工作流",
    "客户成功",
    "表格",
    "看板",
)


def _find_template_by_name(role_templates: list[dict], canonical_name: str) -> dict:
    for item in role_templates:
        if item.get("canonical_name") == canonical_name:
            return item
    raise ValueError(f"template not found: {canonical_name}")


def _dedupe_keep_order(values: list[str]) -> list[str]:
    return list(OrderedDict.fromkeys(values).keys())


def _contains_any(text: str, markers: tuple[str, ...]) -> bool:
    return any(marker in text for marker in markers)


def _select_founder_scenario_id(
    *,
    explicit_scenario_id: str | None,
    business_context: str,
) -> str:
    if explicit_scenario_id:
        return explicit_scenario_id

    normalized_context = (business_context or "").casefold()
    if any(marker.casefold() in normalized_context for marker in SAAS_OPS_SCENARIO_MARKERS):
        return SAAS_OPS_SCENARIO_ID

    return FIRST_SCENARIO_ID


def _has_human_boundary(template_item: dict) -> bool:
    return any("人工" in boundary for boundary in template_item.get("default_boundaries", []))


def _to_role_plan(template_item: dict, reason_zh: str) -> FounderMainlineRolePlan:
    return FounderMainlineRolePlan(
        canonical_name=template_item["canonical_name"],
        display_name_zh=template_item["display_name_zh"],
        role_level=template_item.get("role_level", "lead"),
        role_type=template_item.get("role_type", "general"),
        primary_goal=template_item.get("primary_goal", ""),
        template_key=template_item["template_key"],
        recommended_skill_packs=list(template_item.get("recommended_skill_packs", [])),
        human_approval_required=_has_human_boundary(template_item),
        reason_zh=reason_zh,
    )


def _needs_customer_followup(business_brief: str) -> bool:
    signals = ("跟进", "客服", "私信", "咨询", "转化", "训练营")
    return any(token in business_brief for token in signals)


def _parse_founder_mainline_answers(
    answers: list[FounderMainlineInterviewAnswer | dict] | None,
) -> list[FounderMainlineInterviewAnswer]:
    return [FounderMainlineInterviewAnswer.model_validate(item) for item in (answers or [])]


def _build_answer_map(
    answers: list[FounderMainlineInterviewAnswer],
) -> dict[str, FounderMainlineInterviewAnswer]:
    answer_map: dict[str, FounderMainlineInterviewAnswer] = {}
    for item in answers:
        if (
            item.group_id in INTERVIEW_QUESTION_BANK
            and _answer_covers_group(item)
            and not _is_answer_explicitly_unknown(item)
        ):
            answer_map[item.group_id] = item
    return answer_map


def _combine_business_context(
    business_brief: str,
    answers: list[FounderMainlineInterviewAnswer],
) -> str:
    answer_texts = [item.answer_text.strip() for item in answers if _answer_covers_group(item)]
    return " ".join([business_brief, *answer_texts]).strip()


def _needs_multilingual_followup(
    business_brief: str,
    answer_map: dict[str, FounderMainlineInterviewAnswer],
) -> bool:
    language_answer = answer_map.get("content_language_requirements")
    if language_answer and any(token in language_answer.answer_text for token in MULTILINGUAL_SIGNALS):
        return False
    return "海外" in business_brief and not any(token in business_brief for token in MULTILINGUAL_SIGNALS)


def _build_draft_plan_open_questions(
    business_brief: str,
    answer_map: dict[str, FounderMainlineInterviewAnswer],
) -> list[str]:
    open_questions: list[str] = []

    if answer_map:
        missing_groups = [
            group_id
            for group_id in INTERVIEW_QUESTION_BANK
            if group_id not in answer_map
        ]
        open_questions.extend([item.question_zh for item in _build_next_questions(missing_groups)])

    if not answer_map and _needs_multilingual_followup(business_brief, answer_map):
        open_questions.append("是否需要把核心内容链路扩展为双语或多语输出？")

    return open_questions


def _is_step0_ready(model_ready_context: FounderMainlineModelReadyContext) -> bool:
    return bool(model_ready_context.resolved_provider and model_ready_context.recommended_model)


def _is_explicit_unknown_text(answer_text: str) -> bool:
    normalized_text = (answer_text or "").strip().lower()
    if not normalized_text:
        return False
    return normalized_text in EXPLICIT_UNKNOWN_VALUES or any(
        marker in normalized_text for marker in EXPLICIT_UNKNOWN_MARKERS
    )


def _is_answer_explicitly_unknown(answer: FounderMainlineInterviewAnswer) -> bool:
    return answer.is_unknown or _is_explicit_unknown_text(answer.answer_text)


def _answer_covers_group(answer: FounderMainlineInterviewAnswer) -> bool:
    normalized_text = answer.answer_text.strip()
    if _is_answer_explicitly_unknown(answer):
        return True
    if not normalized_text:
        return False
    return bool(normalized_text)


def _build_blocking_open_groups(
    answers: list[FounderMainlineInterviewAnswer],
) -> list[str]:
    blocking_groups: list[str] = []
    answer_map = {item.group_id: item for item in answers if item.group_id in INTERVIEW_QUESTION_BANK}
    for group_id in BLOCKING_OPEN_QUESTION_GROUPS:
        answer = answer_map.get(group_id)
        if answer and _is_answer_explicitly_unknown(answer):
            blocking_groups.append(group_id)
    return blocking_groups


def _build_next_questions(missing_groups: list[str]) -> list[FounderMainlineInterviewQuestion]:
    questions: list[FounderMainlineInterviewQuestion] = []
    for group_id in missing_groups[:3]:
        question_zh, intent_zh = INTERVIEW_QUESTION_BANK[group_id]
        questions.append(
            FounderMainlineInterviewQuestion(
                group_id=group_id,
                question_zh=question_zh,
                intent_zh=intent_zh,
            )
        )
    return questions


def _reprioritize_teams(
    teams: list[FounderMainlineTeamPlan],
    preferred_team_ids: list[str],
) -> list[FounderMainlineTeamPlan]:
    ordered: list[FounderMainlineTeamPlan] = []
    seen: set[str] = set()
    for team_id in preferred_team_ids:
        for team in teams:
            if team.team_id == team_id and team.team_id not in seen:
                ordered.append(team)
                seen.add(team.team_id)
    for team in teams:
        if team.team_id in seen:
            continue
        ordered.append(team)
        seen.add(team.team_id)
    for index, team in enumerate(ordered, start=1):
        team.priority = index
    return ordered


def _collect_template_keys(plan: FounderMainlineDraftPlan) -> list[str]:
    return [item.template_key for item in plan.template_recommendations]


def _collect_pack_ids(plan: FounderMainlineDraftPlan) -> list[str]:
    return [item.pack_id for item in plan.skill_pack_recommendations]


def _evaluate_deployment_readiness(
    plan: FounderMainlineDraftPlan,
    *,
    model_ready_context: FounderMainlineModelReadyContext,
    scenario_id: str,
    user_confirmed: bool,
) -> FounderMainlineDraftPlan:
    missing_items: list[str] = []

    if not user_confirmed:
        missing_items.append("等待用户明确确认当前方案")

    if not _is_step0_ready(model_ready_context):
        missing_items.append("模型中心当前未处于可用状态")

    empty_team_names = [team.team_name_zh for team in plan.teams if not team.roles]
    if empty_team_names:
        missing_items.append(f"以下团队仍缺少可映射角色：{'、'.join(empty_team_names)}")

    valid_template_keys = {item["template_key"] for item in get_template_library_catalog().get("role_templates", [])}
    if any(item not in valid_template_keys for item in plan.deployment_readiness.resolved_template_keys):
        missing_items.append("仍有模板推荐无法映射到当前 catalog")

    valid_pack_ids = {item["pack_id"] for item in list_skill_packs(scenario=scenario_id)}
    if any(item not in valid_pack_ids for item in plan.deployment_readiness.resolved_pack_ids):
        missing_items.append("仍有能力包推荐无法映射到当前 catalog")

    if not plan.approval_boundaries:
        missing_items.append("需要人工审批的边界尚未明确")

    plan.deployment_readiness.can_enter_deploy_prep = not missing_items
    plan.deployment_readiness.missing_items = missing_items
    plan.deployment_readiness.blocker_reason_zh = (
        ""
        if not missing_items
        else "当前方案尚未满足部署准备门槛，请先补齐以下项目。"
    )
    plan.plan_status = "ready_for_deploy_prep" if not missing_items else "plan_draft_ready"
    return plan


def _apply_founder_mainline_correction(
    plan: FounderMainlineDraftPlan,
    correction_notes: str,
) -> FounderMainlineDraftPlan:
    notes = (correction_notes or "").strip()
    if not notes:
        return plan

    previous_template_keys = set(_collect_template_keys(plan))
    previous_pack_ids = set(_collect_pack_ids(plan))
    plan.previous_plan_summary_zh = str(plan.company_blueprint.get("summary_zh", "")).strip()
    change_summary: list[str] = []

    remove_customer_team = (
        _contains_any(notes, CORRECTION_REMOVE_CUSTOMER_TEAM_MARKERS)
        and _contains_any(notes, ("客服", "跟进"))
    )
    wants_bilingual = _contains_any(notes, CORRECTION_BILINGUAL_MARKERS)
    wants_distribution_priority = _contains_any(notes, CORRECTION_DISTRIBUTION_PRIORITY_MARKERS)
    wants_founder_growth = _contains_any(notes, CORRECTION_FOUNDER_GROWTH_MARKERS)

    if remove_customer_team:
        plan.teams = [team for team in plan.teams if team.team_id != "customer-success"]
        plan.template_recommendations = [
            item for item in plan.template_recommendations if item.template_key != "customer-followup-lead"
        ]
        plan.skill_pack_recommendations = [
            item for item in plan.skill_pack_recommendations if item.pack_id != "customer-followup-pack"
        ]
        plan.deployment_readiness.resolved_template_keys = [
            item for item in plan.deployment_readiness.resolved_template_keys if item != "customer-followup-lead"
        ]
        plan.deployment_readiness.resolved_pack_ids = [
            item for item in plan.deployment_readiness.resolved_pack_ids if item != "customer-followup-pack"
        ]
        plan.company_blueprint["priority_focus"] = [
            item for item in plan.company_blueprint.get("priority_focus", []) if item != "用户跟进"
        ]
        change_summary.append("按本轮纠偏，撤回独立的用户跟进团队，并同步移除其模板与技能包推荐。")

    if wants_bilingual or wants_distribution_priority:
        priority_focus = list(plan.company_blueprint.get("priority_focus", []))
        if wants_bilingual and "双语内容" not in priority_focus:
            priority_focus.insert(0, "双语内容")
        if wants_distribution_priority and "海外分发" not in priority_focus:
            priority_focus.insert(0, "海外分发")
        plan.company_blueprint["priority_focus"] = _dedupe_keep_order(priority_focus)

        for team in plan.teams:
            if team.team_id != "content-growth":
                continue
            if wants_bilingual and wants_distribution_priority:
                team.team_goal = "负责双语内容策划、内容生产与海外分发适配。"
            elif wants_bilingual:
                team.team_goal = "负责双语内容策划、内容生产与内容链路改写。"
            elif wants_distribution_priority:
                team.team_goal = "负责内容策划、内容生产与海外分发优先推进。"
            for role in team.roles:
                if role.canonical_name == "Content Strategy Lead" and wants_bilingual:
                    role.primary_goal = "围绕中文业务目标产出双语内容选题、结构、脚本和内容初稿。"
                    role.reason_zh = f"{role.reason_zh} 本轮纠偏要求优先双语内容。".strip()
                if role.canonical_name == "Global Distribution Lead" and wants_distribution_priority:
                    role.primary_goal = "针对不同海外渠道输出分发版本、节奏、复盘建议与渠道适配。"
                    role.reason_zh = f"{role.reason_zh} 本轮纠偏要求优先海外分发。".strip()

        if wants_bilingual and wants_distribution_priority:
            change_summary.append("内容增长团队调整为优先双语内容与海外分发。")
        elif wants_bilingual:
            change_summary.append("内容增长团队已改为优先双语内容输出。")
        elif wants_distribution_priority:
            change_summary.append("海外分发优先级上调，内容增长团队前移。")

    if wants_distribution_priority:
        plan.teams = _reprioritize_teams(plan.teams, ["content-growth", "founder-office", "customer-success"])

    if wants_founder_growth:
        plan.founder_copilot.primary_goal = "把中文业务目标拆成兼顾增长、转化和阶段执行的可落地团队方案。"
        plan.founder_copilot.reason_zh = "本轮纠偏要求 Founder 更偏增长与转化，而不只做规划。"
        for team in plan.teams:
            if team.team_id != "founder-office":
                continue
            team.team_goal = "负责增长优先级判断、业务拆解与跨团队推进。"
            for role in team.roles:
                if role.canonical_name == "Founder Copilot":
                    role.primary_goal = plan.founder_copilot.primary_goal
                    role.reason_zh = plan.founder_copilot.reason_zh
        change_summary.append("Founder Copilot 已调整为更偏增长与转化推进。")

    if change_summary:
        team_names = "、".join(team.team_name_zh for team in plan.teams)
        plan.company_blueprint["summary_zh"] = (
            f"基于上一版方案和本轮纠偏，当前优先形成覆盖 {team_names} 的修订版团队草案。"
        )

    plan.change_summary_zh = _dedupe_keep_order(change_summary)
    plan.changed_template_keys = sorted(previous_template_keys.symmetric_difference(set(_collect_template_keys(plan))))
    plan.changed_pack_ids = sorted(previous_pack_ids.symmetric_difference(set(_collect_pack_ids(plan))))
    plan.traceability.append(
        FounderMainlineTraceability(
            source_text=notes,
            extracted_signal="用户纠偏要求",
            mapped_entity_type="correction",
            mapped_entity_key="founder-mainline-correction",
        )
    )
    return plan


def build_founder_mainline_interview_progress(
    business_brief: str,
    *,
    model_ready_context: FounderMainlineModelReadyContext | dict | None,
    answers: list[FounderMainlineInterviewAnswer | dict] | None = None,
) -> FounderMainlineInterviewProgress:
    brief = (business_brief or "").strip()
    if not brief:
        raise ValueError("business_brief must not be empty")

    parsed_model_ready_context = FounderMainlineModelReadyContext.model_validate(model_ready_context or {})
    parsed_answers = _parse_founder_mainline_answers(answers)

    answered_groups = []
    for item in parsed_answers:
        if item.group_id not in INTERVIEW_QUESTION_BANK:
            continue
        if _answer_covers_group(item):
            answered_groups.append(item.group_id)
    answered_groups = _dedupe_keep_order(answered_groups)

    missing_groups = [
        group_id
        for group_id in INTERVIEW_QUESTION_BANK
        if group_id not in answered_groups
    ]
    blocking_open_groups = _build_blocking_open_groups(parsed_answers)

    if not _is_step0_ready(parsed_model_ready_context):
        plan_status = "step0_blocked"
        next_questions: list[FounderMainlineInterviewQuestion] = []
    elif missing_groups:
        plan_status = "interview_in_progress"
        next_questions = _build_next_questions(missing_groups)
    elif blocking_open_groups:
        plan_status = "blocked_by_open_questions"
        missing_groups = blocking_open_groups
        next_questions = _build_next_questions(blocking_open_groups)
    else:
        plan_status = "ready_for_plan"
        next_questions = []

    return FounderMainlineInterviewProgress(
        business_brief=brief,
        plan_status=plan_status,
        can_generate_plan=plan_status == "ready_for_plan",
        model_ready_context=parsed_model_ready_context,
        answered_groups=answered_groups,
        missing_groups=missing_groups,
        next_questions=next_questions,
    )


def generate_founder_mainline_draft_plan(
    business_brief: str,
    *,
    locale: str = "zh-CN",
    scenario_id: str | None = None,
    model_ready_context: FounderMainlineModelReadyContext | dict | None = None,
    answers: list[FounderMainlineInterviewAnswer | dict] | None = None,
    correction_notes: str | None = None,
    user_confirmed: bool = False,
) -> FounderMainlineDraftPlan:
    brief = (business_brief or "").strip()
    if not brief:
        raise ValueError("business_brief must not be empty")

    parsed_model_ready_context = FounderMainlineModelReadyContext.model_validate(model_ready_context or {})
    parsed_answers = _parse_founder_mainline_answers(answers)
    answer_map = _build_answer_map(parsed_answers)
    combined_context = _combine_business_context(brief, parsed_answers)
    active_scenario_id = _select_founder_scenario_id(
        explicit_scenario_id=scenario_id,
        business_context=combined_context,
    )

    catalog = get_template_library_catalog()
    role_templates = list(catalog.get("role_templates", []))

    founder = _find_template_by_name(role_templates, "Founder Copilot")
    content = _find_template_by_name(role_templates, "Content Strategy Lead")
    distribution = _find_template_by_name(role_templates, "Global Distribution Lead")
    project = _find_template_by_name(role_templates, "Project Chief of Staff")

    if active_scenario_id == SAAS_OPS_SCENARIO_ID:
        customer = _find_template_by_name(role_templates, "Customer Follow-up Lead")
        selected_templates = [founder, project, customer, content]
    elif _needs_customer_followup(combined_context):
        customer = _find_template_by_name(role_templates, "Customer Follow-up Lead")
        selected_templates = [founder, content, distribution, project, customer]
    else:
        customer = None
        selected_templates = [founder, content, distribution, project]

    packs_by_id = {item["pack_id"]: item for item in list_skill_packs(scenario=active_scenario_id)}

    recommended_pack_ids = _dedupe_keep_order(
        [
            pack_id
            for template_item in selected_templates
            for pack_id in template_item.get("recommended_skill_packs", [])
            if pack_id in packs_by_id
        ]
    )

    if "founder-strategy-pack" in packs_by_id and "founder-strategy-pack" not in recommended_pack_ids:
        recommended_pack_ids.insert(0, "founder-strategy-pack")

    template_recommendations = [
        FounderMainlineTemplateRecommendation(
            template_key=item["template_key"],
            canonical_name=item["canonical_name"],
            display_name_zh=item["display_name_zh"],
            reason_zh=f"基于当前业务 brief，为首版主链方案引入 {item['display_name_zh']}。",
        )
        for item in selected_templates
    ]

    skill_pack_recommendations = []
    for pack_id in recommended_pack_ids:
        pack = packs_by_id[pack_id]
        skill_pack_recommendations.append(
            FounderMainlineSkillPackRecommendation(
                pack_id=pack["pack_id"],
                display_name_zh=pack["display_name_zh"],
                reason_zh=f"该技能包用于支撑当前草案中的核心业务链路：{pack.get('business_goal', '')}",
                recommended_for_roles=pack.get("recommended_roles", []),
            )
        )

    if active_scenario_id == SAAS_OPS_SCENARIO_ID:
        teams = [
            FounderMainlineTeamPlan(
                team_id="founder-office",
                team_name_zh="创始人办公室",
                team_goal="负责产品定位、订阅路径、人工审批边界和阶段优先级判断。",
                priority=1,
                roles=[
                    _to_role_plan(founder, "作为主控角色，负责把 SaaS / 自动化目标拆成可运行的首版公司骨架。"),
                ],
            ),
            FounderMainlineTeamPlan(
                team_id="product-ops",
                team_name_zh="产品运营自动化团队",
                team_goal="负责把表格、CRM、客户成功和重复运营动作整理成可执行工作流。",
                priority=2,
                roles=[
                    _to_role_plan(project, "作为产品运营督办角色，负责把自动化目标拆成上线、复盘和迭代节奏。"),
                    _to_role_plan(customer, "SaaS 业务需要 onboarding、客户成功和续费反馈闭环。"),
                ],
            ),
            FounderMainlineTeamPlan(
                team_id="demand-generation",
                team_name_zh="产品获客内容团队",
                team_goal="负责把产品价值、案例和自动化场景转成可复用的演示与获客内容。",
                priority=3,
                roles=[
                    _to_role_plan(content, "SaaS 业务仍需要把产品场景转译成 demo、案例和转化内容。"),
                ],
            ),
        ]
    else:
        teams = [
            FounderMainlineTeamPlan(
                team_id="founder-office",
                team_name_zh="创始人办公室",
                team_goal="负责业务拆解、优先级判断与跨团队推进。",
                priority=1,
                roles=[
                    _to_role_plan(founder, "作为主控角色，负责把业务 brief 转成首版团队草案。"),
                    _to_role_plan(project, "作为督办角色，负责把主控决策拆成可执行推进项。"),
                ],
            ),
            FounderMainlineTeamPlan(
                team_id="content-growth",
                team_name_zh="内容增长团队",
                team_goal="负责内容策划、内容生产与海外分发。",
                priority=2,
                roles=[
                    _to_role_plan(content, "围绕内容获客链路生成选题、结构和内容初稿。"),
                    _to_role_plan(distribution, "围绕海外分发链路生成渠道适配和复盘建议。"),
                ],
            ),
        ]

        if customer is not None:
            teams.append(
                FounderMainlineTeamPlan(
                    team_id="customer-success",
                    team_name_zh="用户跟进团队",
                    team_goal="负责线索跟进、常见问题沉淀和转化承接。",
                    priority=3,
                    roles=[
                        _to_role_plan(customer, "用户明确提到跟进、咨询或转化，需保留客户跟进能力。"),
                    ],
                )
            )

    approval_boundaries = _dedupe_keep_order(
        [
            boundary
            for item in selected_templates
            for boundary in item.get("default_boundaries", [])
        ]
    )

    if active_scenario_id == SAAS_OPS_SCENARIO_ID:
        priority_focus = ["产品自动化", "客户成功", "运营报告", "需求验证"]
        relationships = [
            FounderMainlineRelationship(
                from_role="Founder Copilot",
                to_role="Project Chief of Staff",
                relationship_type="plan_to_delivery",
                handoff_rule_zh="Founder Copilot 负责产品定位和订阅路径，项目督办负责人接手上线节奏与运营闭环。",
                escalation_rule_zh="涉及收费、权限、生产数据变更或正式承诺时回到 Founder Copilot 和人工确认。",
            ),
            FounderMainlineRelationship(
                from_role="Project Chief of Staff",
                to_role="Customer Follow-up Lead",
                relationship_type="delivery_to_feedback",
                handoff_rule_zh="项目督办负责人把 onboarding 与自动化工作流交给客户成功负责人跟进反馈。",
                escalation_rule_zh="续费、退款、权限和客户承诺问题必须人工接管。",
            ),
            FounderMainlineRelationship(
                from_role="Customer Follow-up Lead",
                to_role="Content Strategy Lead",
                relationship_type="feedback_to_content",
                handoff_rule_zh="客户成功负责人沉淀高频需求，内容负责人转成 demo、案例和产品说明。",
                escalation_rule_zh="涉及客户隐私或未公开案例时必须人工审批。",
            ),
        ]
    else:
        priority_focus = ["内容策划", "内容生产", "海外分发", "项目督办"]
        if customer is not None:
            priority_focus.append("用户跟进")

        relationships = [
            FounderMainlineRelationship(
                from_role="Founder Copilot",
                to_role="Content Strategy Lead",
                relationship_type="goal_to_execution",
                handoff_rule_zh="Founder Copilot 负责目标拆解，内容策划负责人接手选题和结构设计。",
                escalation_rule_zh="涉及品牌承诺或高风险表达时回到 Founder Copilot 审核。",
            ),
            FounderMainlineRelationship(
                from_role="Content Strategy Lead",
                to_role="Global Distribution Lead",
                relationship_type="content_to_distribution",
                handoff_rule_zh="内容策划先产出中文初稿，再交给海外分发负责人做渠道适配。",
                escalation_rule_zh="如渠道要求与原始内容目标冲突，升级给 Founder Copilot。",
            ),
            FounderMainlineRelationship(
                from_role="Founder Copilot",
                to_role="Project Chief of Staff",
                relationship_type="plan_to_delivery",
                handoff_rule_zh="Founder Copilot 给出优先级，项目督办负责人负责推进和复盘。",
                escalation_rule_zh="资源冲突或优先级变化时回到 Founder Copilot。",
            ),
        ]

        if customer is not None:
            relationships.append(
                FounderMainlineRelationship(
                    from_role="Customer Follow-up Lead",
                    to_role="Project Chief of Staff",
                    relationship_type="feedback_to_execution",
                    handoff_rule_zh="用户跟进负责人沉淀高优先级反馈，并同步给项目督办负责人。",
                    escalation_rule_zh="退款、赔付、法律相关问题必须人工接管。",
                )
            )

    open_questions = _build_draft_plan_open_questions(brief, answer_map)

    if active_scenario_id == SAAS_OPS_SCENARIO_ID:
        business_goal = "围绕 SaaS 产品、运营自动化和客户成功生成首版 AI 公司骨架。"
        summary_zh = "基于当前 brief，先生成 Founder 主控、产品运营自动化、客户成功和获客内容的首版团队草案。"
        traceability = [
            FounderMainlineTraceability(
                source_text=combined_context,
                extracted_signal="SaaS / 运营自动化",
                mapped_entity_type="scenario",
                mapped_entity_key=active_scenario_id,
            ),
            FounderMainlineTraceability(
                source_text=combined_context,
                extracted_signal="产品运营自动化 + 客户成功",
                mapped_entity_type="team",
                mapped_entity_key="founder-office/product-ops/demand-generation",
            ),
        ]
    else:
        business_goal = "围绕中文团队的出海内容 / 知识付费业务生成首版 AI 团队草案。"
        summary_zh = "基于当前 brief，先生成 Founder 主控、内容增长、项目督办以及可选用户跟进的首版团队草案。"
        traceability = [
            FounderMainlineTraceability(
                source_text=brief,
                extracted_signal="出海内容 / 知识付费",
                mapped_entity_type="scenario",
                mapped_entity_key=active_scenario_id,
            ),
            FounderMainlineTraceability(
                source_text=brief,
                extracted_signal="创始人主控 + 内容增长",
                mapped_entity_type="team",
                mapped_entity_key="founder-office/content-growth",
            ),
        ]

    if customer is not None:
        traceability.append(
            FounderMainlineTraceability(
                source_text=brief,
                extracted_signal="跟进 / 咨询 / 转化",
                mapped_entity_type="team",
                mapped_entity_key="customer-success",
            )
        )

    plan = FounderMainlineDraftPlan(
        scenario_id=active_scenario_id,
        scenario_name_zh=get_scenario_name_zh(active_scenario_id),
        locale=locale,
        plan_status="plan_draft_ready",
        company_blueprint={
            "business_goal": business_goal,
            "source_business_brief": brief,
            "summary_zh": summary_zh,
            "priority_focus": priority_focus,
            "answered_groups": list(answer_map.keys()),
            "model_ready": bool(parsed_model_ready_context.resolved_provider and parsed_model_ready_context.recommended_model),
        },
        founder_copilot=_to_role_plan(founder, "作为主链主控角色，负责把业务描述转成可解释团队方案。"),
        teams=teams,
        template_recommendations=template_recommendations,
        skill_pack_recommendations=skill_pack_recommendations,
        coordination_relationships=relationships,
        approval_boundaries=approval_boundaries,
        open_questions=open_questions,
        deployment_readiness=FounderMainlineDeploymentReadiness(
            can_enter_deploy_prep=False,
            blocker_reason_zh="当前仅生成 draft plan，尚未经过用户确认，不进入真实部署。",
            missing_items=["等待用户确认团队结构", "等待用户确认模型与部署参数"],
            resolved_template_keys=[item["template_key"] for item in selected_templates],
            resolved_pack_ids=recommended_pack_ids,
        ),
        traceability=traceability,
    )
    corrected_plan = _apply_founder_mainline_correction(plan, correction_notes or "")
    return _evaluate_deployment_readiness(
        corrected_plan,
        model_ready_context=parsed_model_ready_context,
        scenario_id=active_scenario_id,
        user_confirmed=user_confirmed,
    )
