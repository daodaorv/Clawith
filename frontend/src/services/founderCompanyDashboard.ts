export interface FounderCompanyDashboardAgent {
    name: string;
    status: string;
}

export interface FounderCompanyDashboardSnapshot {
    workspaceId?: string;
    companyName: string;
    agents: FounderCompanyDashboardAgent[];
    blockers: string[];
    relationshipCount?: number;
    triggerCount?: number;
    generatedAt?: string;
}

export interface FounderCompanyDashboardSummary {
    companyName: string;
    totalAgentCount: number;
    activeAgentCount: number;
    pausedAgentCount: number;
    blockerCount: number;
    hasBlockers: boolean;
    headlineZh: string;
    headlineEn: string;
    nextActionZh: string;
    nextActionEn: string;
}

export interface FounderCompanyDashboardWorkspaceLike {
    name?: string;
    dashboard_snapshot?: {
        workspace_id?: string;
        created_agents?: Array<{
            name?: string;
            canonical_name?: string;
        }>;
        relationship_count?: number;
        trigger_count?: number;
    };
}

export const FOUNDER_COMPANY_DASHBOARD_SNAPSHOT_KEY = 'founder_company_dashboard_snapshot';

const ACTIVE_AGENT_STATUSES = new Set(['active', 'running', 'idle']);
const PAUSED_AGENT_STATUSES = new Set(['paused', 'stopped']);

export function summarizeFounderCompanyDashboard(
    input: FounderCompanyDashboardSnapshot,
): FounderCompanyDashboardSummary {
    const agents = input.agents || [];
    const blockers = input.blockers || [];
    const activeAgentCount = agents.filter((agent) => ACTIVE_AGENT_STATUSES.has((agent.status || '').toLowerCase())).length;
    const pausedAgentCount = agents.filter((agent) => PAUSED_AGENT_STATUSES.has((agent.status || '').toLowerCase())).length;
    const blockerCount = blockers.length;
    const hasBlockers = blockerCount > 0;

    return {
        companyName: input.companyName,
        totalAgentCount: agents.length,
        activeAgentCount,
        pausedAgentCount,
        blockerCount,
        hasBlockers,
        headlineZh: `${input.companyName} 当前有 ${activeAgentCount} 个活跃 Agent`,
        headlineEn: `${input.companyName} currently has ${activeAgentCount} active agents`,
        nextActionZh: hasBlockers
            ? `先处理 ${blockerCount} 个阻塞项，再恢复自动协作节奏。`
            : activeAgentCount > 0
                ? '当前可以继续观察协作节奏，并补齐下一轮增长目标。'
                : '先启动至少 1 个 Agent，形成基础协作回路。',
        nextActionEn: hasBlockers
            ? `Resolve ${blockerCount} blocker(s) first, then resume the automation loop.`
            : activeAgentCount > 0
                ? 'You can now observe the operating cadence and define the next growth target.'
                : 'Start at least one agent first to establish the core operating loop.',
    };
}

export function resolveFounderCompanyDashboardSnapshot(
    workspace: FounderCompanyDashboardWorkspaceLike | null | undefined,
    localSnapshot: FounderCompanyDashboardSnapshot | null = null,
): FounderCompanyDashboardSnapshot {
    const backendSnapshot = workspace?.dashboard_snapshot;
    const hasBackendSnapshot = Boolean(
        backendSnapshot
        && (
            backendSnapshot.workspace_id
            || Array.isArray(backendSnapshot.created_agents)
            || backendSnapshot.relationship_count != null
            || backendSnapshot.trigger_count != null
        ),
    );
    if (hasBackendSnapshot && backendSnapshot) {
        return {
            workspaceId: backendSnapshot.workspace_id,
            companyName: workspace?.name || localSnapshot?.companyName || 'Founder Workspace',
            agents: (backendSnapshot.created_agents || []).map((agent) => ({
                name: agent.name || agent.canonical_name || 'Agent',
                status: 'idle',
            })),
            blockers: [],
            relationshipCount: backendSnapshot.relationship_count || 0,
            triggerCount: backendSnapshot.trigger_count || 0,
        };
    }

    return localSnapshot || {
        companyName: workspace?.name || 'Founder Workspace',
        agents: [],
        blockers: [],
        relationshipCount: 0,
        triggerCount: 0,
    };
}

export function loadFounderCompanyDashboardSnapshot(): FounderCompanyDashboardSnapshot | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const raw = window.localStorage.getItem(FOUNDER_COMPANY_DASHBOARD_SNAPSHOT_KEY);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as FounderCompanyDashboardSnapshot;
    } catch {
        return null;
    }
}

export function saveFounderCompanyDashboardSnapshot(snapshot: FounderCompanyDashboardSnapshot): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(
        FOUNDER_COMPANY_DASHBOARD_SNAPSHOT_KEY,
        JSON.stringify(snapshot),
    );
}
