import assert from 'node:assert/strict';

import {
    resolveFounderCompanyDashboardSnapshot,
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

assert.deepEqual(
    resolveFounderCompanyDashboardSnapshot(
        {
            name: 'Workspace Snapshot',
            dashboard_snapshot: {
                workspace_id: 'workspace-1',
                current_state: 'materialized',
                materialization_status: 'completed',
                created_agents: [
                    { name: 'Founder Copilot', canonical_name: 'Founder Copilot', template_key: 'founder-copilot' },
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
        agents: [{ name: 'Founder Copilot', status: 'idle' }],
        blockers: [],
        relationshipCount: 3,
        triggerCount: 2,
    },
);

console.log('founderCompanyDashboard tests passed');
