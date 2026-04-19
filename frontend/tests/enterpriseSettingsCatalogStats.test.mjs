import assert from 'node:assert/strict';

import {
    buildSkillPackCatalogStats,
    buildTemplateCatalogStats,
} from '../.tmp-tests/enterpriseSettingsCatalogStats.js';

const templates = [
    {
        recommended_skill_packs: ['founder-strategy-pack'],
        default_autonomy_level: 'high',
        validation_status: 'validated',
    },
    {
        recommended_skill_packs: [],
        default_autonomy_level: 'medium',
        validation_status: 'draft',
    },
    {
        recommended_skill_packs: ['report-output-pack'],
        default_autonomy_level: 'high',
        validation_status: 'validated',
    },
];

const skillPacks = [
    {
        recommended_roles: ['Founder Copilot'],
        required_tools: ['crm'],
        required_integrations: [],
        risk_level: 'high',
    },
    {
        recommended_roles: [],
        required_tools: [],
        required_integrations: [],
        risk_level: 'low',
    },
    {
        recommended_roles: ['Report Analyst'],
        required_tools: [],
        required_integrations: ['feishu'],
        risk_level: 'medium',
    },
];

assert.deepStrictEqual(
    buildTemplateCatalogStats(templates),
    {
        all: 3,
        validated: 2,
        highAutonomy: 2,
        packLinked: 2,
    },
    'template management stats should count validated, high-autonomy, and pack-linked templates',
);

assert.deepStrictEqual(
    buildSkillPackCatalogStats(skillPacks),
    {
        all: 3,
        highRisk: 1,
        roleLinked: 2,
        toolRequired: 2,
    },
    'skill-pack management stats should count high-risk, role-linked, and tool-required packs',
);

console.log('enterpriseSettingsCatalogStats tests passed');
