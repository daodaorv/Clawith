import assert from 'node:assert/strict';

import {
    deriveFounderWorkspaceStep,
    resolveFounderWorkspaceSelection,
} from '../src/services/founderWorkspace.ts';

assert.equal(
    deriveFounderWorkspaceStep({
        current_state: 'intake',
        latest_plan: { plan_status: 'step0_blocked' },
        materialization_status: 'not_started',
    }),
    'intake',
);

assert.equal(
    deriveFounderWorkspaceStep({
        current_state: 'planning',
        latest_plan: { plan_status: 'ready_for_deploy_prep' },
        materialization_status: 'not_started',
    }),
    'review',
);

assert.equal(
    deriveFounderWorkspaceStep({
        current_state: 'materialized',
        latest_plan: { plan_status: 'ready_for_deploy_prep' },
        materialization_status: 'completed',
    }),
    'dashboard',
);

assert.equal(
    resolveFounderWorkspaceSelection(
        [
            {
                id: 'workspace-1',
                current_state: 'planning',
                latest_plan: { plan_status: 'interview_in_progress' },
                materialization_status: 'not_started',
            },
            {
                id: 'workspace-2',
                current_state: 'planning',
                latest_plan: { plan_status: 'ready_for_deploy_prep' },
                materialization_status: 'not_started',
            },
        ],
        'workspace-2',
    )?.id,
    'workspace-2',
);

assert.equal(
    resolveFounderWorkspaceSelection(
        [
            {
                id: 'workspace-1',
                current_state: 'planning',
                latest_plan: { plan_status: 'interview_in_progress' },
                materialization_status: 'not_started',
            },
            {
                id: 'workspace-2',
                current_state: 'planning',
                latest_plan: { plan_status: 'ready_for_deploy_prep' },
                materialization_status: 'not_started',
            },
        ],
        'missing-workspace',
    )?.id,
    'workspace-1',
);

console.log('founderWorkspaceState tests passed');
