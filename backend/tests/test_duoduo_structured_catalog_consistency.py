from app.duoduo.skill_packs import FIRST_SCENARIO_ID, FIRST_SCENARIO_NAME_ZH, list_skill_packs
from app.duoduo.template_library import get_template_library_catalog
from app.services.duoduo_catalog import (
    get_duoduo_primary_scenario,
    list_duoduo_role_templates,
    list_duoduo_skill_packs,
)


def _project_role(item: dict) -> dict:
    return {
        "template_key": item.get("template_key") or item.get("template_id"),
        "canonical_name": item.get("canonical_name"),
        "display_name_zh": item.get("display_name_zh"),
        "role_level": item.get("role_level"),
        "role_type": item.get("role_type"),
        "primary_goal": item.get("primary_goal"),
        "applicable_scenarios": item.get("applicable_scenarios", []),
        "business_stage": item.get("business_stage", []),
        "recommended_model_family": item.get("recommended_model_family", []),
        "default_autonomy_level": item.get("default_autonomy_level"),
        "default_boundaries": item.get("default_boundaries", []),
        "recommended_skill_packs": item.get("recommended_skill_packs")
        or [
            *item.get("required_skill_packs", []),
            *item.get("optional_skill_packs", []),
        ],
        "coordination_pattern_ids": item.get("coordination_pattern_ids", []),
        "source_ids": item.get("source_ids", []),
        "validation_status": item.get("validation_status"),
    }


def _project_pack(item: dict) -> dict:
    return {
        "pack_id": item.get("pack_id"),
        "version": item.get("version"),
        "display_name_zh": item.get("display_name_zh"),
        "display_name_en": item.get("display_name_en"),
        "business_goal": item.get("business_goal"),
        "applicable_scenarios": item.get("applicable_scenarios", []),
        "recommended_roles": item.get("recommended_roles", []),
        "included_skills": item.get("included_skills", []),
        "required_integrations": item.get("required_integrations", []),
        "required_tools": item.get("required_tools", []),
        "default_prompts_or_policies": item.get("default_prompts_or_policies", []),
        "compatibility_notes": item.get("compatibility_notes"),
        "risk_level": item.get("risk_level"),
        "acceptance_metrics": item.get("acceptance_metrics", []),
        "status": item.get("status"),
    }


def test_structured_catalog_primary_scenario_matches_runtime():
    scenario = get_duoduo_primary_scenario()

    assert scenario["scenario_id"] == FIRST_SCENARIO_ID
    assert scenario["display_name_zh"] == FIRST_SCENARIO_NAME_ZH


def test_structured_role_templates_match_runtime_catalog():
    runtime_roles = {
        item["template_key"]: _project_role(item)
        for item in get_template_library_catalog()["role_templates"]
    }
    structured_roles = {
        (item.get("template_key") or item.get("template_id")): _project_role(item)
        for item in list_duoduo_role_templates()
    }

    assert structured_roles == runtime_roles


def test_structured_skill_packs_match_runtime_catalog():
    runtime_packs = {item["pack_id"]: _project_pack(item) for item in list_skill_packs()}
    structured_packs = {item["pack_id"]: _project_pack(item) for item in list_duoduo_skill_packs()}

    assert structured_packs == runtime_packs
