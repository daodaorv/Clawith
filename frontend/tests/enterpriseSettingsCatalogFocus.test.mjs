import assert from 'node:assert/strict';

import {
    focusSkillPackCatalog,
    focusTemplateCatalog,
} from '../.tmp-tests/enterpriseSettingsCatalogFocus.js';

const templates = [
    { canonical_name: 'Founder Copilot', template_key: 'founder-copilot' },
    { canonical_name: 'Report Analyst', template_key: 'report-analyst' },
];

const skillPacks = [
    { pack_id: 'founder-strategy-pack', display_name_zh: '创业策略包' },
    { pack_id: 'report-output-pack', display_name_zh: '报告输出包' },
];

assert.deepStrictEqual(
    focusTemplateCatalog(templates, null),
    templates,
    'template spotlight should keep the full list when no focus is set',
);

assert.deepStrictEqual(
    focusTemplateCatalog(templates, 'Founder Copilot'),
    [templates[0]],
    'template spotlight should keep only the focused template when a canonical name is provided',
);

assert.deepStrictEqual(
    focusSkillPackCatalog(skillPacks, null),
    skillPacks,
    'skill-pack spotlight should keep the full list when no focus is set',
);

assert.deepStrictEqual(
    focusSkillPackCatalog(skillPacks, 'report-output-pack'),
    [skillPacks[1]],
    'skill-pack spotlight should keep only the focused pack when a pack id is provided',
);

console.log('enterpriseSettingsCatalogFocus tests passed');
