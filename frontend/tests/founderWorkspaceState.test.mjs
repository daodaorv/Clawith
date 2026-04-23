import assert from 'node:assert/strict';

import { deriveFounderWorkspaceStep } from '../src/services/founderWorkspace.ts';

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

console.log('founderWorkspaceState tests passed');
