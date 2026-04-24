import {
    FOUNDER_MAINLINE_INTERVIEW_FIELDS,
    type FounderMainlineInterviewGroupId,
} from './founderMainlineInterviewProgress.ts';

export interface FounderMainlineE2eConfig {
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

export interface FounderMainlineE2eScenario {
    workspaceName: string;
    businessBrief: string;
    coreOffer: string;
    acquisitionChannel: string;
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

export function buildFounderMainlineE2eConfig(
    env: Record<string, string | undefined>,
): FounderMainlineE2eConfig {
    return {
        email: requireEnv(env.FOUNDER_E2E_EMAIL, 'FOUNDER_E2E_EMAIL'),
        password: requireEnv(env.FOUNDER_E2E_PASSWORD, 'FOUNDER_E2E_PASSWORD'),
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

export function buildFounderMainlineE2eScenario(runId: string): FounderMainlineE2eScenario {
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
        workspaceName: `Founder Workspace ${formatRunIdForWorkspace(runId)}`,
        businessBrief,
        coreOffer: 'Consulting + cohort program',
        acquisitionChannel: 'Short video + email + community',
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
