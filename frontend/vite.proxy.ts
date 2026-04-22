const DEFAULT_DEV_PROXY_TARGET = 'http://localhost:8008';

function normalizeTarget(target: string): string {
    return target.endsWith('/') ? target.slice(0, -1) : target;
}

function deriveWebsocketTarget(apiTarget: string): string {
    try {
        const url = new URL(apiTarget);
        if (url.protocol === 'https:') url.protocol = 'wss:';
        else if (url.protocol === 'http:') url.protocol = 'ws:';
        return normalizeTarget(url.toString());
    } catch {
        if (apiTarget.startsWith('https://')) {
            return normalizeTarget(apiTarget.replace(/^https:\/\//, 'wss://'));
        }
        if (apiTarget.startsWith('http://')) {
            return normalizeTarget(apiTarget.replace(/^http:\/\//, 'ws://'));
        }
        return normalizeTarget(apiTarget);
    }
}

export function resolveDevProxyTargets(env: Record<string, string | undefined>) {
    const apiTarget = normalizeTarget(env.VITE_DEV_PROXY_TARGET || DEFAULT_DEV_PROXY_TARGET);
    const wsTarget = normalizeTarget(env.VITE_DEV_WS_PROXY_TARGET || deriveWebsocketTarget(apiTarget));

    return { apiTarget, wsTarget };
}
