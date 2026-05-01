import assert from 'node:assert/strict';

import {
    buildFounderMainlineE2eConfig,
    buildFounderMainlineE2eScenario,
    buildFounderMainlineE2eWalkthroughMarkdown,
    buildFounderDashboardUrl,
    buildFounderWorkspaceUrl,
} from '../src/services/founderMainlineE2e.ts';

const config = buildFounderMainlineE2eConfig({
    FOUNDER_E2E_EMAIL: 'founder@example.com',
    FOUNDER_E2E_PASSWORD: 'OpenClaw!12345',
});

assert.equal(config.authMode, 'login');
assert.equal(config.email, 'founder@example.com');
assert.equal(config.password, 'OpenClaw!12345');
assert.equal(config.baseUrl, 'http://127.0.0.1:3010');
assert.equal(config.tenantName, 'Solo Founder Lab');
assert.equal(config.scenarioKey, 'content-knowledge');
assert.equal(config.edgePath, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
assert.equal(config.headless, true);
assert.equal(config.cleanupAfterRun, false);
assert.equal(config.modelLabel, '');
assert.match(config.runtimeDir, /openclaw-founder-e2e-runtime/i);
assert.match(config.screenshotDir, /output[\\/]playwright$/i);
assert.match(config.walkthroughPath, /output[\\/]playwright[\\/]founder-onboarding-walkthrough\.md$/i);

assert.equal(
    buildFounderWorkspaceUrl(config.baseUrl, 'workspace-123'),
    'http://127.0.0.1:3010/founder-workspace?workspaceId=workspace-123',
);
assert.equal(
    buildFounderWorkspaceUrl(config.baseUrl),
    'http://127.0.0.1:3010/founder-workspace',
);
assert.equal(
    buildFounderDashboardUrl(config.baseUrl, 'workspace-123'),
    'http://127.0.0.1:3010/founder-workspace/dashboard?workspaceId=workspace-123',
);

const selfBootstrapConfig = buildFounderMainlineE2eConfig({});
assert.equal(selfBootstrapConfig.authMode, 'self_bootstrap');
assert.equal(selfBootstrapConfig.email, '');
assert.equal(selfBootstrapConfig.password, '');
assert.equal(selfBootstrapConfig.baseUrl, 'http://127.0.0.1:3010');
assert.equal(selfBootstrapConfig.cleanupAfterRun, true);

const selfBootstrapNoCleanupConfig = buildFounderMainlineE2eConfig({ FOUNDER_E2E_SKIP_CLEANUP: '1' });
assert.equal(selfBootstrapNoCleanupConfig.authMode, 'self_bootstrap');
assert.equal(selfBootstrapNoCleanupConfig.cleanupAfterRun, false);

const customWalkthroughConfig = buildFounderMainlineE2eConfig({
    FOUNDER_E2E_WALKTHROUGH_PATH: 'output/custom-founder-walkthrough.md',
});
assert.equal(customWalkthroughConfig.walkthroughPath, 'output/custom-founder-walkthrough.md');

const localServiceConfig = buildFounderMainlineE2eConfig({ FOUNDER_E2E_SCENARIO: 'cn-local-service-leadgen' });
assert.equal(localServiceConfig.scenarioKey, 'local-service-leadgen');

const saasOpsConfig = buildFounderMainlineE2eConfig({ FOUNDER_E2E_SCENARIO: 'saas' });
assert.equal(saasOpsConfig.scenarioKey, 'saas-ops-automation');

const ecommerceConfig = buildFounderMainlineE2eConfig({ FOUNDER_E2E_SCENARIO: 'cross-border-ecommerce' });
assert.equal(ecommerceConfig.scenarioKey, 'cross-border-ecommerce');

assert.throws(() => buildFounderMainlineE2eConfig({ FOUNDER_E2E_EMAIL: 'founder@example.com' }), /provided together/);
assert.throws(() => buildFounderMainlineE2eConfig({ FOUNDER_E2E_PASSWORD: 'OpenClaw!12345' }), /provided together/);
assert.throws(() => buildFounderMainlineE2eConfig({ FOUNDER_E2E_SCENARIO: 'unknown-scenario' }), /Unsupported/);

const scenario = buildFounderMainlineE2eScenario('2026-04-24T19-40-00-000Z');

assert.equal(scenario.answers.length, 8);
assert.equal(scenario.workspaceName, 'Founder Workspace 19-40-00');
assert.equal(scenario.coreOffer, 'Consulting + cohort program');
assert.equal(scenario.acquisitionChannel, 'Short video + email + community');
assert.equal(scenario.answers[0].groupId, 'market_target_users');
assert.match(scenario.businessBrief, /founder growth studio/i);
assert.match(scenario.answers[0].answerText, /overseas chinese creators/i);
assert.equal(scenario.answers.at(-1)?.groupId, 'team_gap_role_preference');
assert.match(scenario.answers.at(-1)?.answerText || '', /founder PM support/i);
assert.equal(scenario.scenarioKey, 'content-knowledge');
assert.ok(scenario.expectedDraftTexts.includes('Scenario rationale'));

const localServiceScenario = buildFounderMainlineE2eScenario('2026-04-24T19-40-00-000Z', 'local-service-leadgen');
assert.equal(localServiceScenario.scenarioKey, 'local-service-leadgen');
assert.match(localServiceScenario.businessBrief, /local service/i);
assert.match(localServiceScenario.coreOffer, /local service/i);
assert.ok(localServiceScenario.expectedAgentNames.includes('Customer Follow-up Lead'));
assert.ok(localServiceScenario.expectedDraftTexts.includes('预约转化'));

const saasOpsScenario = buildFounderMainlineE2eScenario('2026-04-24T19-40-00-000Z', 'saas-ops-automation');
assert.equal(saasOpsScenario.scenarioKey, 'saas-ops-automation');
assert.match(saasOpsScenario.businessBrief, /SaaS/i);
assert.match(saasOpsScenario.coreOffer, /SaaS/i);
assert.ok(saasOpsScenario.expectedAgentNames.includes('Project Chief of Staff'));
assert.ok(saasOpsScenario.expectedDraftTexts.includes('客户成功'));

const ecommerceScenario = buildFounderMainlineE2eScenario('2026-04-24T19-40-00-000Z', 'cross-border-ecommerce');
assert.equal(ecommerceScenario.scenarioKey, 'cross-border-ecommerce');
assert.match(ecommerceScenario.businessBrief, /cross-border ecommerce/i);
assert.match(ecommerceScenario.coreOffer, /ecommerce/i);
assert.ok(ecommerceScenario.expectedAgentNames.includes('Global Distribution Lead'));
assert.ok(ecommerceScenario.expectedDraftTexts.includes('cross-border ecommerce'));

const walkthroughMarkdown = buildFounderMainlineE2eWalkthroughMarkdown({
    runId: '2026-05-01T09-35-32-727Z',
    baseUrl: 'http://127.0.0.1:3010',
    scenario: ecommerceScenario,
    status: 'passed',
    screenshots: [
        {
            name: '07-draft-plan',
            title: 'Draft review with scenario explanation',
            note: 'Confirms scenario rationale before materialization.',
            relativePath: './2026-05-01T09-35-32-727Z-07-draft-plan.png',
        },
    ],
    metrics: {
        finalUrl: 'http://127.0.0.1:3010/founder-workspace/dashboard?workspaceId=abc',
        headline: 'Your company currently has 5 agents',
        agentCards: ['Founder Copilot', 'Global Distribution Lead'],
        blockerCount: 0,
        relationshipCount: 4,
        triggerCount: 5,
    },
    cleanupSummary: { deleted_workspaces: 1, ok: true },
});
assert.match(walkthroughMarkdown, /Founder Onboarding Screenshot Walkthrough/);
assert.match(walkthroughMarkdown, /cross-border-ecommerce/);
assert.match(walkthroughMarkdown, /Draft review with scenario explanation/);
assert.match(walkthroughMarkdown, /deleted_workspaces: 1/);

console.log('founderMainlineE2eRuntime tests passed');
