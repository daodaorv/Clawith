export interface FounderProviderSpec {
    provider: string;
    display_name: string;
    protocol?: string;
    default_base_url?: string | null;
    supports_tool_choice?: boolean;
    default_max_tokens?: number;
    base_url_required?: boolean;
}

export interface FounderProviderPresetCard {
    provider: string;
    displayName: string;
    labelZh: string;
    labelEn: string;
    descriptionZh: string;
    descriptionEn: string;
    defaultBaseUrl?: string;
    recommended: boolean;
    showRawBaseUrlInput: boolean;
    setupMode: 'guided' | 'advanced';
}

export const FOUNDER_PROVIDER_PREFERENCE_KEY = 'founder_provider_preference';

const PREFERRED_PROVIDER_ORDER = [
    'deepseek',
    'openai',
    'qwen',
    'zhipu',
    'kimi',
    'gemini',
    'anthropic',
    'openrouter',
    'custom',
];

const RECOMMENDED_PROVIDER_SET = new Set(['deepseek']);

const PROVIDER_COPY: Record<string, { zh: string; en: string }> = {
    deepseek: {
        zh: '更适合中文创业者起步，默认接入方式简单。',
        en: 'A simple starting point for Chinese-first founder workflows.',
    },
    openai: {
        zh: '国际通用，适合需要更广生态兼容的团队。',
        en: 'A global default when you want the broadest ecosystem compatibility.',
    },
    qwen: {
        zh: '适合国内可用性优先的内容与运营场景。',
        en: 'Useful when you prioritize domestic availability for content operations.',
    },
};

function sortByProviderPriority(left: FounderProviderSpec, right: FounderProviderSpec) {
    const leftOrder = PREFERRED_PROVIDER_ORDER.indexOf(left.provider);
    const rightOrder = PREFERRED_PROVIDER_ORDER.indexOf(right.provider);
    const normalizedLeftOrder = leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder;
    const normalizedRightOrder = rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder;
    if (normalizedLeftOrder !== normalizedRightOrder) {
        return normalizedLeftOrder - normalizedRightOrder;
    }
    return left.display_name.localeCompare(right.display_name);
}

export function buildFounderProviderPresetCards(
    specs: FounderProviderSpec[],
): FounderProviderPresetCard[] {
    const deduped = new Map<string, FounderProviderSpec>();
    for (const item of specs || []) {
        if (!item?.provider || deduped.has(item.provider)) {
            continue;
        }
        deduped.set(item.provider, item);
    }

    return [...deduped.values()]
        .sort(sortByProviderPriority)
        .map((item) => {
            const recommended = RECOMMENDED_PROVIDER_SET.has(item.provider);
            const showRawBaseUrlInput = !item.default_base_url || ['azure', 'custom'].includes(item.provider);
            const copy = PROVIDER_COPY[item.provider] || {
                zh: '适合作为 founder-friendly 预设，先完成引导式配置。',
                en: 'A founder-friendly preset to start with guided configuration.',
            };

            return {
                provider: item.provider,
                displayName: item.display_name,
                labelZh: `${item.display_name}${recommended ? '（推荐）' : ''}`,
                labelEn: `${item.display_name}${recommended ? ' (Recommended)' : ''}`,
                descriptionZh: copy.zh,
                descriptionEn: copy.en,
                defaultBaseUrl: item.default_base_url || undefined,
                recommended,
                showRawBaseUrlInput,
                setupMode: showRawBaseUrlInput ? 'advanced' : 'guided',
            };
        });
}

async function requestFounderProviderPresets<T>(url: string): Promise<T> {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api${url}`, {
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
}

export function loadFounderPreferredProvider(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }
    return window.localStorage.getItem(FOUNDER_PROVIDER_PREFERENCE_KEY);
}

export function saveFounderPreferredProvider(provider: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(FOUNDER_PROVIDER_PREFERENCE_KEY, provider);
}

export function clearFounderPreferredProvider(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(FOUNDER_PROVIDER_PREFERENCE_KEY);
}

export function requestFounderProviderSpecs(): Promise<FounderProviderSpec[]> {
    return requestFounderProviderPresets<FounderProviderSpec[]>('/enterprise/llm-providers');
}
