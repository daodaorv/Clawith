from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


FounderMainlinePlanStatus = Literal[
    "step0_blocked",
    "interview_in_progress",
    "ready_for_plan",
    "plan_draft_ready",
    "correction_in_progress",
    "ready_for_deploy_prep",
    "blocked_by_open_questions",
]


class FounderMainlineDraftPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_brief: str = Field(min_length=1, description="用户输入的中文业务概述")
    locale: str = Field(default="zh-CN")
    scenario_id: str | None = Field(default=None)
    model_ready_context: "FounderMainlineModelReadyContext | None" = None
    answers: list["FounderMainlineInterviewAnswer"] = Field(default_factory=list)
    correction_notes: str | None = None
    user_confirmed: bool = False


class FounderMainlineModelReadyContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolved_provider: str | None = None
    recommended_model: str | None = None
    normalized_base_url: str | None = None


class FounderMainlineInterviewAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_id: str
    answer_text: str = ""
    is_unknown: bool = False


class FounderMainlineInterviewProgressRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_brief: str = Field(min_length=1, description="用户输入的中文业务概述")
    locale: str = Field(default="zh-CN")
    scenario_id: str | None = Field(default=None)
    model_ready_context: FounderMainlineModelReadyContext = Field(default_factory=FounderMainlineModelReadyContext)
    answers: list[FounderMainlineInterviewAnswer] = Field(default_factory=list)


class FounderMainlineInterviewQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_id: str
    question_zh: str
    intent_zh: str = ""


class FounderMainlineInterviewProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_brief: str
    plan_status: FounderMainlinePlanStatus
    can_generate_plan: bool = False
    model_ready_context: FounderMainlineModelReadyContext
    answered_groups: list[str] = Field(default_factory=list)
    missing_groups: list[str] = Field(default_factory=list)
    next_questions: list[FounderMainlineInterviewQuestion] = Field(default_factory=list)


class FounderMainlineTraceability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_text: str
    extracted_signal: str
    mapped_entity_type: str
    mapped_entity_key: str


class FounderMainlineRolePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canonical_name: str
    display_name_zh: str
    role_level: str
    role_type: str
    primary_goal: str
    template_key: str
    recommended_skill_packs: list[str] = Field(default_factory=list)
    human_approval_required: bool = False
    reason_zh: str = ""


class FounderMainlineTeamPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: str
    team_name_zh: str
    team_goal: str
    priority: int
    roles: list[FounderMainlineRolePlan] = Field(default_factory=list)


class FounderMainlineTemplateRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_key: str
    canonical_name: str
    display_name_zh: str
    reason_zh: str


class FounderMainlineSkillPackRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pack_id: str
    display_name_zh: str
    reason_zh: str
    recommended_for_roles: list[str] = Field(default_factory=list)


class FounderMainlineRelationship(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_role: str
    to_role: str
    relationship_type: str
    handoff_rule_zh: str
    escalation_rule_zh: str = ""


class FounderMainlineDeploymentReadiness(BaseModel):
    model_config = ConfigDict(extra="forbid")

    can_enter_deploy_prep: bool = False
    blocker_reason_zh: str = ""
    missing_items: list[str] = Field(default_factory=list)
    resolved_template_keys: list[str] = Field(default_factory=list)
    resolved_pack_ids: list[str] = Field(default_factory=list)


class FounderMainlineDraftPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_id: str
    scenario_name_zh: str
    locale: str = "zh-CN"
    plan_status: FounderMainlinePlanStatus
    company_blueprint: dict
    founder_copilot: FounderMainlineRolePlan
    teams: list[FounderMainlineTeamPlan] = Field(default_factory=list)
    template_recommendations: list[FounderMainlineTemplateRecommendation] = Field(default_factory=list)
    skill_pack_recommendations: list[FounderMainlineSkillPackRecommendation] = Field(default_factory=list)
    coordination_relationships: list[FounderMainlineRelationship] = Field(default_factory=list)
    approval_boundaries: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    deployment_readiness: FounderMainlineDeploymentReadiness
    traceability: list[FounderMainlineTraceability] = Field(default_factory=list)
    previous_plan_summary_zh: str = ""
    change_summary_zh: list[str] = Field(default_factory=list)
    changed_template_keys: list[str] = Field(default_factory=list)
    changed_pack_ids: list[str] = Field(default_factory=list)
