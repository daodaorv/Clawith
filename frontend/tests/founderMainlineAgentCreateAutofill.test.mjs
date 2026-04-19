import assert from 'node:assert/strict';

import * as founderMainlineDraftPlanSummary from '../src/services/founderMainlineDraftPlanSummary.ts';

assert.equal(
    typeof founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateAutofill,
    'function',
    'service should expose founder recommendation autofill resolver',
);

const currentForm = {
    template_id: '',
    role_description: 'Keep the founder business brief intact.',
    personality: '',
    boundaries: '',
    skill_ids: ['skill-default'],
};

const templates = [
    {
        id: 'tmpl-founder',
        name: 'Founder Copilot',
        description: 'This template description should not replace the existing founder brief.',
        soul_template: [
            '# Soul - {name}',
            '',
            '## Personality',
            'Think in stages, focus on leverage.',
            '',
            '## Boundaries',
            'Escalate strategic commitments before sending them.',
        ].join('\n'),
    },
    {
        id: 'tmpl-content',
        name: 'Content Strategy Lead',
        description: 'Fallback content lead template.',
        soul_template: [
            '# Soul - {name}',
            '',
            '## Personality',
            'Build repeatable content systems.',
            '',
            '## Boundaries',
            'Do not publish without approval.',
        ].join('\n'),
    },
];

const templateLibraryItems = [
    {
        template_key: 'founder-copilot',
        canonical_name: 'Founder Copilot',
        display_name_zh: '创业导师',
    },
    {
        template_key: 'content-strategy-lead',
        canonical_name: 'Content Strategy Lead',
        display_name_zh: '内容策划负责人',
    },
];

const skillPacks = [
    {
        pack_id: 'founder-strategy-pack',
        included_skills: ['web-research', 'data-analysis'],
    },
    {
        pack_id: 'report-output-pack',
        included_skills: ['content-writing', 'data-analysis'],
    },
];

const skills = [
    { id: 'skill-default', folder_name: 'baseline-support' },
    { id: 'skill-web', folder_name: 'web-research' },
    { id: 'skill-data', folder_name: 'data-analysis' },
    { id: 'skill-writing', folder_name: 'content-writing' },
];

const autofill = founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateAutofill({
    summary: {
        founderTemplateKey: 'founder-copilot',
        recommendedTemplateKeys: ['founder-copilot', 'content-strategy-lead'],
        recommendedPackIds: ['founder-strategy-pack', 'report-output-pack', 'missing-pack'],
    },
    templates,
    templateLibraryItems,
    skillPacks,
    skills,
    currentForm,
});

assert.equal(
    autofill.nextForm.template_id,
    'tmpl-founder',
    'autofill should map the founder template key back to the existing template id',
);

assert.equal(
    autofill.nextForm.role_description,
    'Keep the founder business brief intact.',
    'autofill should preserve the existing founder brief instead of overwriting it with a generic template description',
);

assert.equal(
    autofill.nextForm.personality,
    'Think in stages, focus on leverage.',
    'autofill should reuse the template personality section',
);

assert.equal(
    autofill.nextForm.boundaries,
    'Escalate strategic commitments before sending them.',
    'autofill should reuse the template boundaries section',
);

assert.deepStrictEqual(
    autofill.nextForm.skill_ids,
    ['skill-default', 'skill-web', 'skill-data', 'skill-writing'],
    'autofill should merge recommended pack skills into the current skill selection without duplicates',
);

assert.deepStrictEqual(
    autofill.unresolvedPackIds,
    ['missing-pack'],
    'autofill should surface recommended packs that cannot be resolved locally',
);

const fallbackAutofill = founderMainlineDraftPlanSummary.resolveFounderMainlineAgentCreateAutofill({
    summary: {
        founderTemplateKey: 'missing-founder-template',
        recommendedTemplateKeys: ['missing-founder-template', 'content-strategy-lead'],
        recommendedPackIds: [],
    },
    templates,
    templateLibraryItems,
    skillPacks,
    skills,
    currentForm,
});

assert.equal(
    fallbackAutofill.nextForm.template_id,
    'tmpl-content',
    'autofill should fall back to the next resolvable recommended template when the founder template cannot be matched',
);

assert.deepStrictEqual(
    fallbackAutofill.unresolvedTemplateKeys,
    ['missing-founder-template'],
    'autofill should report unresolved template keys',
);

console.log('founderMainlineAgentCreateAutofill tests passed');
