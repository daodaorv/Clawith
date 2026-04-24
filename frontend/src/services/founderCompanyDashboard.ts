import {
    loadFounderActiveWorkspaceId,
    resolveFounderWorkspaceSelection,
} from './founderWorkspace.ts';

export interface FounderCompanyDashboardAgent {
    id?: string;
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
    id?: string;
    name?: string;
    current_state?: string;
    materialization_status?: string;
    latest_plan?: {
        plan_status?: string;
    };
    dashboard_snapshot?: {
        workspace_id?: string;
        created_agents?: Array<{
            id?: string;
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
const ERROR_AGENT_STATUSES = new Set(['error']);

function dedupeFounderBlockers(values: string[]): string[] {
    return [...new Set(values.filter(Boolean).map((item) => item.trim()).filter(Boolean))];
}

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

export function resolveFounderCompanyDashboardWorkspace<T extends FounderCompanyDashboardWorkspaceLike & { id: string }>(
    workspaces: T[] = [],
    localSnapshot: FounderCompanyDashboardSnapshot | null = null,
): T | null {
    return resolveFounderWorkspaceSelection(
        workspaces,
        localSnapshot?.workspaceId || loadFounderActiveWorkspaceId(),
    );
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
                id: agent.id,
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

export function hydrateFounderCompanyDashboardSnapshot(
    snapshot: FounderCompanyDashboardSnapshot,
    runtimeAgents: Array<{
        id?: string;
        name?: string;
        status?: string;
    }> = [],
): FounderCompanyDashboardSnapshot {
    if (!runtimeAgents.length) {
        return snapshot;
    }

    const runtimeById = new Map(
        runtimeAgents
            .filter((agent) => agent.id)
            .map((agent) => [agent.id as string, agent]),
    );
    const runtimeByName = new Map(
        runtimeAgents
            .filter((agent) => agent.name)
            .map((agent) => [agent.name as string, agent]),
    );

    return {
        ...snapshot,
        agents: snapshot.agents.map((agent) => {
            const runtime = (agent.id ? runtimeById.get(agent.id) : undefined) || runtimeByName.get(agent.name);
            return {
                id: agent.id || runtime?.id,
                name: agent.name || runtime?.name || 'Agent',
                status: runtime?.status || agent.status,
            };
        }),
    };
}

export function buildFounderCompanyDashboardBlockers(
    workspace: FounderCompanyDashboardWorkspaceLike | null | undefined,
    snapshot: FounderCompanyDashboardSnapshot,
): string[] {
    const blockers = [...(snapshot.blockers || [])];

    if (!workspace) {
        blockers.push('还没有创建 Founder Workspace。');
        return dedupeFounderBlockers(blockers);
    }

    const planStatus = workspace.latest_plan?.plan_status || '';
    if (workspace.materialization_status !== 'completed') {
        if (planStatus === 'ready_for_deploy_prep') {
            blockers.push('Founder 方案已经就绪，但还没有执行物化。');
        } else {
            blockers.push('Founder 方案还没进入可物化阶段。');
        }
    }

    if (workspace.materialization_status === 'completed' && snapshot.agents.length === 0) {
        blockers.push('已完成物化，但还没有同步到可展示的 Agent 运行态。');
    }

    if (workspace.materialization_status === 'completed' && (snapshot.triggerCount || 0) === 0) {
        blockers.push('Starter triggers 还没有就绪。');
    }

    for (const agent of snapshot.agents) {
        const normalizedStatus = (agent.status || '').toLowerCase();
        if (ERROR_AGENT_STATUSES.has(normalizedStatus)) {
            blockers.push(`${agent.name} 当前处于 error 状态。`);
        }
    }

    return dedupeFounderBlockers(blockers);
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
