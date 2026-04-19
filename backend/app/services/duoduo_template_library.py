"""Curated Duoduo template-library metadata."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.duoduo.skill_packs import FIRST_SCENARIO_ID, FIRST_SCENARIO_NAME_ZH
from app.duoduo.template_library import get_template_library_catalog


DUODUO_FIRST_SCENARIO_KEY = FIRST_SCENARIO_ID
DUODUO_FIRST_SCENARIO_LABEL_ZH = FIRST_SCENARIO_NAME_ZH

_ROLE_TYPE_LABELS = {
    "strategy": "战略总控",
    "content": "内容生产",
    "distribution": "渠道分发",
    "operations": "用户运营",
    "management": "项目督办",
}

_LEGACY_TEMPLATE_LIBRARY_METADATA: dict[str, dict[str, Any]] = {
    "Project Manager": {
        "display_name_zh": "项目推进主管",
        "library_summary_zh": "负责拆解目标、推进执行和跨角色协同，可作为通用团队中枢模板。",
        "library_tags_zh": ["团队协同", "项目推进", "交付管理"],
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 210,
        "role_group_zh": "执行中枢",
    },
    "Market Researcher": {
        "display_name_zh": "市场研究员",
        "library_summary_zh": "负责行业扫描、竞品观察和用户需求收集，适合启动阶段的信息判断。",
        "library_tags_zh": ["市场研究", "竞品分析", "出海验证"],
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 220,
        "role_group_zh": "增长研究",
    },
    "Product Intern": {
        "display_name_zh": "产品策划助理",
        "library_summary_zh": "负责整理需求、梳理流程和沉淀文档，适合把想法整理成可执行方案。",
        "library_tags_zh": ["需求梳理", "文档整理", "产品支持"],
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 230,
        "role_group_zh": "方案整理",
    },
    "Designer": {
        "display_name_zh": "设计支持",
        "library_summary_zh": "负责品牌表达、视觉整理和素材辅助，适合内容包装与页面表达。",
        "library_tags_zh": ["设计支持", "品牌表达", "素材整理"],
        "duoduo_recommended": False,
        "recommended_for_first_scenario": True,
        "sort_order": 240,
        "role_group_zh": "内容包装",
    },
}


def _build_role_tags(role: dict[str, Any], role_group_zh: str) -> list[str]:
    tags = [role_group_zh]
    role_level = role.get("role_level")
    if role_level:
        tags.append(str(role_level))
    role_type = role.get("role_type")
    if role_type:
        tags.append(str(role_type))
    if role.get("applicable_scenarios"):
        tags.append("首场景")
    return tags


@lru_cache(maxsize=1)
def _catalog_template_metadata() -> dict[str, dict[str, Any]]:
    catalog = get_template_library_catalog()
    metadata: dict[str, dict[str, Any]] = {}

    for index, role in enumerate(catalog.get("role_templates", []), start=1):
        role_type = str(role.get("role_type", "general"))
        role_group_zh = _ROLE_TYPE_LABELS.get(role_type, "通用角色")
        metadata[str(role["canonical_name"])] = {
            "display_name_zh": role.get("display_name_zh") or role["canonical_name"],
            "library_summary_zh": role.get("primary_goal", ""),
            "library_tags_zh": _build_role_tags(role, role_group_zh),
            "duoduo_recommended": True,
            "recommended_for_first_scenario": DUODUO_FIRST_SCENARIO_KEY in role.get("applicable_scenarios", []),
            "sort_order": index * 10,
            "library_stage": role.get("validation_status", "internal-preview"),
            "source_type": "duoduo_runtime_catalog",
            "role_group_zh": role_group_zh,
        }

    return metadata


def build_duoduo_template_metadata(template: Any) -> dict[str, Any]:
    """Return read-only Duoduo library metadata for an agent template."""

    name = getattr(template, "name", "") or ""
    category = getattr(template, "category", "") or "general"
    description = getattr(template, "description", "") or ""
    is_builtin = bool(getattr(template, "is_builtin", False))

    base = {
        "display_name_zh": name,
        "library_summary_zh": description,
        "library_tags_zh": [category],
        "duoduo_recommended": False,
        "recommended_for_first_scenario": False,
        "first_scenario_key": DUODUO_FIRST_SCENARIO_KEY,
        "first_scenario_label_zh": DUODUO_FIRST_SCENARIO_LABEL_ZH,
        "sort_order": 999,
        "library_stage": "seeded_builtin" if is_builtin else "custom",
        "source_type": "builtin_seed" if is_builtin else "user_created",
        "role_group_zh": "通用角色",
    }

    base.update(_LEGACY_TEMPLATE_LIBRARY_METADATA.get(name, {}))
    base.update(_catalog_template_metadata().get(name, {}))
    return base
