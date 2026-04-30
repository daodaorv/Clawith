"""Duoduo skill-pack catalog for Chinese-first business scenarios."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

FIRST_SCENARIO_ID = "cn-team-global-content-knowledge"
FIRST_SCENARIO_NAME_ZH = "中文团队做出海内容 / 知识付费业务"
SAAS_OPS_SCENARIO_ID = "cn-saas-ops-automation"
SAAS_OPS_SCENARIO_NAME_ZH = "中文团队做 SaaS / 运营自动化业务"
LOCAL_SERVICE_SCENARIO_ID = "cn-local-service-leadgen"
LOCAL_SERVICE_SCENARIO_NAME_ZH = "中文团队做本地服务获客 / 预约转化业务"

SCENARIO_NAME_ZH_BY_ID = {
    FIRST_SCENARIO_ID: FIRST_SCENARIO_NAME_ZH,
    SAAS_OPS_SCENARIO_ID: SAAS_OPS_SCENARIO_NAME_ZH,
    LOCAL_SERVICE_SCENARIO_ID: LOCAL_SERVICE_SCENARIO_NAME_ZH,
}

_SKILL_PACKS: list[dict[str, Any]] = [
    {
        "pack_id": "founder-strategy-pack",
        "version": "v1",
        "display_name_zh": "创业策略包",
        "display_name_en": "Founder Strategy Pack",
        "business_goal": "把中文业务目标拆成可执行的出海内容、增长与优先级方案。",
        "applicable_scenarios": [FIRST_SCENARIO_ID, SAAS_OPS_SCENARIO_ID, LOCAL_SERVICE_SCENARIO_ID],
        "recommended_roles": ["Founder Copilot"],
        "included_skills": ["web-research", "competitive-analysis", "data-analysis", "content-writing"],
        "required_integrations": [],
        "required_tools": ["llm", "knowledge-base"],
        "default_prompts_or_policies": [
            "默认用中文澄清业务目标，再输出结构化行动方案。",
            "优先给出可执行的阶段拆分和风险提示。",
        ],
        "compatibility_notes": "适合 CEO/Founder 视角，不直接替代具体执行岗位。",
        "risk_level": "medium",
        "acceptance_metrics": [
            "能从中文业务 brief 产出阶段目标、关键任务与优先级。",
            "能指出资料缺口并要求继续补充，而不是直接幻觉填空。",
        ],
        "status": "internal-preview",
    },
    {
        "pack_id": "content-production-pack",
        "version": "v1",
        "display_name_zh": "内容生产包",
        "display_name_en": "Content Production Pack",
        "business_goal": "完成选题、资料整理、结构化写作与内容初稿生成。",
        "applicable_scenarios": [FIRST_SCENARIO_ID, SAAS_OPS_SCENARIO_ID, LOCAL_SERVICE_SCENARIO_ID],
        "recommended_roles": ["Content Strategy Lead", "Global Distribution Lead"],
        "included_skills": ["content-writing", "web-research", "competitive-analysis"],
        "required_integrations": [],
        "required_tools": ["llm", "knowledge-base"],
        "default_prompts_or_policies": [
            "默认输出中文提纲、中文初稿和发布建议。",
            "需要引用观点时优先给出来源线索或待核实标记。",
        ],
        "compatibility_notes": "适合内容策划和脚本撰写，不替代人工审稿。",
        "risk_level": "medium",
        "acceptance_metrics": [
            "能生成结构清晰的中文内容提纲。",
            "能把 research 和 copy 统一到同一条工作链里。",
        ],
        "status": "internal-preview",
    },
    {
        "pack_id": "global-distribution-pack",
        "version": "v1",
        "display_name_zh": "海外分发包",
        "display_name_en": "Global Distribution Pack",
        "business_goal": "支持渠道筛选、差异化分发文案和分发结果复盘。",
        "applicable_scenarios": [FIRST_SCENARIO_ID],
        "recommended_roles": ["Global Distribution Lead"],
        "included_skills": ["content-writing", "competitive-analysis", "data-analysis"],
        "required_integrations": [],
        "required_tools": ["llm", "analytics"],
        "default_prompts_or_policies": [
            "先区分渠道，再输出对应版本文案。",
            "分发建议必须包含复盘指标。",
        ],
        "compatibility_notes": "当前是内容与分析导向，不直接执行外部发帖。",
        "risk_level": "medium",
        "acceptance_metrics": [
            "至少给出渠道差异化发布建议。",
            "能输出周度复盘要看哪些指标。",
        ],
        "status": "internal-preview",
    },
    {
        "pack_id": "customer-followup-pack",
        "version": "v1",
        "display_name_zh": "客服跟单包",
        "display_name_en": "Customer Follow-up Pack",
        "business_goal": "整理用户反馈、跟进线索并沉淀常见问题处理话术。",
        "applicable_scenarios": [FIRST_SCENARIO_ID, SAAS_OPS_SCENARIO_ID, LOCAL_SERVICE_SCENARIO_ID],
        "recommended_roles": ["Customer Follow-up Lead"],
        "included_skills": ["content-writing", "data-analysis"],
        "required_integrations": [],
        "required_tools": ["llm", "crm"],
        "default_prompts_or_policies": [
            "默认先归类问题，再输出跟进动作。",
            "所有用户沟通文案默认中文友好、克制承诺。",
        ],
        "compatibility_notes": "适合售前/售后跟进，不直接执行财务承诺。",
        "risk_level": "medium",
        "acceptance_metrics": [
            "能输出 FAQ、分级处理和下一步动作。",
            "能把线索优先级讲清楚。",
        ],
        "status": "internal-preview",
    },
    {
        "pack_id": "report-output-pack",
        "version": "v1",
        "display_name_zh": "报告输出包",
        "display_name_en": "Report Output Pack",
        "business_goal": "把分散分析结果整理成对管理层可读的中文报告。",
        "applicable_scenarios": [FIRST_SCENARIO_ID, SAAS_OPS_SCENARIO_ID, LOCAL_SERVICE_SCENARIO_ID],
        "recommended_roles": ["Founder Copilot", "Project Chief of Staff"],
        "included_skills": ["data-analysis", "content-writing"],
        "required_integrations": [],
        "required_tools": ["llm", "spreadsheet"],
        "default_prompts_or_policies": [
            "先结论后细节。",
            "所有报告默认中文标题、中文摘要、中文行动建议。",
        ],
        "compatibility_notes": "适合周报、复盘和汇报稿，不替代最终业务审批。",
        "risk_level": "low",
        "acceptance_metrics": [
            "能把原始数据整理成结论清晰的中文报告。",
            "能明确下一步行动建议。",
        ],
        "status": "internal-preview",
    },
]

_PACK_INDEX = {pack["pack_id"]: pack for pack in _SKILL_PACKS}


def get_scenario_name_zh(scenario_id: str | None) -> str:
    """Return a stable display name for a supported founder scenario."""
    return SCENARIO_NAME_ZH_BY_ID.get(scenario_id or FIRST_SCENARIO_ID, FIRST_SCENARIO_NAME_ZH)


def list_skill_packs(*, scenario: str | None = None) -> list[dict[str, Any]]:
    """Return the Duoduo skill-pack catalog."""
    packs = deepcopy(_SKILL_PACKS)
    if scenario:
        packs = [pack for pack in packs if scenario in pack.get("applicable_scenarios", [])]
    return packs


def get_skill_pack(pack_id: str) -> dict[str, Any] | None:
    """Return a single pack definition if present."""
    pack = _PACK_INDEX.get(pack_id)
    return deepcopy(pack) if pack else None


def get_pack_skill_slugs(pack_ids: list[str]) -> list[str]:
    """Resolve pack ids into a de-duplicated skill slug list."""
    ordered: list[str] = []
    seen: set[str] = set()
    for pack_id in pack_ids:
        pack = _PACK_INDEX.get(pack_id)
        if not pack:
            continue
        for slug in pack.get("included_skills", []):
            if slug in seen:
                continue
            seen.add(slug)
            ordered.append(slug)
    return ordered
