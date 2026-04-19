import assert from 'node:assert/strict';

import {
    filterSkillPackCatalog,
    filterTemplateCatalog,
} from '../.tmp-tests/enterpriseSettingsCatalogFilters.js';

const templates = [
    {
        template_key: 'founder-copilot',
        canonical_name: 'Founder Copilot',
        display_name_zh: '创业导师',
        role_level: 'lead',
        role_type: 'strategy',
        primary_goal: '帮助创始人梳理增长路径',
        default_autonomy_level: 'high',
        default_boundaries: ['需要高价值决策前先确认'],
        recommended_skill_packs: ['founder-strategy-pack'],
        validation_status: 'validated',
    },
    {
        template_key: 'report-analyst',
        canonical_name: 'Report Analyst',
        display_name_zh: '报告分析师',
        role_level: 'specialist',
        role_type: 'analysis',
        primary_goal: '整理经营周报',
        default_autonomy_level: 'medium',
        default_boundaries: ['仅输出草稿'],
        recommended_skill_packs: [],
        validation_status: 'draft',
    },
];

const skillPacks = [
    {
        pack_id: 'founder-strategy-pack',
        display_name_zh: '创业策略包',
        display_name_en: 'Founder Strategy Pack',
        business_goal: '帮助创始人访谈与经营判断',
        recommended_roles: ['Founder Copilot'],
        included_skills: ['interview', 'strategy'],
        required_tools: ['crm'],
        required_integrations: ['feishu'],
        risk_level: 'high',
        status: 'active',
    },
    {
        pack_id: 'report-output-pack',
        display_name_zh: '报告输出包',
        display_name_en: 'Report Output Pack',
        business_goal: '整理并输出周报',
        recommended_roles: [],
        included_skills: ['reporting'],
        required_tools: [],
        required_integrations: [],
        risk_level: 'low',
        status: 'draft',
    },
];

assert.deepStrictEqual(
    filterTemplateCatalog(templates, {
        query: '创业',
        filter: 'all',
        packLabelById: {
            'founder-strategy-pack': '创业策略包',
        },
    }),
    [templates[0]],
    'template search should match Chinese display names and pack labels',
);

assert.deepStrictEqual(
    filterTemplateCatalog(templates, {
        query: '',
        filter: 'pack-linked',
        packLabelById: {},
    }),
    [templates[0]],
    'pack-linked filter should keep only templates with recommended packs',
);

assert.deepStrictEqual(
    filterSkillPackCatalog(skillPacks, {
        query: '创始人',
        filter: 'all',
        templateLabelByCanonical: {
            'Founder Copilot': '创业导师',
        },
        skillLabelByFolder: {},
    }),
    [skillPacks[0]],
    'skill-pack search should match related role labels',
);

assert.deepStrictEqual(
    filterSkillPackCatalog(skillPacks, {
        query: '',
        filter: 'tool-required',
        templateLabelByCanonical: {},
        skillLabelByFolder: {},
    }),
    [skillPacks[0]],
    'tool-required filter should keep only packs with required tools or integrations',
);

console.log('enterpriseSettingsCatalogFilters tests passed');
