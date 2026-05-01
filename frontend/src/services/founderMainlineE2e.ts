import {
    FOUNDER_MAINLINE_INTERVIEW_FIELDS,
    type FounderMainlineInterviewGroupId,
} from './founderMainlineInterviewProgress.ts';

export interface FounderMainlineE2eConfig {
    authMode: 'login' | 'self_bootstrap';
    cleanupAfterRun: boolean;
    scenarioKey: FounderMainlineE2eScenarioKey;
    email: string;
    password: string;
    baseUrl: string;
    tenantName: string;
    modelLabel: string;
    edgePath: string;
    headless: boolean;
    runtimeDir: string;
    screenshotDir: string;
}

export interface FounderMainlineE2eAnswer {
    groupId: FounderMainlineInterviewGroupId;
    answerText: string;
}

export type FounderMainlineE2eScenarioKey =
    | 'content-knowledge'
    | 'saas-ops-automation'
    | 'local-service-leadgen'
    | 'cross-border-ecommerce';

export interface FounderMainlineE2eScenario {
    scenarioKey: FounderMainlineE2eScenarioKey;
    workspaceName: string;
    businessBrief: string;
    coreOffer: string;
    acquisitionChannel: string;
    expectedDraftTexts: string[];
    answers: FounderMainlineE2eAnswer[];
    expectedAgentNames: string[];
    minimumRelationshipCount: number;
    minimumTriggerCount: number;
}

function requireEnv(value: string | undefined, name: string): string {
    const trimmed = value?.trim() || '';
    if (!trimmed) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return trimmed;
}

function readOptionalEnv(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim() || '';
    return trimmed || fallback;
}

function isHeaded(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function isTruthy(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function readScenarioKey(value: string | undefined): FounderMainlineE2eScenarioKey {
    const normalized = value?.trim().toLowerCase() || '';
    if (!normalized) {
        return 'content-knowledge';
    }
    if (
        normalized === 'content'
        || normalized === 'content-knowledge'
        || normalized === 'cn-team-global-content-knowledge'
    ) {
        return 'content-knowledge';
    }
    if (
        normalized === 'saas'
        || normalized === 'saas-ops'
        || normalized === 'saas-ops-automation'
        || normalized === 'cn-saas-ops-automation'
    ) {
        return 'saas-ops-automation';
    }
    if (
        normalized === 'local'
        || normalized === 'local-service'
        || normalized === 'local-service-leadgen'
        || normalized === 'cn-local-service-leadgen'
    ) {
        return 'local-service-leadgen';
    }
    if (
        normalized === 'commerce'
        || normalized === 'ecommerce'
        || normalized === 'e-commerce'
        || normalized === 'cross-border'
        || normalized === 'cross-border-ecommerce'
        || normalized === 'cross-border-ecommerce-ops'
        || normalized === 'cn-cross-border-ecommerce-ops'
    ) {
        return 'cross-border-ecommerce';
    }

    throw new Error(`Unsupported FOUNDER_E2E_SCENARIO: ${value}`);
}

function buildFounderUrl(baseUrl: string, pathname: string, workspaceId?: string): string {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    if (!workspaceId) {
        return `${normalizedBaseUrl}${pathname}`;
    }

    const url = new URL(`${normalizedBaseUrl}${pathname}`);
    url.searchParams.set('workspaceId', workspaceId);
    return url.toString();
}

function resolveFounderMainlineE2eAuth(
    env: Record<string, string | undefined>,
): Pick<FounderMainlineE2eConfig, 'authMode' | 'cleanupAfterRun' | 'email' | 'password'> {
    const email = readOptionalEnv(env.FOUNDER_E2E_EMAIL, '');
    const password = readOptionalEnv(env.FOUNDER_E2E_PASSWORD, '');

    if (Boolean(email) !== Boolean(password)) {
        throw new Error(
            'FOUNDER_E2E_EMAIL and FOUNDER_E2E_PASSWORD must be provided together, or omitted together for self-bootstrap mode.',
        );
    }

    return {
        authMode: email ? 'login' : 'self_bootstrap',
        cleanupAfterRun: !email && !isTruthy(env.FOUNDER_E2E_SKIP_CLEANUP),
        email,
        password,
    };
}

export function buildFounderMainlineE2eConfig(
    env: Record<string, string | undefined>,
): FounderMainlineE2eConfig {
    const auth = resolveFounderMainlineE2eAuth(env);
    return {
        ...auth,
        scenarioKey: readScenarioKey(env.FOUNDER_E2E_SCENARIO),
        baseUrl: readOptionalEnv(env.FOUNDER_E2E_BASE_URL, 'http://127.0.0.1:3010'),
        tenantName: readOptionalEnv(env.FOUNDER_E2E_TENANT, 'Solo Founder Lab'),
        modelLabel: readOptionalEnv(env.FOUNDER_E2E_MODEL_LABEL, ''),
        edgePath: readOptionalEnv(
            env.FOUNDER_E2E_EDGE_PATH,
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        ),
        headless: !isHeaded(env.FOUNDER_E2E_HEADED),
        runtimeDir: readOptionalEnv(env.FOUNDER_E2E_RUNTIME_DIR, 'openclaw-founder-e2e-runtime'),
        screenshotDir: readOptionalEnv(env.FOUNDER_E2E_SCREENSHOT_DIR, 'output/playwright'),
    };
}

export function buildFounderWorkspaceUrl(baseUrl: string, workspaceId?: string): string {
    return buildFounderUrl(baseUrl, '/founder-workspace', workspaceId);
}

export function buildFounderDashboardUrl(baseUrl: string, workspaceId?: string): string {
    return buildFounderUrl(baseUrl, '/founder-workspace/dashboard', workspaceId);
}

function formatRunIdForWorkspace(runId: string): string {
    const match = runId.match(/T(\d{2})[:-](\d{2})[:-](\d{2})/);
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    const fallback = runId.replace(/[^0-9]/g, '').slice(-6);
    if (fallback.length === 6) {
        return `${fallback.slice(0, 2)}-${fallback.slice(2, 4)}-${fallback.slice(4, 6)}`;
    }

    return 'run';
}

function buildContentKnowledgeScenario(runId: string): FounderMainlineE2eScenario {
    const businessBrief =
        'Build a Chinese-first founder growth studio that sells consulting and cohort training to overseas Chinese creators, using short video, email, and community as acquisition channels.';
    const answerTextByGroup: Record<FounderMainlineInterviewGroupId, string> = {
        market_target_users:
            'Overseas Chinese creators who want a solo-business operating system and conversion help.',
        core_product_service:
            'Founder operating consulting plus a cohort sprint that installs the first multi-agent workflow.',
        acquisition_distribution_channels:
            'Short video, founder essays, email newsletter, and private community distribution.',
        conversion_sales_model:
            'Content leads to DM discovery, then strategy calls, then cohort or consulting conversion.',
        delivery_service_model:
            'Live workshops, async templates, weekly office hours, and community follow-up.',
        content_language_requirements:
            'Chinese-first with bilingual Chinese-English output for selected distribution assets.',
        automation_human_boundary:
            'AI can draft content, planning, and follow-up sequences; pricing, promises, and final client-facing commitments require human approval.',
        team_gap_role_preference:
            'Content strategy, distribution execution, follow-up conversion, and founder PM support.',
    };

    return {
        scenarioKey: 'content-knowledge',
        workspaceName: `Founder Workspace ${formatRunIdForWorkspace(runId)}`,
        businessBrief,
        coreOffer: 'Consulting + cohort program',
        acquisitionChannel: 'Short video + email + community',
        expectedDraftTexts: [
            'Scenario rationale',
            'Matched signals',
            'Template preview',
            'Skill-pack preview',
            '出海内容 / 知识付费',
        ],
        answers: FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => ({
            groupId: field.group_id,
            answerText: answerTextByGroup[field.group_id],
        })),
        expectedAgentNames: [
            'Founder Copilot',
            'Project Chief of Staff',
            'Content Strategy Lead',
            'Global Distribution Lead',
        ],
        minimumRelationshipCount: 1,
        minimumTriggerCount: 1,
    };
}

function buildSaasOpsScenario(runId: string): FounderMainlineE2eScenario {
    const businessBrief =
        'Build a B2B SaaS operations-automation product that turns spreadsheets, CRM follow-up, onboarding, and recurring reports into repeatable workflows for small service teams.';
    const answerTextByGroup: Record<FounderMainlineInterviewGroupId, string> = {
        market_target_users:
            'Small B2B service teams and solo operators who still coordinate customer work in spreadsheets and chat.',
        core_product_service:
            'A subscription SaaS workflow automation product plus onboarding setup.',
        acquisition_distribution_channels:
            'Product-led demos, outbound email, partner referrals, and case-study content.',
        conversion_sales_model:
            'Free trial to onboarding call to monthly subscription conversion.',
        delivery_service_model:
            'Self-serve product plus onboarding playbooks, customer-success follow-up, and recurring reports.',
        content_language_requirements:
            'Chinese-first product copy with English later for selected sales assets.',
        automation_human_boundary:
            'AI can draft workflows and reports; billing, permissions, and production changes require human approval.',
        team_gap_role_preference:
            'Product operations, customer onboarding, recurring reports, and demand generation.',
    };

    return {
        scenarioKey: 'saas-ops-automation',
        workspaceName: `Founder Workspace ${formatRunIdForWorkspace(runId)}`,
        businessBrief,
        coreOffer: 'SaaS subscription + onboarding setup',
        acquisitionChannel: 'Product-led demos + outbound + referrals',
        expectedDraftTexts: [
            'Scenario rationale',
            'Matched signals',
            'SaaS / 运营自动化',
            '产品自动化',
            '客户成功',
        ],
        answers: FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => ({
            groupId: field.group_id,
            answerText: answerTextByGroup[field.group_id],
        })),
        expectedAgentNames: [
            'Founder Copilot',
            'Project Chief of Staff',
            'Customer Follow-up Lead',
            'Content Strategy Lead',
        ],
        minimumRelationshipCount: 1,
        minimumTriggerCount: 1,
    };
}

function buildLocalServiceLeadgenScenario(runId: string): FounderMainlineE2eScenario {
    const businessBrief =
        'Build a local service lead-generation system for a neighborhood photography studio and home-service packages, using short video, community posts, referrals, and private traffic to confirm appointments and improve booking conversion.';
    const answerTextByGroup: Record<FounderMainlineInterviewGroupId, string> = {
        market_target_users:
            'Local families, nearby community members, and neighborhood customers who need appointment-based services.',
        core_product_service:
            'Photography sessions and home-service packages sold through appointment booking.',
        acquisition_distribution_channels:
            'Local short video, community posts, referrals, review content, and private traffic follow-up.',
        conversion_sales_model:
            'Lead form or private message to appointment confirmation, then paid booking and offline service delivery.',
        delivery_service_model:
            'Offline service slots with reminders, preparation checklist, after-service feedback, and repeat purchase follow-up.',
        content_language_requirements:
            'Chinese-first local-service copy.',
        automation_human_boundary:
            'AI can draft lead replies, reminders, and checklists; pricing, refunds, service promises, and complaints need human approval.',
        team_gap_role_preference:
            'Local lead generation, appointment follow-up, and delivery scheduling.',
    };

    return {
        scenarioKey: 'local-service-leadgen',
        workspaceName: `Founder Workspace ${formatRunIdForWorkspace(runId)}`,
        businessBrief,
        coreOffer: 'Appointment-based local service packages',
        acquisitionChannel: 'Local short video + referrals + private traffic',
        expectedDraftTexts: [
            'Scenario rationale',
            'Matched signals',
            '本地服务 / 预约转化',
            '预约转化',
            '客户跟进',
        ],
        answers: FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => ({
            groupId: field.group_id,
            answerText: answerTextByGroup[field.group_id],
        })),
        expectedAgentNames: [
            'Founder Copilot',
            'Content Strategy Lead',
            'Customer Follow-up Lead',
            'Project Chief of Staff',
        ],
        minimumRelationshipCount: 1,
        minimumTriggerCount: 1,
    };
}

function buildCrossBorderEcommerceScenario(runId: string): FounderMainlineE2eScenario {
    const businessBrief =
        'Build a cross-border ecommerce operating system for a Shopify, Amazon, and TikTok Shop brand, coordinating product listings, global distribution, inventory, order fulfillment, customer reviews, and repeat purchases.';
    const answerTextByGroup: Record<FounderMainlineInterviewGroupId, string> = {
        market_target_users:
            'Overseas shoppers buying niche lifestyle products through Shopify, Amazon, and TikTok Shop.',
        core_product_service:
            'Cross-border ecommerce products, bundles, and seasonal campaigns.',
        acquisition_distribution_channels:
            'Shopify storefront, Amazon listings, TikTok Shop, creator content, paid ads, and email remarketing.',
        conversion_sales_model:
            'Product listing views to cart conversion, paid orders, customer reviews, and repeat purchases.',
        delivery_service_model:
            'Supplier coordination, inventory checks, order fulfillment, customer service, and weekly operations review.',
        content_language_requirements:
            'Chinese planning with English product listings, ad copy, and customer replies.',
        automation_human_boundary:
            'AI can draft listings, channel variants, review replies, and ops reports; pricing, refunds, supplier commitments, and platform-policy claims need human approval.',
        team_gap_role_preference:
            'Product listing operations, channel distribution, inventory fulfillment, after-sales, and repeat purchase follow-up.',
    };

    return {
        scenarioKey: 'cross-border-ecommerce',
        workspaceName: `Founder Workspace ${formatRunIdForWorkspace(runId)}`,
        businessBrief,
        coreOffer: 'Cross-border ecommerce products and bundles',
        acquisitionChannel: 'Shopify + Amazon + TikTok Shop + creators',
        expectedDraftTexts: [
            'Scenario rationale',
            'Matched signals',
            'cross-border ecommerce',
            '选品与商品页',
            '订单售后与复购',
        ],
        answers: FOUNDER_MAINLINE_INTERVIEW_FIELDS.map((field) => ({
            groupId: field.group_id,
            answerText: answerTextByGroup[field.group_id],
        })),
        expectedAgentNames: [
            'Founder Copilot',
            'Content Strategy Lead',
            'Global Distribution Lead',
            'Project Chief of Staff',
            'Customer Follow-up Lead',
        ],
        minimumRelationshipCount: 1,
        minimumTriggerCount: 1,
    };
}

export function buildFounderMainlineE2eScenario(
    runId: string,
    scenarioKey: FounderMainlineE2eScenarioKey = 'content-knowledge',
): FounderMainlineE2eScenario {
    if (scenarioKey === 'saas-ops-automation') {
        return buildSaasOpsScenario(runId);
    }
    if (scenarioKey === 'local-service-leadgen') {
        return buildLocalServiceLeadgenScenario(runId);
    }
    if (scenarioKey === 'cross-border-ecommerce') {
        return buildCrossBorderEcommerceScenario(runId);
    }

    return buildContentKnowledgeScenario(runId);
}
