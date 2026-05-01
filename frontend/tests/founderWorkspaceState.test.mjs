import assert from 'node:assert/strict';

import * as founderWorkspaceService from '../src/services/founderWorkspace.ts';

const {
    deriveFounderWorkspaceStep,
    resolveFounderWorkspaceSelection,
} = founderWorkspaceService;

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
        {
            routeWorkspaceId: 'workspace-2',
            persistedWorkspaceId: 'workspace-1',
        },
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
        {
            routeWorkspaceId: 'missing-workspace',
            persistedWorkspaceId: 'workspace-2',
        },
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
        {
            routeWorkspaceId: 'missing-workspace',
            persistedWorkspaceId: 'missing-too',
        },
    )?.id,
    'workspace-1',
);

assert.equal(
    founderWorkspaceService.formatFounderWorkspaceBusinessLogic?.({
        offer: 'Appointment-based local service packages',
        channel: 'Local short video + referrals + private traffic',
        _founder_runtime: { scenario: 'local-service-leadgen' },
    }),
    'offer: Appointment-based local service packages | channel: Local short video + referrals + private traffic',
);

assert.equal(
    founderWorkspaceService.formatFounderWorkspaceBusinessLogic?.({
        _founder_runtime: { scenario: 'local-service-leadgen' },
    }),
    'N/A',
);

console.log('founderWorkspaceState tests passed');
