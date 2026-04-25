import assert from 'node:assert/strict';

import {
    buildFounderMainlineE2eConfig,
    buildFounderMainlineE2eScenario,
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
assert.equal(config.edgePath, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
assert.equal(config.headless, true);
assert.equal(config.modelLabel, '');
assert.match(config.runtimeDir, /openclaw-founder-e2e-runtime/i);
assert.match(config.screenshotDir, /output[\\/]playwright$/i);

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

assert.throws(() => buildFounderMainlineE2eConfig({ FOUNDER_E2E_EMAIL: 'founder@example.com' }), /provided together/);
assert.throws(() => buildFounderMainlineE2eConfig({ FOUNDER_E2E_PASSWORD: 'OpenClaw!12345' }), /provided together/);

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

console.log('founderMainlineE2eRuntime tests passed');
