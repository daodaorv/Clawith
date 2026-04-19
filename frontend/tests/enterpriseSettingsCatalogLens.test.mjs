import assert from 'node:assert/strict';

import { buildCatalogManagementLens } from '../.tmp-tests/enterpriseSettingsCatalogLens.js';

const chineseLens = buildCatalogManagementLens({
    isChineseUi: true,
    query: '',
    templateFilter: 'all',
    skillPackFilter: 'all',
    templateSpotlightLabel: '',
    skillPackSpotlightLabel: '',
});

assert.equal(
    chineseLens.summary,
    '模板：全部模板 · 能力包：全部能力包',
    'default Chinese lens should describe the full template and skill-pack views',
);
assert.equal(
    chineseLens.hasCustomizations,
    false,
    'default lens should not be treated as a customized management view',
);
assert.equal(
    chineseLens.segments.length,
    2,
    'default lens should include only the template and skill-pack scope segments',
);
assert.match(
    chineseLens.explanation,
    /完整目录|管理视角/,
    'default lens explanation should explain that the full management catalog is being shown',
);

const focusedLens = buildCatalogManagementLens({
    isChineseUi: true,
    query: '客服',
    templateFilter: 'validated',
    skillPackFilter: 'high-risk',
    templateSpotlightLabel: '客服跟进模板',
    skillPackSpotlightLabel: '',
});

assert.equal(
    focusedLens.summary,
    '模板：已验证 · 能力包：高风险 · 关键词：客服 · 模板聚焦：客服跟进模板',
    'custom Chinese lens should combine filters, keyword, and spotlight into one summary',
);
assert.equal(
    focusedLens.hasCustomizations,
    true,
    'custom lens should be marked as a customized management view',
);
assert.equal(
    focusedLens.hasSpotlight,
    true,
    'spotlighted lens should remember that relation focus is active',
);
assert.deepStrictEqual(
    focusedLens.segments.map((segment) => ({ label: segment.label, tone: segment.tone, clearable: segment.clearable })),
    [
        { label: '模板：已验证', tone: 'active', clearable: false },
        { label: '能力包：高风险', tone: 'active', clearable: false },
        { label: '关键词：客服', tone: 'active', clearable: false },
        { label: '模板聚焦：客服跟进模板', tone: 'focus', clearable: true },
    ],
    'segment metadata should preserve which parts are active and which spotlight pills can be cleared',
);
assert.match(
    focusedLens.explanation,
    /聚焦|恢复|筛选视角/,
    'spotlight explanation should clarify that focus is currently overriding the broader catalog view',
);

const englishLens = buildCatalogManagementLens({
    isChineseUi: false,
    query: 'report',
    templateFilter: 'pack-linked',
    skillPackFilter: 'role-linked',
    templateSpotlightLabel: '',
    skillPackSpotlightLabel: 'Report Output Pack',
});

assert.equal(
    englishLens.summary,
    'Templates: Pack-linked · Packs: Role-linked · Keyword: report · Pack focus: Report Output Pack',
    'English lens should expose the same management summary in English-first copy',
);
assert.equal(
    englishLens.segments.at(-1)?.clearable,
    true,
    'English spotlight segments should also be individually clearable',
);

console.log('enterpriseSettingsCatalogLens tests passed');
