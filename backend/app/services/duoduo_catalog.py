from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from app.duoduo.skill_packs import FIRST_SCENARIO_ID, FIRST_SCENARIO_NAME_ZH


PRIMARY_SCENARIO = {
    "id": FIRST_SCENARIO_ID,
    "scenario_id": FIRST_SCENARIO_ID,
    "display_name_zh": FIRST_SCENARIO_NAME_ZH,
}


class DuoduoRoleTemplate(BaseModel):
    template_key: str
    canonical_name: str
    display_name_zh: str
    role_level: str
    role_type: str
    primary_goal: str
    applicable_scenarios: list[str]
    business_stage: list[str] = Field(default_factory=list)
    recommended_model_family: list[str] = Field(default_factory=list)
    default_autonomy_level: str
    default_boundaries: list[str] = Field(default_factory=list)
    recommended_skill_packs: list[str] = Field(default_factory=list)
    coordination_pattern_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    validation_status: str


class DuoduoSkillPack(BaseModel):
    pack_id: str
    version: str
    display_name_zh: str
    display_name_en: str
    business_goal: str
    applicable_scenarios: list[str]
    recommended_roles: list[str] = Field(default_factory=list)
    included_skills: list[str] = Field(default_factory=list)
    required_integrations: list[str] = Field(default_factory=list)
    required_tools: list[str] = Field(default_factory=list)
    default_prompts_or_policies: list[str] = Field(default_factory=list)
    compatibility_notes: str
    risk_level: str
    acceptance_metrics: list[str] = Field(default_factory=list)
    status: str


def get_duoduo_primary_scenario() -> dict[str, str]:
    return dict(PRIMARY_SCENARIO)


def _catalog_root() -> Path:
    return Path(__file__).resolve().parents[1] / "duoduo"


def _load_json_catalog(directory: Path, model_type: type[BaseModel]) -> list[BaseModel]:
    items: list[BaseModel] = []
    for path in sorted(directory.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        items.append(model_type.model_validate(payload))
    return items


@lru_cache(maxsize=1)
def _load_role_templates() -> tuple[DuoduoRoleTemplate, ...]:
    directory = _catalog_root() / "template_library" / "roles"
    items = _load_json_catalog(directory, DuoduoRoleTemplate)
    return tuple(
        sorted(
            items,
            key=lambda item: (
                item.display_name_zh,
            ),
        )
    )


@lru_cache(maxsize=1)
def _load_skill_packs() -> tuple[DuoduoSkillPack, ...]:
    directory = _catalog_root() / "skill_packs" / "packs"
    items = _load_json_catalog(directory, DuoduoSkillPack)
    return tuple(
        sorted(
            items,
            key=lambda item: (
                item.display_name_zh,
            ),
        )
    )


def list_duoduo_role_templates(*, scenario: str | None = None) -> list[dict]:
    items = list(_load_role_templates())
    if scenario:
        items = [item for item in items if scenario in item.applicable_scenarios]
    return [item.model_dump() for item in items]


def list_duoduo_skill_packs(*, scenario: str | None = None) -> list[dict]:
    items = list(_load_skill_packs())
    if scenario:
        items = [item for item in items if scenario in item.applicable_scenarios]
    return [item.model_dump() for item in items]
