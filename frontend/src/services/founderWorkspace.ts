import type {
    FounderMainlineInterviewAnswer,
    FounderMainlineInterviewAnswerMap,
    FounderMainlineInterviewProgress,
    FounderMainlineState,
} from './founderMainlineInterviewProgress.ts';
import type { FounderMainlineDraftPlan, FounderMainlineDraftPlanRequest } from './founderMainlineDraftPlan.ts';

export interface FounderWorkspacePlanningContext {
    business_brief?: string;
    locale?: string;
    scenario_id?: string;
    model_ready_context?: {
        resolved_provider?: string;
        recommended_model?: string;
        normalized_base_url?: string;
    };
    answers?: FounderMainlineInterviewAnswer[];
    correction_notes?: string | null;
    user_confirmed?: boolean;
}

export interface FounderWorkspaceDashboardSnapshot {
    workspace_id?: string;
    current_state?: string;
    materialization_status?: string;
    created_agents?: FounderWorkspaceMaterializedAgent[];
    relationship_count?: number;
    trigger_count?: number;
}

export interface FounderWorkspace {
    id: string;
    tenant_id?: string | null;
    owner_user_id: string;
    name: string;
    business_brief: string;
    business_logic: Record<string, unknown>;
    current_state: string;
    materialization_status: string;
    latest_plan: ({ plan_status: FounderMainlineState } & Partial<FounderMainlineInterviewProgress> & Partial<FounderMainlineDraftPlan>)
        | { plan_status?: string };
    planning_context: FounderWorkspacePlanningContext;
    draft_plan?: FounderMainlineDraftPlan | null;
    dashboard_snapshot?: FounderWorkspaceDashboardSnapshot;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface FounderWorkspaceCreateRequest {
    name: string;
    business_brief: string;
    business_logic: Record<string, unknown>;
}

export interface FounderWorkspaceMaterializedAgent {
    id: string;
    name: string;
    canonical_name: string;
    template_key: string;
}

export interface FounderWorkspaceMaterialization {
    workspace_id: string;
    current_state: string;
    materialization_status: string;
    created_agents: FounderWorkspaceMaterializedAgent[];
    relationship_count: number;
    trigger_count: number;
    dashboard_snapshot?: FounderWorkspaceDashboardSnapshot;
}

export interface FounderWorkspaceInterviewProgressRequest {
    business_brief: string;
    locale?: string;
    scenario_id?: string;
    model_ready_context: FounderWorkspacePlanningContext['model_ready_context'];
    answers: FounderMainlineInterviewAnswer[];
}

export type FounderWorkspaceDraftPlanRequest = FounderMainlineDraftPlanRequest;

export type FounderWorkspaceStep = 'intake' | 'review' | 'dashboard';
export const FOUNDER_ACTIVE_WORKSPACE_KEY = 'founder_active_workspace_id';

async function requestFounderWorkspace<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
}

export function deriveFounderWorkspaceStep(workspace: Pick<
    FounderWorkspace,
    'current_state' | 'materialization_status' | 'latest_plan'
>): FounderWorkspaceStep {
    if (
        workspace.materialization_status === 'completed'
        || workspace.current_state === 'materialized'
    ) {
        return 'dashboard';
    }

    if (
        workspace.current_state === 'planning'
        || workspace.current_state === 'review'
        || [
            'ready_for_plan',
            'plan_draft_ready',
            'correction_in_progress',
            'ready_for_deploy_prep',
        ].includes(workspace.latest_plan?.plan_status || '')
    ) {
        return 'review';
    }

    return 'intake';
}

export function resolveFounderWorkspaceSelection<T extends { id: string }>(
    workspaces: T[] = [],
    preferredWorkspaceId?: string | null,
    fallbackWorkspace: T | null = null,
): T | null {
    if (preferredWorkspaceId) {
        const matchedWorkspace = workspaces.find((workspace) => workspace.id === preferredWorkspaceId);
        if (matchedWorkspace) {
            return matchedWorkspace;
        }
    }

    return workspaces[0] || fallbackWorkspace;
}

export function loadFounderActiveWorkspaceId(): string {
    if (typeof window === 'undefined') {
        return '';
    }

    return window.localStorage.getItem(FOUNDER_ACTIVE_WORKSPACE_KEY) || '';
}

export function saveFounderActiveWorkspaceId(workspaceId: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (!workspaceId) {
        window.localStorage.removeItem(FOUNDER_ACTIVE_WORKSPACE_KEY);
        return;
    }

    window.localStorage.setItem(FOUNDER_ACTIVE_WORKSPACE_KEY, workspaceId);
}

export function buildFounderWorkspaceAnswerMap(workspaceLike: {
    planning_context?: {
        answers?: FounderMainlineInterviewAnswer[];
    };
} | null | undefined): FounderMainlineInterviewAnswerMap {
    const answerMap: FounderMainlineInterviewAnswerMap = {};
    for (const item of workspaceLike?.planning_context?.answers || []) {
        const groupId = item?.group_id;
        const answerText = item?.answer_text?.trim();
        if (!groupId || !answerText) {
            continue;
        }
        answerMap[groupId] = answerText;
    }
    return answerMap;
}

export const founderWorkspaceApi = {
    list: () => requestFounderWorkspace<FounderWorkspace[]>('/founder-workspaces'),
    create: (data: FounderWorkspaceCreateRequest) =>
        requestFounderWorkspace<FounderWorkspace>('/founder-workspaces', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    saveInterviewProgress: (workspaceId: string, data: FounderWorkspaceInterviewProgressRequest) =>
        requestFounderWorkspace<FounderWorkspace>(`/founder-workspaces/${workspaceId}/planning/interview-progress`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    generateDraftPlan: (workspaceId: string, data: FounderWorkspaceDraftPlanRequest) =>
        requestFounderWorkspace<FounderWorkspace>(`/founder-workspaces/${workspaceId}/planning/draft-plan`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    materialize: (workspaceId: string) =>
        requestFounderWorkspace<FounderWorkspaceMaterialization>(`/founder-workspaces/${workspaceId}/materialize`, {
            method: 'POST',
        }),
};
