import assert from 'node:assert/strict';

import {
    buildFounderCompanyDashboardBlockers,
    hydrateFounderCompanyDashboardSnapshot,
    resolveFounderCompanyDashboardSnapshot,
    resolveFounderCompanyDashboardWorkspace,
    summarizeFounderCompanyDashboard,
} from '../src/services/founderCompanyDashboard.ts';

const summary = summarizeFounderCompanyDashboard({
    companyName: 'Solo Growth Studio',
    agents: [
        { name: 'Founder Copilot', status: 'active' },
        { name: 'Content Strategy Lead', status: 'active' },
        { name: 'Global Distribution Lead', status: 'paused' },
    ],
    blockers: ['邮件渠道未配置'],
});

assert.equal(summary.activeAgentCount, 2);
assert.equal(summary.hasBlockers, true);
assert.equal(summary.headlineZh, 'Solo Growth Studio 当前有 2 个活跃 Agent');
assert.equal(summary.nextActionZh, '先处理 1 个阻塞项，再恢复自动协作节奏。');

assert.equal(
    resolveFounderCompanyDashboardWorkspace(
        [
            {
                id: 'workspace-1',
                name: 'Old Workspace',
                current_state: 'materialized',
                materialization_status: 'completed',
                latest_plan: { plan_status: 'ready_for_deploy_prep' },
            },
            {
                id: 'workspace-2',
                name: 'Current Workspace',
                current_state: 'materialized',
                materialization_status: 'completed',
                latest_plan: { plan_status: 'ready_for_deploy_prep' },
                dashboard_snapshot: {
                    workspace_id: 'workspace-2',
                    created_agents: [],
                    relationship_count: 0,
                    trigger_count: 0,
                },
            },
        ],
        {
            workspaceId: 'workspace-2',
            companyName: 'Current Workspace',
            agents: [],
            blockers: [],
            relationshipCount: 0,
            triggerCount: 0,
        },
    )?.id,
    'workspace-2',
);

assert.deepEqual(
    resolveFounderCompanyDashboardSnapshot(
        {
            name: 'Workspace Snapshot',
            current_state: 'materialized',
            materialization_status: 'completed',
            latest_plan: { plan_status: 'ready_for_deploy_prep' },
            dashboard_snapshot: {
                workspace_id: 'workspace-1',
                current_state: 'materialized',
                materialization_status: 'completed',
                created_agents: [
                    { id: 'agent-1', name: 'Founder Copilot', canonical_name: 'Founder Copilot', template_key: 'founder-copilot' },
                ],
                relationship_count: 3,
                trigger_count: 2,
            },
        },
        {
            companyName: 'Local Snapshot',
            agents: [],
            blockers: ['stale'],
            relationshipCount: 0,
            triggerCount: 0,
        },
    ),
    {
        workspaceId: 'workspace-1',
        companyName: 'Workspace Snapshot',
        agents: [{ id: 'agent-1', name: 'Founder Copilot', status: 'idle' }],
        blockers: [],
        relationshipCount: 3,
        triggerCount: 2,
    },
);

assert.deepEqual(
    hydrateFounderCompanyDashboardSnapshot(
        {
            workspaceId: 'workspace-1',
            companyName: 'Workspace Snapshot',
            agents: [
                { id: 'agent-1', name: 'Founder Copilot', status: 'idle' },
                { id: 'agent-2', name: 'Content Strategy Lead', status: 'idle' },
            ],
            blockers: [],
            relationshipCount: 3,
            triggerCount: 2,
        },
        [
            { id: 'agent-1', name: 'Founder Copilot', status: 'running' },
            { id: 'agent-2', name: 'Content Strategy Lead', status: 'error' },
        ],
    ),
    {
        workspaceId: 'workspace-1',
        companyName: 'Workspace Snapshot',
        agents: [
            { id: 'agent-1', name: 'Founder Copilot', status: 'running' },
            { id: 'agent-2', name: 'Content Strategy Lead', status: 'error' },
        ],
        blockers: [],
        relationshipCount: 3,
        triggerCount: 2,
    },
);

assert.deepEqual(
    buildFounderCompanyDashboardBlockers(
        {
            name: 'Workspace Snapshot',
            current_state: 'planning',
            materialization_status: 'not_started',
            latest_plan: { plan_status: 'ready_for_plan' },
        },
        {
            workspaceId: 'workspace-1',
            companyName: 'Workspace Snapshot',
            agents: [],
            blockers: [],
            relationshipCount: 0,
            triggerCount: 0,
        },
    ),
    ['Founder 方案还没进入可物化阶段。'],
);

assert.deepEqual(
    buildFounderCompanyDashboardBlockers(
        {
            name: 'Workspace Snapshot',
            current_state: 'materialized',
            materialization_status: 'completed',
            latest_plan: { plan_status: 'ready_for_deploy_prep' },
        },
        {
            workspaceId: 'workspace-1',
            companyName: 'Workspace Snapshot',
            agents: [
                { id: 'agent-1', name: 'Founder Copilot', status: 'running' },
                { id: 'agent-2', name: 'Content Strategy Lead', status: 'error' },
            ],
            blockers: [],
            relationshipCount: 1,
            triggerCount: 2,
        },
    ),
    ['Content Strategy Lead 当前处于 error 状态。'],
);

console.log('founderCompanyDashboard tests passed');
