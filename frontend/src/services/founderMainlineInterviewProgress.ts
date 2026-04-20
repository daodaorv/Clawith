export const FOUNDER_MAINLINE_INTERVIEW_PROGRESS_ENDPOINT =
    '/api/enterprise/duoduo/founder-mainline/interview-progress';

export type FounderMainlineState =
    | 'step0_blocked'
    | 'interview_in_progress'
    | 'ready_for_plan'
    | 'plan_draft_ready'
    | 'correction_in_progress'
    | 'ready_for_deploy_prep'
    | 'blocked_by_open_questions';

export type FounderMainlineInterviewGroupId =
    | 'market_target_users'
    | 'core_product_service'
    | 'acquisition_distribution_channels'
    | 'conversion_sales_model'
    | 'delivery_service_model'
    | 'content_language_requirements'
    | 'automation_human_boundary'
    | 'team_gap_role_preference';

export interface FounderMainlineInterviewField {
    group_id: FounderMainlineInterviewGroupId;
    label_zh: string;
    label_en: string;
    question_zh: string;
    question_en: string;
    placeholder_zh: string;
    placeholder_en: string;
}

export const FOUNDER_MAINLINE_INTERVIEW_FIELDS: FounderMainlineInterviewField[] = [
    {
        group_id: 'market_target_users',
        label_zh: '目标用户',
        label_en: 'Target users',
        question_zh: '你们当前最想服务的目标用户是谁？',
        question_en: 'Who are the first target users you want to serve?',
        placeholder_zh: '例如：海外华人创作者、出海 SaaS 团队、跨境卖家。',
        placeholder_en: 'For example: overseas Chinese creators, global SaaS teams, cross-border sellers.',
    },
    {
        group_id: 'core_product_service',
        label_zh: '核心产品',
        label_en: 'Core offer',
        question_zh: '你们核心准备卖什么？',
        question_en: 'What is the core product or service you plan to sell?',
        placeholder_zh: '例如：训练营、咨询服务、订阅内容、社群会员。',
        placeholder_en: 'For example: cohort course, consulting, subscription content, paid community.',
    },
    {
        group_id: 'acquisition_distribution_channels',
        label_zh: '获客与分发',
        label_en: 'Acquisition and distribution',
        question_zh: '你们主要通过哪些渠道获客和分发？',
        question_en: 'Which channels will you use for acquisition and distribution?',
        placeholder_zh: '例如：短视频、图文、小红书、邮件、社群。',
        placeholder_en: 'For example: short video, posts, Xiaohongshu, email, community.',
    },
    {
        group_id: 'conversion_sales_model',
        label_zh: '成交方式',
        label_en: 'Conversion model',
        question_zh: '用户从看到内容到付费，准备走什么转化链路？',
        question_en: 'What conversion path takes users from content to payment?',
        placeholder_zh: '例如：私聊咨询成交、训练营报名、直播转化、订阅付费。',
        placeholder_en: 'For example: DM-based sales, cohort enrollment, live conversion, subscriptions.',
    },
    {
        group_id: 'delivery_service_model',
        label_zh: '交付方式',
        label_en: 'Delivery model',
        question_zh: '成交后的交付方式是什么？',
        question_en: 'How will you deliver the service after the sale?',
        placeholder_zh: '例如：直播、录播、社群陪跑、一对一咨询。',
        placeholder_en: 'For example: live sessions, recorded lessons, community support, 1:1 consulting.',
    },
    {
        group_id: 'content_language_requirements',
        label_zh: '语言要求',
        label_en: 'Language requirements',
        question_zh: '内容输出需要中文优先、双语，还是多语种？',
        question_en: 'Should content stay Chinese-first, bilingual, or multilingual?',
        placeholder_zh: '例如：中文优先，中英双语，英文本地化版本。',
        placeholder_en: 'For example: Chinese-first, Chinese-English bilingual, localized English.',
    },
    {
        group_id: 'automation_human_boundary',
        label_zh: '自动化边界',
        label_en: 'Automation boundary',
        question_zh: '哪些环节可以自动化，哪些环节必须保留人工审核？',
        question_en: 'Which steps can be automated and which must stay human-reviewed?',
        placeholder_zh: '例如：内容初稿可自动化，正式承诺和报价必须人工确认。',
        placeholder_en: 'For example: AI drafts are okay, final promises and pricing require human approval.',
    },
    {
        group_id: 'team_gap_role_preference',
        label_zh: '团队缺口',
        label_en: 'Team gaps',
        question_zh: '当前团队最缺哪类角色？',
        question_en: 'Which team roles are missing most right now?',
        placeholder_zh: '例如：内容策划、海外分发、跟进转化、项目推进。',
        placeholder_en: 'For example: content strategy, global distribution, follow-up conversion, PM support.',
    },
];

export const FOUNDER_MAINLINE_INTERVIEW_TOTAL_GROUPS = FOUNDER_MAINLINE_INTERVIEW_FIELDS.length;

export type FounderMainlineInterviewAnswerMap = Partial<Record<FounderMainlineInterviewGroupId, string>>;

export interface FounderMainlineModelReadyContext {
    resolved_provider?: string;
    recommended_model?: string;
    normalized_base_url?: string;
}

export interface FounderMainlineInterviewAnswer {
    group_id: FounderMainlineInterviewGroupId;
    answer_text: string;
    is_unknown?: boolean;
}

export interface FounderMainlineInterviewQuestion {
    group_id: FounderMainlineInterviewGroupId | string;
    question_zh: string;
    intent_zh: string;
}

export interface FounderMainlinePlanningPayload {
    business_brief: string;
    locale?: string;
    scenario_id?: string;
    model_ready_context: FounderMainlineModelReadyContext;
    answers: FounderMainlineInterviewAnswer[];
}

export interface FounderMainlineInterviewProgress extends FounderMainlinePlanningPayload {
    plan_status: FounderMainlineState;
    can_generate_plan: boolean;
    answered_groups: string[];
    missing_groups: string[];
    next_questions: FounderMainlineInterviewQuestion[];
}

export interface FounderMainlinePreviewModelSelection {
    provider?: string;
    model?: string;
    base_url?: string | null;
}

export function buildFounderMainlineModelReadyContext(
    selectedModel?: FounderMainlinePreviewModelSelection | null,
): FounderMainlineModelReadyContext {
    if (!selectedModel) {
        return {};
    }

    return {
        resolved_provider: selectedModel.provider?.trim() || undefined,
        recommended_model: selectedModel.model?.trim() || undefined,
        normalized_base_url: selectedModel.base_url?.trim() || undefined,
    };
}

export function buildFounderMainlineInterviewAnswers(
    answersByGroup: FounderMainlineInterviewAnswerMap,
): FounderMainlineInterviewAnswer[] {
    return FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => ({
        group_id: field.group_id,
        answer_text: answersByGroup[field.group_id]?.trim() || '',
    })).filter((item) => Boolean(item.answer_text));
}

export function countFounderMainlineAnsweredGroups(
    answersByGroup: FounderMainlineInterviewAnswerMap,
): number {
    return buildFounderMainlineInterviewAnswers(answersByGroup).length;
}

export function buildFounderMainlinePlanningPayload({
    businessBrief,
    locale = 'zh-CN',
    scenarioId,
    selectedModel,
    answersByGroup = {},
}: {
    businessBrief: string;
    locale?: string;
    scenarioId?: string;
    selectedModel?: FounderMainlinePreviewModelSelection | null;
    answersByGroup?: FounderMainlineInterviewAnswerMap;
}): FounderMainlinePlanningPayload {
    return {
        business_brief: businessBrief.trim(),
        locale,
        scenario_id: scenarioId,
        model_ready_context: buildFounderMainlineModelReadyContext(selectedModel),
        answers: buildFounderMainlineInterviewAnswers(answersByGroup),
    };
}

export function getFounderMainlineStateLabel(
    state: FounderMainlineState,
    isChineseUi: boolean,
): string {
    if (!isChineseUi) {
        switch (state) {
            case 'step0_blocked':
                return 'Model step not ready';
            case 'interview_in_progress':
                return 'Interview in progress';
            case 'ready_for_plan':
                return 'Ready for draft plan';
            case 'plan_draft_ready':
                return 'Draft plan ready';
            case 'correction_in_progress':
                return 'Correction in progress';
            case 'ready_for_deploy_prep':
                return 'Ready for deploy prep';
            case 'blocked_by_open_questions':
                return 'Blocked by open questions';
        }
    }

    switch (state) {
        case 'step0_blocked':
            return '模型步骤未就绪';
        case 'interview_in_progress':
            return '访谈进行中';
        case 'ready_for_plan':
            return '可以生成草案';
        case 'plan_draft_ready':
            return '草案已生成';
        case 'correction_in_progress':
            return '纠偏处理中';
        case 'ready_for_deploy_prep':
            return '可进入部署准备';
        case 'blocked_by_open_questions':
            return '仍被关键问题阻塞';
    }
}

export async function requestFounderMainlineInterviewProgress(
    payload: FounderMainlinePlanningPayload,
    init?: RequestInit,
): Promise<FounderMainlineInterviewProgress> {
    const token = localStorage.getItem('token');
    const response = await fetch(FOUNDER_MAINLINE_INTERVIEW_PROGRESS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {}),
        },
        body: JSON.stringify(payload),
        ...init,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Founder mainline interview progress request failed: ${response.status}`);
    }

    return response.json() as Promise<FounderMainlineInterviewProgress>;
}
