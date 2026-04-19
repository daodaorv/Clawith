import type {
    FounderMainlineInterviewAnswer,
    FounderMainlineModelReadyContext,
    FounderMainlinePlanningPayload,
    FounderMainlineState,
} from './founderMainlineInterviewProgress';

export const FOUNDER_MAINLINE_DRAFT_PLAN_ENDPOINT = '/api/enterprise/duoduo/founder-mainline/draft-plan';

export interface FounderMainlineDraftPlanRequest extends FounderMainlinePlanningPayload {
    model_ready_context: FounderMainlineModelReadyContext;
    answers: FounderMainlineInterviewAnswer[];
    correction_notes?: string;
    user_confirmed?: boolean;
}

export interface FounderMainlineCompanyBlueprint {
    business_goal: string;
    source_business_brief: string;
    summary_zh: string;
    priority_focus: string[];
}

export interface FounderMainlineRolePlan {
    canonical_name: string;
    display_name_zh: string;
    role_level: string;
    role_type: string;
    primary_goal: string;
    template_key: string;
    recommended_skill_packs: string[];
    human_approval_required: boolean;
    reason_zh: string;
}

export type FounderMainlineFounderCopilot = FounderMainlineRolePlan;

export interface FounderMainlineTeamPlan {
    team_id: string;
    team_name_zh: string;
    team_goal: string;
    priority: number;
    roles: FounderMainlineRolePlan[];
}

export interface FounderMainlineTemplateRecommendation {
    template_key: string;
    canonical_name: string;
    display_name_zh: string;
    reason_zh: string;
}

export interface FounderMainlineSkillPackRecommendation {
    pack_id: string;
    display_name_zh: string;
    reason_zh: string;
    recommended_for_roles: string[];
}

export interface FounderMainlineCoordinationRelationship {
    from_role: string;
    to_role: string;
    relationship_type: string;
    handoff_rule_zh: string;
    escalation_rule_zh: string;
}

export interface FounderMainlineTraceabilityItem {
    source_text: string;
    extracted_signal: string;
    mapped_entity_type: string;
    mapped_entity_key: string;
}

export interface FounderMainlineDeploymentReadiness {
    can_enter_deploy_prep: boolean;
    blocker_reason_zh: string;
    missing_items: string[];
    resolved_template_keys: string[];
    resolved_pack_ids: string[];
}

export interface FounderMainlineDraftPlan {
    scenario_id: string;
    scenario_name_zh: string;
    locale: string;
    plan_status: FounderMainlineState;
    company_blueprint: FounderMainlineCompanyBlueprint;
    founder_copilot: FounderMainlineFounderCopilot;
    teams: FounderMainlineTeamPlan[];
    template_recommendations: FounderMainlineTemplateRecommendation[];
    skill_pack_recommendations: FounderMainlineSkillPackRecommendation[];
    coordination_relationships: FounderMainlineCoordinationRelationship[];
    approval_boundaries: string[];
    open_questions: string[];
    deployment_readiness: FounderMainlineDeploymentReadiness;
    traceability: FounderMainlineTraceabilityItem[];
    previous_plan_summary_zh: string;
    change_summary_zh: string[];
    changed_template_keys: string[];
    changed_pack_ids: string[];
}

export async function requestFounderMainlineDraftPlanPreview(
    payload: FounderMainlineDraftPlanRequest,
    init?: RequestInit,
): Promise<FounderMainlineDraftPlan> {
    const token = localStorage.getItem('token');
    const response = await fetch(FOUNDER_MAINLINE_DRAFT_PLAN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {}),
        },
        body: JSON.stringify(payload),
        ...init,
    });

    if (!response.ok) {
        let errorMessage = `Founder mainline draft plan request failed: ${response.status}`;
        try {
            const payload = await response.json() as {
                detail?: string | { message?: string };
            };
            if (typeof payload.detail === 'string' && payload.detail.trim()) {
                errorMessage = payload.detail;
            } else if (payload.detail && typeof payload.detail === 'object' && payload.detail.message?.trim()) {
                errorMessage = payload.detail.message;
            }
        } catch {
            const errorText = await response.text();
            if (errorText) {
                errorMessage = errorText;
            }
        }
        throw new Error(errorMessage);
    }

    return response.json() as Promise<FounderMainlineDraftPlan>;
}
