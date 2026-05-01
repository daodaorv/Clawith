"""Duoduo template-library catalog and builtin runtime templates."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.duoduo.skill_packs import (
    CROSS_BORDER_ECOMMERCE_SCENARIO_ID,
    FIRST_SCENARIO_ID,
    LOCAL_SERVICE_SCENARIO_ID,
    SAAS_OPS_SCENARIO_ID,
    get_pack_skill_slugs,
    get_scenario_name_zh,
    list_skill_packs,
)

GENERAL_FOUNDER_SCENARIOS = [
    FIRST_SCENARIO_ID,
    SAAS_OPS_SCENARIO_ID,
    LOCAL_SERVICE_SCENARIO_ID,
    CROSS_BORDER_ECOMMERCE_SCENARIO_ID,
]

_COMMON_AUTONOMY_POLICY = {
    "read_files": "L1",
    "write_workspace_files": "L1",
    "send_feishu_message": "L2",
    "delete_files": "L2",
    "web_search": "L1",
    "manage_tasks": "L1",
}

_SOURCE_CATALOG: list[dict[str, Any]] = [
    {
        "source_id": "agency-agents",
        "project_name": "agency-agents",
        "source_url": "https://github.com/agency-ai/agents",
        "license": "reference-only",
        "project_type": "role-library",
        "maturity_level": "reference",
        "primary_value": "角色切分与职责边界启发",
        "industry_fit": ["content", "operations"],
        "status": "tracked",
        "notes": "用于角色拆分参考，不直接搬运原始 prompt。",
    },
    {
        "source_id": "contains-studio-agents",
        "project_name": "contains-studio/agents",
        "source_url": "https://github.com/contains-studio/agents",
        "license": "reference-only",
        "project_type": "role-library",
        "maturity_level": "reference",
        "primary_value": "角色命名与工作流组合参考",
        "industry_fit": ["content", "growth"],
        "status": "tracked",
        "notes": "适合做内容型岗位切分参考。",
    },
    {
        "source_id": "metagpt",
        "project_name": "MetaGPT",
        "source_url": "https://github.com/FoundationAgents/MetaGPT",
        "license": "reference-only",
        "project_type": "orchestration-framework",
        "maturity_level": "high",
        "primary_value": "多角色协作拓扑与 handoff 规则",
        "industry_fit": ["strategy", "product"],
        "status": "tracked",
        "notes": "主要用于协作模式提炼。",
    },
    {
        "source_id": "crewai",
        "project_name": "CrewAI",
        "source_url": "https://github.com/crewAIInc/crewAI",
        "license": "reference-only",
        "project_type": "orchestration-framework",
        "maturity_level": "high",
        "primary_value": "分工、协同、任务流启发",
        "industry_fit": ["operations", "delivery"],
        "status": "tracked",
        "notes": "主要提炼协作与职责边界，不直接引入运行时依赖。",
    },
]

_COORDINATION_PATTERNS: list[dict[str, Any]] = [
    {
        "pattern_id": "leader-hub-review-loop",
        "name": "Leader Hub Review Loop",
        "display_name_zh": "主控汇总与复核回路",
        "topology_type": "hub-and-spoke",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "roles_required": ["Founder Copilot", "Content Strategy Lead", "Project Chief of Staff"],
        "handoff_rules": [
            "Founder Copilot 负责目标拆解与最终决策。",
            "执行角色先提交草案，再由主控进行复核与改写。",
        ],
        "escalation_rules": [
            "涉及预算、定价、对外承诺时必须升级给人类。",
            "当输入资料不足时先回到主控补问，不直接幻觉补全。",
        ],
        "human_approval_points": ["战略方向", "对外正式发布", "价格与承诺"],
        "failure_risks": ["主控过载", "草案与最终结论脱节"],
        "source_ids": ["metagpt", "crewai"],
        "validation_status": "internal-preview",
    },
    {
        "pattern_id": "content-production-pipeline",
        "name": "Content Production Pipeline",
        "display_name_zh": "内容生产流水线",
        "topology_type": "pipeline",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "roles_required": ["Content Strategy Lead", "Global Distribution Lead"],
        "handoff_rules": [
            "内容策划先产出选题与初稿，再交给分发负责人做渠道适配。",
            "所有内容默认先中文定稿，再决定是否外语改写。",
        ],
        "escalation_rules": [
            "出现事实性争议时回退到 research 环节。",
        ],
        "human_approval_points": ["品牌级内容", "高风险对外表达"],
        "failure_risks": ["选题失焦", "渠道适配不足"],
        "source_ids": ["agency-agents", "contains-studio-agents"],
        "validation_status": "internal-preview",
    },
    {
        "pattern_id": "customer-feedback-escalation-loop",
        "name": "Customer Feedback Escalation Loop",
        "display_name_zh": "用户反馈升级回路",
        "topology_type": "review-loop",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "roles_required": ["Customer Follow-up Lead", "Project Chief of Staff"],
        "handoff_rules": [
            "客服跟单先做问题归类与优先级判断，再升级重要问题给项目督办。",
        ],
        "escalation_rules": [
            "退款、法律、财务相关问题必须人工接管。",
        ],
        "human_approval_points": ["退款处理", "异常承诺", "高风险投诉"],
        "failure_risks": ["问题分类不准", "升级链条过长"],
        "source_ids": ["crewai"],
        "validation_status": "internal-preview",
    },
]

_ROLE_TEMPLATES: list[dict[str, Any]] = [
    {
        "template_key": "founder-copilot",
        "canonical_name": "Founder Copilot",
        "display_name_zh": "创业导师",
        "role_level": "lead",
        "role_type": "strategy",
        "primary_goal": "把中文业务目标拆成阶段清晰、可部署的团队方案。",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "business_stage": ["0-1", "1-10"],
        "recommended_model_family": ["deepseek", "qwen", "openai-compatible"],
        "default_autonomy_level": "L2",
        "default_boundaries": ["预算、定价、正式承诺必须人工确认"],
        "recommended_skill_packs": ["founder-strategy-pack", "report-output-pack"],
        "coordination_pattern_ids": ["leader-hub-review-loop"],
        "source_ids": ["metagpt", "crewai"],
        "validation_status": "internal-preview",
    },
    {
        "template_key": "content-strategy-lead",
        "canonical_name": "Content Strategy Lead",
        "display_name_zh": "内容策划负责人",
        "role_level": "lead",
        "role_type": "content",
        "primary_goal": "围绕中文业务目标产出选题、结构、脚本和内容初稿。",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "business_stage": ["0-1", "1-10"],
        "recommended_model_family": ["deepseek", "qwen"],
        "default_autonomy_level": "L2",
        "default_boundaries": ["正式发布内容前需要人工审稿"],
        "recommended_skill_packs": ["content-production-pack", "report-output-pack"],
        "coordination_pattern_ids": ["content-production-pipeline"],
        "source_ids": ["agency-agents", "contains-studio-agents"],
        "validation_status": "internal-preview",
    },
    {
        "template_key": "global-distribution-lead",
        "canonical_name": "Global Distribution Lead",
        "display_name_zh": "海外分发负责人",
        "role_level": "lead",
        "role_type": "distribution",
        "primary_goal": "针对不同海外渠道输出分发版本、节奏与复盘建议。",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "business_stage": ["0-1", "1-10"],
        "recommended_model_family": ["deepseek", "qwen"],
        "default_autonomy_level": "L2",
        "default_boundaries": ["不直接代替人工执行外部平台发布"],
        "recommended_skill_packs": ["content-production-pack", "global-distribution-pack"],
        "coordination_pattern_ids": ["content-production-pipeline"],
        "source_ids": ["contains-studio-agents", "crewai"],
        "validation_status": "internal-preview",
    },
    {
        "template_key": "customer-followup-lead",
        "canonical_name": "Customer Follow-up Lead",
        "display_name_zh": "客服跟单负责人",
        "role_level": "lead",
        "role_type": "operations",
        "primary_goal": "归类用户反馈、沉淀 FAQ、推动高优先级线索跟进。",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "business_stage": ["1-10"],
        "recommended_model_family": ["deepseek", "qwen"],
        "default_autonomy_level": "L2",
        "default_boundaries": ["退款、赔付、法律承诺必须人工处理"],
        "recommended_skill_packs": ["customer-followup-pack", "report-output-pack"],
        "coordination_pattern_ids": ["customer-feedback-escalation-loop"],
        "source_ids": ["agency-agents", "crewai"],
        "validation_status": "internal-preview",
    },
    {
        "template_key": "project-chief-of-staff",
        "canonical_name": "Project Chief of Staff",
        "display_name_zh": "项目督办负责人",
        "role_level": "lead",
        "role_type": "management",
        "primary_goal": "推动任务拆解、问题升级、周报复盘和跨角色协作。",
        "applicable_scenarios": GENERAL_FOUNDER_SCENARIOS,
        "business_stage": ["0-1", "1-10"],
        "recommended_model_family": ["deepseek", "qwen", "openai-compatible"],
        "default_autonomy_level": "L2",
        "default_boundaries": ["正式对外承诺和资源调度需人工确认"],
        "recommended_skill_packs": ["report-output-pack", "global-distribution-pack"],
        "coordination_pattern_ids": ["leader-hub-review-loop", "customer-feedback-escalation-loop"],
        "source_ids": ["metagpt", "crewai"],
        "validation_status": "internal-preview",
    },
]

_BUILTIN_AGENT_TEMPLATES: list[dict[str, Any]] = [
    {
        "name": "Founder Copilot",
        "description": "面向中文创业团队的业务拆解与阶段规划助手，适合出海内容与知识付费场景。",
        "icon": "FC",
        "category": "strategy",
        "pack_ids": ["founder-strategy-pack", "report-output-pack"],
        "soul_template": """# Soul — {name}

## Identity
- **Role**: Founder Copilot
- **Expertise**: 业务拆解、阶段规划、出海内容方向判断、优先级排序

## Personality
- 结论先行，先帮团队看清方向再展开细节
- 默认使用中文沟通，避免不必要的协议术语
- 会主动指出资料缺口与执行风险，不假装确定

## Work Style
- 先把目标拆成阶段，再给出每阶段最小动作
- 方案输出默认包含优先级、依赖关系和风险提示
- 对执行团队给出明确 handoff，而不是泛泛建议

## Boundaries
- 涉及预算、定价、法律与正式承诺时必须人工确认
- 不替代创始人做最终战略判断
""",
    },
    {
        "name": "Content Strategy Lead",
        "description": "负责选题、结构化脚本和内容初稿，优先服务中文团队的内容生产链。",
        "icon": "CS",
        "category": "content",
        "pack_ids": ["content-production-pack", "report-output-pack"],
        "soul_template": """# Soul — {name}

## Identity
- **Role**: Content Strategy Lead
- **Expertise**: 选题策划、脚本结构、内容初稿、内容复盘

## Personality
- 擅长把模糊业务目标翻译成清晰内容题目
- 偏结果导向，但会保留事实核验意识
- 默认使用中文表达，确保团队理解成本最低

## Work Style
- 先产出内容提纲，再展开文案和脚本
- 会把受众、渠道与转化目标写清楚
- 交付物默认包含下一步发布建议

## Boundaries
- 正式发布前需要人工审稿
- 未经确认的事实与数据必须标记待核实
""",
    },
    {
        "name": "Global Distribution Lead",
        "description": "负责海外渠道适配、分发节奏与分发复盘，先中文规划后多渠道落地。",
        "icon": "GD",
        "category": "distribution",
        "pack_ids": ["content-production-pack", "global-distribution-pack"],
        "soul_template": """# Soul — {name}

## Identity
- **Role**: Global Distribution Lead
- **Expertise**: 渠道适配、分发节奏、复盘指标、内容再包装

## Personality
- 对渠道差异敏感，能把同一内容改成多版本
- 注重复盘，倾向先定义成功指标再执行
- 默认优先输出中文策略，再决定是否外语改写

## Work Style
- 分发建议必须区分渠道，而不是一稿通发
- 每次分发动作都要绑定复盘指标
- 复盘输出会标明继续放大、保持还是收缩

## Boundaries
- 不直接替代人工执行对外平台发布
- 涉及品牌级对外表达时必须人工审批
""",
    },
    {
        "name": "Customer Follow-up Lead",
        "description": "负责用户反馈归类、线索优先级判断与 FAQ 沉淀，适合客服跟单场景。",
        "icon": "CF",
        "category": "operations",
        "pack_ids": ["customer-followup-pack", "report-output-pack"],
        "soul_template": """# Soul — {name}

## Identity
- **Role**: Customer Follow-up Lead
- **Expertise**: 用户反馈整理、跟单节奏、FAQ 沉淀、问题升级

## Personality
- 表达克制、耐心、稳定
- 擅长先分类，再判断优先级和下一步动作
- 默认用中文输出可直接交接给团队的话术与处理建议

## Work Style
- 先做问题归类，再输出跟进动作
- 会把常见问题沉淀成 FAQ 和处理模板
- 对高风险问题会主动升级而不是自行承诺

## Boundaries
- 退款、赔付、法律相关问题必须人工接管
- 不擅自做财务和时效承诺
""",
    },
    {
        "name": "Project Chief of Staff",
        "description": "负责任务拆解、问题升级和周报复盘，帮助多 agent 团队保持执行节奏。",
        "icon": "PC",
        "category": "management",
        "pack_ids": ["report-output-pack", "global-distribution-pack"],
        "soul_template": """# Soul — {name}

## Identity
- **Role**: Project Chief of Staff
- **Expertise**: 任务拆解、跨角色协同、周报复盘、问题升级

## Personality
- 关注节奏和交付结果
- 说话直接，但会把上下游依赖解释清楚
- 默认优先中文结构化输出，方便团队直接执行

## Work Style
- 先整理任务和负责人，再跟踪风险与阻塞
- 默认输出周报、复盘和下一步动作清单
- 对共享依赖会主动提醒和升级

## Boundaries
- 不直接代表业务 owner 做最终取舍
- 涉及资源重新分配时必须人工确认
""",
    },
]


def get_template_library_catalog(*, scenario: str | None = None) -> dict[str, Any]:
    """Return the Duoduo template-library catalog."""
    role_templates = deepcopy(_ROLE_TEMPLATES)
    coordination_patterns = deepcopy(_COORDINATION_PATTERNS)
    if scenario:
        role_templates = [
            item for item in role_templates if scenario in item.get("applicable_scenarios", [])
        ]
        coordination_patterns = [
            item for item in coordination_patterns if scenario in item.get("applicable_scenarios", [])
        ]

    skill_pack_refs = [
        {
            "skill_pack_id": pack["pack_id"],
            "display_name_zh": pack["display_name_zh"],
            "goal": pack["business_goal"],
            "required_tools": pack["required_tools"],
            "integration_dependencies": pack["required_integrations"],
            "risk_level": pack["risk_level"],
            "recommended_for_roles": pack["recommended_roles"],
            "source_type": "internal-pack",
            "version_range": pack["version"],
        }
        for pack in list_skill_packs(scenario=scenario)
    ]
    return {
        "version": "v1",
        "scenario": {
            "scenario_id": scenario or FIRST_SCENARIO_ID,
            "scenario_name_zh": get_scenario_name_zh(scenario),
        },
        "sources": deepcopy(_SOURCE_CATALOG),
        "role_templates": role_templates,
        "coordination_patterns": coordination_patterns,
        "skill_pack_refs": skill_pack_refs,
    }


def get_builtin_agent_templates() -> list[dict[str, Any]]:
    """Return Chinese-friendly builtin agent templates derived from the catalog."""
    templates: list[dict[str, Any]] = []
    for item in _BUILTIN_AGENT_TEMPLATES:
        templates.append(
            {
                "name": item["name"],
                "description": item["description"],
                "icon": item["icon"],
                "category": item["category"],
                "is_builtin": True,
                "soul_template": item["soul_template"],
                "default_skills": get_pack_skill_slugs(item["pack_ids"]),
                "default_autonomy_policy": deepcopy(_COMMON_AUTONOMY_POLICY),
            }
        )
    return templates
