"""Curated Duoduo skill-pack metadata."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.duoduo.skill_packs import list_skill_packs
from app.services.duoduo_template_library import (
    DUODUO_FIRST_SCENARIO_KEY,
    DUODUO_FIRST_SCENARIO_LABEL_ZH,
)


_SKILL_LIBRARY_METADATA: dict[str, dict[str, Any]] = {
    "web-research": {
        "display_name_zh": "网络调研",
        "library_summary_zh": "用于搜集竞品、渠道、用户和趋势信息，是首场景的基础信息能力。",
        "library_tags_zh": ["调研", "竞品", "信息采集"],
        "pack_key": "founder-strategy-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 10,
    },
    "competitive-analysis": {
        "display_name_zh": "竞品分析",
        "library_summary_zh": "用于做赛道、定位和差异化判断，适合启动阶段的中文业务验证。",
        "library_tags_zh": ["竞品", "定位", "差异化"],
        "pack_key": "founder-strategy-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 20,
    },
    "content-research-writer": {
        "display_name_zh": "内容研究写作",
        "library_summary_zh": "把调研结果整理成可发布内容草稿，适合内容生产与知识付费业务。",
        "library_tags_zh": ["内容生产", "选题", "写作"],
        "pack_key": "content-production-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 30,
    },
    "content-writing": {
        "display_name_zh": "内容写作",
        "library_summary_zh": "负责文章、脚本、营销文案和说明文档输出，是中文内容业务的通用写作能力。",
        "library_tags_zh": ["写作", "文案", "表达"],
        "pack_key": "content-production-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 40,
    },
    "meeting-notes": {
        "display_name_zh": "会议纪要",
        "library_summary_zh": "负责沉淀讨论结论和待办事项，适合小团队高频协作。",
        "library_tags_zh": ["会议纪要", "协同", "待办整理"],
        "pack_key": "report-output-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 50,
    },
    "complex-task-executor": {
        "display_name_zh": "复杂任务执行器",
        "library_summary_zh": "用于拆解复杂任务、规划执行步骤和跟踪进度，适合创业者助理与项目督办链路。",
        "library_tags_zh": ["任务拆解", "执行规划", "推进跟踪"],
        "pack_key": "report-output-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 60,
    },
    "data-analysis": {
        "display_name_zh": "数据分析",
        "library_summary_zh": "用于分析内容表现、销售漏斗和基础运营指标，适合中文团队做复盘。",
        "library_tags_zh": ["数据分析", "运营复盘", "漏斗观察"],
        "pack_key": "report-output-pack",
        "duoduo_recommended": True,
        "recommended_for_first_scenario": True,
        "sort_order": 70,
    },
    "mcp-installer": {
        "display_name_zh": "MCP 工具安装器",
        "library_summary_zh": "用于接入外部工具和服务，属于运维侧能力，不建议普通用户直接操作。",
        "library_tags_zh": ["集成配置", "工具接入"],
        "pack_key": "general-support",
        "pack_hint_zh": "归属能力包：通用支持",
        "duoduo_recommended": False,
        "recommended_for_first_scenario": False,
        "sort_order": 500,
    },
    "skill-creator": {
        "display_name_zh": "技能创建器",
        "library_summary_zh": "用于维护内部技能能力，偏平台运营，不是首场景直接能力。",
        "library_tags_zh": ["系统运营", "技能生产"],
        "pack_key": "general-support",
        "pack_hint_zh": "归属能力包：通用支持",
        "duoduo_recommended": False,
        "recommended_for_first_scenario": False,
        "sort_order": 600,
    },
}


@lru_cache(maxsize=1)
def _pack_labels() -> dict[str, str]:
    return {pack["pack_id"]: pack["display_name_zh"] for pack in list_skill_packs()}


def _resolve_pack_hint(pack_key: str) -> str:
    label = _pack_labels().get(pack_key)
    return f"归属能力包：{label}" if label else "归属能力包：通用支持"


def build_duoduo_skill_metadata(skill: Any) -> dict[str, Any]:
    """Return read-only Duoduo library metadata for a skill."""

    name = getattr(skill, "name", "") or ""
    category = getattr(skill, "category", "") or "general"
    description = getattr(skill, "description", "") or ""
    folder_name = getattr(skill, "folder_name", "") or ""
    is_builtin = bool(getattr(skill, "is_builtin", False))

    base = {
        "display_name_zh": name,
        "library_summary_zh": description,
        "library_tags_zh": [category],
        "duoduo_recommended": False,
        "recommended_for_first_scenario": False,
        "first_scenario_key": DUODUO_FIRST_SCENARIO_KEY,
        "first_scenario_label_zh": DUODUO_FIRST_SCENARIO_LABEL_ZH,
        "pack_key": "general-support",
        "pack_hint_zh": "归属能力包：通用支持",
        "sort_order": 999,
        "library_stage": "seeded_builtin" if is_builtin else "custom",
        "source_type": "builtin_seed" if is_builtin else "tenant_custom",
    }

    metadata = _SKILL_LIBRARY_METADATA.get(folder_name) or _SKILL_LIBRARY_METADATA.get(name, {})
    base.update(metadata)
    if base.get("pack_key") and "pack_hint_zh" not in metadata:
        base["pack_hint_zh"] = _resolve_pack_hint(str(base["pack_key"]))
    return base
