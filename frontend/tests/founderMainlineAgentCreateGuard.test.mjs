import assert from 'node:assert/strict';

import * as founderMainlineDraftPlanSummary from '../src/services/founderMainlineDraftPlanSummary.ts';

assert.equal(
    typeof founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateGuard,
    'function',
    'service should expose founder create guard resolver',
);

const notApplied = founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateGuard({
    summary: {
        canEnterDeployPrep: false,
        deployPrepBlockerReasonZh: '请先确认当前草案',
        deployPrepMissingItems: ['确认当前草案'],
    },
    recommendationApplied: false,
    isChineseUi: true,
});

assert.equal(
    notApplied.isBlocked,
    false,
    'create guard should not block ordinary manual creation when founder recommendation was not applied',
);

const blocked = founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateGuard({
    summary: {
        canEnterDeployPrep: false,
        deployPrepBlockerReasonZh: '请先确认当前草案',
        deployPrepMissingItems: ['确认当前草案', '补齐审批边界'],
    },
    recommendationApplied: true,
    isChineseUi: true,
});

assert.equal(
    blocked.isBlocked,
    true,
    'create guard should block founder-assisted creation until deploy prep is ready',
);

assert.equal(
    blocked.message,
    '当前 founder 推荐还不能直接创建：请先确认当前草案；仍缺：确认当前草案、补齐审批边界',
    'create guard should surface the deploy-prep blocker and missing items',
);

const ready = founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateGuard({
    summary: {
        canEnterDeployPrep: true,
        deployPrepBlockerReasonZh: '',
        deployPrepMissingItems: [],
    },
    recommendationApplied: true,
    isChineseUi: true,
});

assert.equal(
    ready.isBlocked,
    false,
    'create guard should allow founder-assisted creation once deploy prep is ready',
);

console.log('founderMainlineAgentCreateGuard tests passed');
