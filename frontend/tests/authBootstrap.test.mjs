import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldBootstrapAuthSession } from '../src/utils/authBootstrap.ts';

test('skips auth bootstrap on reset-password route', () => {
    assert.equal(shouldBootstrapAuthSession('/reset-password'), false);
});

test('skips auth bootstrap on reset-password route with trailing slash', () => {
    assert.equal(shouldBootstrapAuthSession('/reset-password/'), false);
});

test('keeps auth bootstrap on normal app routes', () => {
    assert.equal(shouldBootstrapAuthSession('/login'), true);
    assert.equal(shouldBootstrapAuthSession('/plaza'), true);
});
