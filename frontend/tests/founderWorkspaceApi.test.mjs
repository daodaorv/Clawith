import assert from 'node:assert/strict';

import {
    buildFounderWorkspaceAnswerMap,
    founderWorkspaceApi,
} from '../src/services/founderWorkspace.ts';

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

const requests = [];

globalThis.localStorage = {
    getItem(key) {
        if (key === 'token') {
            return 'test-token';
        }
        return null;
    },
};

globalThis.fetch = async (url, options = {}) => {
    requests.push({
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.parse(options.body) : undefined,
    });
    return {
        ok: true,
        async text() {
            return '';
        },
        async json() {
            return {
                id: 'workspace-1',
                name: 'Solo Growth Studio',
                owner_user_id: 'user-1',
                business_brief: '做出海创作者的一人公司',
                business_logic: {},
                current_state: 'planning',
                materialization_status: 'not_started',
                latest_plan: { plan_status: 'interview_in_progress' },
                planning_context: {
                    answers: [
                        { group_id: 'market_target_users', answer_text: '出海内容创作者' },
                    ],
                },
                draft_plan: null,
                dashboard_snapshot: {},
            };
        },
    };
};

await founderWorkspaceApi.saveInterviewProgress('workspace-1', {
    business_brief: '做出海创作者的一人公司',
    model_ready_context: {
        resolved_provider: 'openai-compatible',
        recommended_model: 'gpt-4.1-mini',
    },
    answers: [
        { group_id: 'market_target_users', answer_text: '出海内容创作者' },
    ],
});

await founderWorkspaceApi.generateDraftPlan('workspace-1', {
    business_brief: '做出海创作者的一人公司',
    model_ready_context: {
        resolved_provider: 'openai-compatible',
        recommended_model: 'gpt-4.1-mini',
    },
    answers: [
        { group_id: 'market_target_users', answer_text: '出海内容创作者' },
    ],
    user_confirmed: true,
});

assert.equal(requests[0].url, '/api/founder-workspaces/workspace-1/planning/interview-progress');
assert.equal(requests[0].method, 'POST');
assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
assert.equal(requests[1].url, '/api/founder-workspaces/workspace-1/planning/draft-plan');
assert.equal(requests[1].body.user_confirmed, true);

assert.deepEqual(
    buildFounderWorkspaceAnswerMap({
        planning_context: {
            answers: [
                { group_id: 'market_target_users', answer_text: '出海内容创作者' },
                { group_id: 'core_product_service', answer_text: '咨询 + 训练营' },
            ],
        },
    }),
    {
        market_target_users: '出海内容创作者',
        core_product_service: '咨询 + 训练营',
    },
);

globalThis.fetch = originalFetch;
globalThis.localStorage = originalLocalStorage;

console.log('founderWorkspaceApi tests passed');
