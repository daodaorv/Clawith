import assert from 'node:assert/strict';

import { buildFounderProviderPresetCards } from '../src/services/founderProviderPresets.ts';

const cards = buildFounderProviderPresetCards([
    { provider: 'deepseek', display_name: 'DeepSeek', default_base_url: 'https://api.deepseek.com/v1' },
    { provider: 'openai', display_name: 'OpenAI', default_base_url: 'https://api.openai.com/v1' },
]);

assert.equal(cards.length, 2);
assert.equal(cards[0].labelZh, 'DeepSeek（推荐）');
assert.equal(cards[0].showRawBaseUrlInput, false);
assert.equal(cards[0].setupMode, 'guided');
assert.equal(cards[1].provider, 'openai');

console.log('founderProviderPresets tests passed');
