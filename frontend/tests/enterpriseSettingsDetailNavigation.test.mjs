import assert from 'node:assert/strict';

import {
    findTemplateByCanonicalName,
    openSkillPackDetailState,
    openTemplateDetailState,
} from '../.tmp-tests/enterpriseSettingsDetailNavigation.js';

const template = { template_key: 'customer-success-lead' };
const skillPack = { pack_id: 'crm-handoff-pack' };
const templates = [
    { canonical_name: 'customer_success_lead', template_key: 'customer-success-lead' },
    { canonical_name: 'sales_ops_partner', template_key: 'sales-ops-partner' },
];

assert.deepStrictEqual(
    openTemplateDetailState(
        {
            selectedTemplateDetail: null,
            selectedSkillPackDetail: skillPack,
        },
        template,
    ),
    {
        selectedTemplateDetail: template,
        selectedSkillPackDetail: null,
    },
    'opening a template detail should clear any open skill-pack detail',
);

assert.deepStrictEqual(
    openSkillPackDetailState(
        {
            selectedTemplateDetail: template,
            selectedSkillPackDetail: null,
        },
        skillPack,
    ),
    {
        selectedTemplateDetail: null,
        selectedSkillPackDetail: skillPack,
    },
    'opening a skill-pack detail should clear any open template detail',
);

assert.deepStrictEqual(
    findTemplateByCanonicalName(templates, 'sales_ops_partner'),
    templates[1],
    'known recommended role should resolve to its template detail',
);

assert.equal(
    findTemplateByCanonicalName(templates, 'unknown_role'),
    null,
    'unknown recommended role should safely fall back to non-clickable rendering',
);

console.log('enterpriseSettingsDetailNavigation tests passed');
