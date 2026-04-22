import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDevProxyTargets } from '../vite.proxy.ts';

test('uses the local backend defaults when no env override is provided', () => {
    assert.deepEqual(resolveDevProxyTargets({}), {
        apiTarget: 'http://localhost:8008',
        wsTarget: 'ws://localhost:8008',
    });
});

test('derives the websocket target from the HTTP override by default', () => {
    assert.deepEqual(resolveDevProxyTargets({
        VITE_DEV_PROXY_TARGET: 'http://127.0.0.1:3008',
    }), {
        apiTarget: 'http://127.0.0.1:3008',
        wsTarget: 'ws://127.0.0.1:3008',
    });
});

test('respects an explicit websocket override when provided', () => {
    assert.deepEqual(resolveDevProxyTargets({
        VITE_DEV_PROXY_TARGET: 'https://api.example.test',
        VITE_DEV_WS_PROXY_TARGET: 'wss://ws.example.test',
    }), {
        apiTarget: 'https://api.example.test',
        wsTarget: 'wss://ws.example.test',
    });
});
