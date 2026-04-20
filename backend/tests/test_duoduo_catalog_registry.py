from app.duoduo.skill_packs import (
    FIRST_SCENARIO_ID,
    FIRST_SCENARIO_NAME_ZH,
    get_pack_skill_slugs,
    get_skill_pack,
    list_skill_packs,
)
from app.duoduo.template_library import get_builtin_agent_templates, get_template_library_catalog


def test_template_library_catalog_uses_chinese_first_scenario():
    catalog = get_template_library_catalog()

    assert catalog["scenario"]["scenario_id"] == FIRST_SCENARIO_ID
    assert catalog["scenario"]["scenario_name_zh"] == FIRST_SCENARIO_NAME_ZH
    founder = next(item for item in catalog["role_templates"] if item["canonical_name"] == "Founder Copilot")
    assert "founder-strategy-pack" in founder["recommended_skill_packs"]


def test_template_library_catalog_supports_scenario_filter():
    catalog = get_template_library_catalog(scenario=FIRST_SCENARIO_ID)

    assert catalog["role_templates"]
    assert all(FIRST_SCENARIO_ID in item["applicable_scenarios"] for item in catalog["role_templates"])
    assert all(ref["skill_pack_id"] for ref in catalog["skill_pack_refs"])


def test_skill_pack_catalog_maps_to_existing_skill_slugs():
    packs = list_skill_packs()

    assert any(pack["pack_id"] == "content-production-pack" for pack in packs)
    assert get_skill_pack("report-output-pack")["display_name_zh"] == "报告输出包"
    assert get_pack_skill_slugs(["content-production-pack"]) == [
        "content-writing",
        "web-research",
        "competitive-analysis",
    ]


def test_builtin_agent_templates_are_seed_ready():
    templates = get_builtin_agent_templates()

    founder = next(item for item in templates if item["name"] == "Founder Copilot")
    assert founder["is_builtin"] is True
    assert "web-research" in founder["default_skills"]
    assert "## Personality" in founder["soul_template"]
