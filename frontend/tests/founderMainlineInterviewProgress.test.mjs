import assert from 'node:assert/strict';

import {
    buildFounderMainlinePlanningPayload,
    countFounderMainlineAnsweredGroups,
} from '../src/services/founderMainlineInterviewProgress.ts';

const payload = buildFounderMainlinePlanningPayload({
    businessBrief: '  我们是中文团队，想做出海知识付费内容。  ',
    locale: 'zh-CN',
    scenarioId: 'cn-team-global-content-knowledge',
    selectedModel: {
        provider: 'openai-compatible',
        model: 'gpt-4.1-mini',
        base_url: 'https://example.com/v1',
    },
    answersByGroup: {
        market_target_users: '  主要面向海外华人创作者。 ',
        core_product_service: '',
        content_language_requirements: '需要中英双语内容。',
    },
});

assert.deepStrictEqual(
    payload,
    {
        business_brief: '我们是中文团队，想做出海知识付费内容。',
        locale: 'zh-CN',
        scenario_id: 'cn-team-global-content-knowledge',
        model_ready_context: {
            resolved_provider: 'openai-compatible',
            recommended_model: 'gpt-4.1-mini',
            normalized_base_url: 'https://example.com/v1',
        },
        answers: [
            {
                group_id: 'market_target_users',
                answer_text: '主要面向海外华人创作者。',
            },
            {
                group_id: 'content_language_requirements',
                answer_text: '需要中英双语内容。',
            },
        ],
    },
    'planning payload should trim the brief, normalize model context, and drop empty answers',
);

assert.equal(
    countFounderMainlineAnsweredGroups({
        market_target_users: '主要面向海外华人创作者。',
        core_product_service: '   ',
        automation_human_boundary: '需要保留人工审核。',
    }),
    2,
    'answered-group counter should only count non-empty answers',
);

console.log('founderMainlineInterviewProgress tests passed');
