export const DUODUO_FOUNDER_MAINLINE_ENTRY_KEY = 'duoduo-founder-mainline';
export const DUODUO_FOUNDER_MAINLINE_SCENARIO_ID = 'cn-team-global-content-knowledge';
export const DUODUO_FOUNDER_MAINLINE_SCENARIO_LABEL_ZH = '中文团队做出海内容 / 知识付费业务';

export type FounderMainlineState =
    | 'step0_blocked'
    | 'interview_in_progress'
    | 'ready_for_plan'
    | 'plan_draft_ready'
    | 'correction_in_progress'
    | 'ready_for_deploy_prep'
    | 'blocked_by_open_questions';

export type FounderMainlinePlanStatus =
    | 'draft'
    | 'ready_for_confirmation'
    | 'ready_for_deploy';

export interface FounderMainlineCatalogTemplateRef {
    template_key?: string;
    canonical_name: string;
    display_name_zh?: string;
    primary_goal?: string;
    recommended_skill_packs?: string[];
    recommended_for_first_scenario?: boolean;
}

export interface FounderMainlineCatalogSkillPackRef {
    pack_id: string;
    display_name_zh?: string;
    business_goal?: string;
    recommended_roles?: string[];
    recommended_for_first_scenario?: boolean;
}

export interface FounderMainlineOpenQuestion {
    question_group: string;
    question_zh: string;
    blocking: boolean;
}

export interface FounderMainlineTemplateRecommendation {
    template_key?: string;
    canonical_name: string;
    display_name_zh: string;
    reason_zh: string;
}

export interface FounderMainlineSkillPackRecommendation {
    pack_id: string;
    display_name_zh: string;
    reason_zh: string;
    recommended_for_roles: string[];
}

export interface FounderMainlineReadonlySeed {
    entry_key: string;
    scenario_id: string;
    scenario_label_zh: string;
    state: FounderMainlineState;
    plan_status: FounderMainlinePlanStatus;
    business_brief: string;
    founder_copilot?: FounderMainlineTemplateRecommendation;
    template_recommendations: FounderMainlineTemplateRecommendation[];
    skill_pack_recommendations: FounderMainlineSkillPackRecommendation[];
    open_questions: FounderMainlineOpenQuestion[];
    source: 'readonly-catalog-placeholder';
    suggested_surface: 'AgentCreate';
}

export interface FounderMainlineReadonlySeedInput {
    businessBrief?: string;
    modelReady?: boolean;
    templates?: FounderMainlineCatalogTemplateRef[];
    packs?: FounderMainlineCatalogSkillPackRef[];
}

const DEFAULT_OPEN_QUESTIONS: FounderMainlineOpenQuestion[] = [
    {
        question_group: 'market_and_users',
        question_zh: '你的目标用户是谁，优先面向哪些海外市场？',
        blocking: true,
    },
    {
        question_group: 'conversion_and_delivery',
        question_zh: '你准备靠什么产品成交，以及用什么方式交付？',
        blocking: true,
    },
    {
        question_group: 'approval_boundaries',
        question_zh: '哪些环节你希望 AI 先自动处理，哪些环节必须人工确认？',
        blocking: true,
    },
];

function toTemplateRecommendation(
    template: FounderMainlineCatalogTemplateRef,
    reasonZh: string,
): FounderMainlineTemplateRecommendation {
    return {
        template_key: template.template_key,
        canonical_name: template.canonical_name,
        display_name_zh: template.display_name_zh || template.canonical_name,
        reason_zh: reasonZh,
    };
}

function toPackRecommendation(
    pack: FounderMainlineCatalogSkillPackRef,
    reasonZh: string,
): FounderMainlineSkillPackRecommendation {
    return {
        pack_id: pack.pack_id,
        display_name_zh: pack.display_name_zh || pack.pack_id,
        reason_zh: reasonZh,
        recommended_for_roles: pack.recommended_roles || [],
    };
}

export function buildFounderMainlineReadonlySeed({
    businessBrief = '',
    modelReady = false,
    templates = [],
    packs = [],
}: FounderMainlineReadonlySeedInput): FounderMainlineReadonlySeed {
    const founderTemplate = templates.find((item) => item.canonical_name === 'Founder Copilot');
    const firstScenarioTemplates = templates.filter((item) => item.recommended_for_first_scenario);
    const firstScenarioPacks = packs.filter((item) => item.recommended_for_first_scenario);
    const founderPack = packs.find((item) => item.pack_id === 'founder-strategy-pack');

    return {
        entry_key: DUODUO_FOUNDER_MAINLINE_ENTRY_KEY,
        scenario_id: DUODUO_FOUNDER_MAINLINE_SCENARIO_ID,
        scenario_label_zh: DUODUO_FOUNDER_MAINLINE_SCENARIO_LABEL_ZH,
        state: modelReady ? 'interview_in_progress' : 'step0_blocked',
        plan_status: 'draft',
        business_brief: businessBrief,
        founder_copilot: founderTemplate
            ? toTemplateRecommendation(founderTemplate, '当前首场景默认以创业导师作为主控入口。')
            : undefined,
        template_recommendations: firstScenarioTemplates.map((item) =>
            toTemplateRecommendation(
                item,
                item.canonical_name === 'Founder Copilot'
                    ? '首场景默认主控角色。'
                    : '当前条目已被现有目录标记为首场景推荐模板。',
            ),
        ),
        skill_pack_recommendations: firstScenarioPacks.map((item) =>
            toPackRecommendation(
                item,
                item.pack_id === founderPack?.pack_id
                    ? '创业导师主链默认优先引用的策略能力包。'
                    : '当前条目已被现有目录标记为首场景推荐能力包。',
            ),
        ),
        open_questions: DEFAULT_OPEN_QUESTIONS,
        source: 'readonly-catalog-placeholder',
        suggested_surface: 'AgentCreate',
    };
}
