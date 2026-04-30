import assert from 'node:assert/strict';

import { buildFounderMainlineAgentCreateSummary } from '../src/services/founderMainlineDraftPlanSummary.ts';

const summary = buildFounderMainlineAgentCreateSummary({
    scenario_id: 'cn-team-global-content-knowledge',
    scenario_name_zh: 'Chinese team building a global content business',
    locale: 'zh-CN',
    plan_status: 'plan_draft_ready',
    company_blueprint: {
        business_goal: 'generate team draft',
        source_business_brief: 'We are a Chinese-first team building a global knowledge business.',
        summary_zh: 'The current draft prioritizes content growth and founder-office coordination.',
        priority_focus: ['bilingual content', 'global distribution'],
    },
    founder_copilot: {
        canonical_name: 'Founder Copilot',
        display_name_zh: 'Founder Guide',
        role_level: 'lead',
        role_type: 'strategy',
        primary_goal: 'Drive growth, conversion, and staged execution.',
        template_key: 'founder-copilot',
        recommended_skill_packs: ['founder-strategy-pack'],
        human_approval_required: true,
        reason_zh: 'More growth-oriented after correction.',
    },
    teams: [
        {
            team_id: 'content-growth',
            team_name_zh: 'Content Growth Team',
            team_goal: 'Own bilingual content planning, production, and global distribution adaptation.',
            priority: 1,
            roles: [
                {
                    canonical_name: 'Content Strategy Lead',
                    display_name_zh: 'Content Lead',
                    role_level: 'lead',
                    role_type: 'content',
                    primary_goal: 'Lead bilingual content strategy and scripting.',
                    template_key: 'content-strategy-lead',
                    recommended_skill_packs: ['content-production-pack'],
                    human_approval_required: true,
                    reason_zh: 'Prioritize bilingual content.',
                },
            ],
        },
    ],
    template_recommendations: [
        {
            template_key: 'founder-copilot',
            canonical_name: 'Founder Copilot',
            display_name_zh: 'Founder Guide',
            reason_zh: 'Primary founder template.',
        },
    ],
    skill_pack_recommendations: [
        {
            pack_id: 'founder-strategy-pack',
            display_name_zh: 'Founder Strategy Pack',
            reason_zh: 'Supports growth and conversion.',
            recommended_for_roles: ['Founder Copilot'],
        },
    ],
    coordination_relationships: [],
    approval_boundaries: ['formal commitments require human review'],
    open_questions: [],
    deployment_readiness: {
        can_enter_deploy_prep: false,
        blocker_reason_zh: 'waiting for confirmation',
        missing_items: ['confirm current plan'],
        resolved_template_keys: ['founder-copilot'],
        resolved_pack_ids: ['founder-strategy-pack'],
    },
    traceability: [
        {
            source_text: 'SaaS workflow automation for global creators.',
            extracted_signal: 'SaaS workflow automation',
            mapped_entity_type: 'scenario',
            mapped_entity_key: 'cn-team-global-content-knowledge',
        },
        {
            source_text: 'Need content and distribution.',
            extracted_signal: 'content growth team',
            mapped_entity_type: 'team',
            mapped_entity_key: 'content-growth',
        },
    ],
    previous_plan_summary_zh: 'The previous draft included a separate customer follow-up team.',
    change_summary_zh: [
        'Removed the separate customer follow-up team.',
        'Prioritized bilingual content and global distribution.',
    ],
    changed_template_keys: ['customer-followup-lead'],
    changed_pack_ids: ['customer-followup-pack'],
});

assert.equal(
    summary.previousPlanSummaryZh,
    'The previous draft included a separate customer follow-up team.',
    'summary should expose the previous plan summary for correction review',
);

assert.deepStrictEqual(
    summary.changeSummaryZh,
    [
        'Removed the separate customer follow-up team.',
        'Prioritized bilingual content and global distribution.',
    ],
    'summary should expose the correction change summary',
);

assert.deepStrictEqual(
    summary.changedTemplateKeys,
    ['customer-followup-lead'],
    'summary should expose changed template keys',
);

assert.deepStrictEqual(
    summary.changedPackIds,
    ['customer-followup-pack'],
    'summary should expose changed pack ids',
);

assert.equal(
    summary.deployPrepBlockerReasonZh,
    'waiting for confirmation',
    'summary should expose deploy-prep blocker reason',
);

assert.deepStrictEqual(
    summary.deployPrepMissingItems,
    ['confirm current plan'],
    'summary should expose deploy-prep missing items',
);

assert.deepStrictEqual(
    summary.scenarioSignals,
    ['SaaS workflow automation', 'content growth team'],
    'summary should expose human-readable scenario match signals',
);

assert.match(
    summary.scenarioExplanationZh,
    /SaaS workflow automation/,
    'summary should explain why the scenario was selected',
);

assert.deepStrictEqual(
    summary.priorityFocus,
    ['bilingual content', 'global distribution'],
    'summary should expose scenario priority focus chips',
);

assert.deepStrictEqual(
    summary.previewTemplateNamesZh,
    ['Founder Guide', 'Content Lead'],
    'summary should dedupe founder and role template display names for preview',
);

assert.deepStrictEqual(
    summary.previewPackNamesZh,
    ['Founder Strategy Pack'],
    'summary should expose skill-pack display names for preview',
);

console.log('founderMainlineDraftPlanSummary tests passed');
