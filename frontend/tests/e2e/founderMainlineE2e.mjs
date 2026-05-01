import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
    buildFounderMainlineE2eConfig,
    buildFounderMainlineE2eScenario,
    buildFounderMainlineE2eWalkthroughMarkdown,
    buildFounderDashboardUrl,
    buildFounderWorkspaceUrl,
} from '../../src/services/founderMainlineE2e.ts';

const PLAYWRIGHT_CORE_VERSION = '1.59.1';
const SELF_BOOTSTRAP_MODEL_PAYLOAD = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    api_key: 'openclaw-founder-e2e-dummy-key',
    base_url: 'https://example.com/v1',
    label: 'Dummy Founder Self-Bootstrap Model',
    enabled: true,
    supports_vision: false,
    max_output_tokens: 4096,
    request_timeout: 120,
};
const WALKTHROUGH_ANNOTATIONS = {
    '01-login': {
        title: 'Login entry',
        note: 'Confirms the browser starts from the public login surface before founder self-bootstrap or credential login.',
    },
    '02-tenant-modal': {
        title: 'Tenant selection',
        note: 'For reused founder accounts, confirms the intended company tenant is selected before workspace creation.',
    },
    '02-self-bootstrap-register': {
        title: 'Self-bootstrap registration',
        note: 'Shows the disposable founder account path used when no explicit E2E credentials are provided.',
    },
    '02b-self-bootstrap-company-setup': {
        title: 'Disposable company setup',
        note: 'Confirms the self-bootstrap flow creates a clean company tenant for the run.',
    },
    '02c-self-bootstrap-verify-email': {
        title: 'Email verification gate',
        note: 'Documents whether local registration temporarily visits the verification screen before continuing.',
    },
    '02d-self-bootstrap-model-seeded': {
        title: 'Tenant model bootstrap',
        note: 'Confirms a dummy tenant-scoped planning model was seeded only for this disposable verification run.',
    },
    '02d-self-bootstrap-ready': {
        title: 'Authenticated founder session',
        note: 'Confirms the browser has an authenticated founder session before entering Founder Workspace.',
    },
    '03-post-login': {
        title: 'Post-login landing state',
        note: 'Captures the first authenticated page so operators can diagnose routing or tenant-selection drift.',
    },
    '04-founder-workspace': {
        title: 'Founder Workspace entry',
        note: 'Shows the founder-specific entry page before any workspace shell is created.',
    },
    '05-workspace-created': {
        title: 'Workspace shell created',
        note: 'Confirms core offer, acquisition channel, and brief have been saved and the URL now carries a workspaceId.',
    },
    '05b-founder-workspace-deeplink': {
        title: 'Workspace deep link reload',
        note: 'Confirms the newly created workspace can be reopened by its exact workspaceId.',
    },
    '06-interview-filled': {
        title: 'Founder interview completed',
        note: 'Shows the eight business interview answers that brief the planning model like a chief of staff.',
    },
    '07-draft-plan': {
        title: 'Draft review with scenario explanation',
        note: 'Confirms the draft explains scenario rationale, matched signals, template preview, and skill-pack preview before approval.',
    },
    '08-ready-for-materialize': {
        title: 'Materialization confirmation',
        note: 'Confirms the approved draft has reached deploy prep readiness and exposes the scaffold generation action.',
    },
    '09-dashboard': {
        title: 'Founder dashboard after materialization',
        note: 'Shows the generated multi-agent operating surface, including agents, relationships, triggers, and blockers.',
    },
    '09b-dashboard-deeplink': {
        title: 'Dashboard deep link reload',
        note: 'Confirms the dashboard can be reopened by workspaceId and still hydrates the generated company scaffold.',
    },
    error: {
        title: 'Failure state',
        note: 'Captured automatically when the E2E flow fails before completing the dashboard assertions.',
    },
};
const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAbsolutePath(basePath, fallbackRoot) {
    if (path.isAbsolute(basePath)) {
        return basePath;
    }
    return path.resolve(fallbackRoot, basePath);
}

function toMarkdownPath(sourcePath) {
    return sourcePath.replace(/\\/g, '/');
}

function buildScreenshotMarkdownPath(walkthroughPath, screenshotPath) {
    const relativePath = path.relative(path.dirname(walkthroughPath), screenshotPath);
    const normalized = toMarkdownPath(relativePath || path.basename(screenshotPath));
    return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

function getWalkthroughAnnotation(name) {
    return WALKTHROUGH_ANNOTATIONS[name] || {
        title: name,
        note: 'Additional screenshot captured by the founder E2E runner.',
    };
}

function ensurePlaywrightRuntime(runtimeDir) {
    const packageJsonPath = path.join(runtimeDir, 'package.json');
    const modulePath = path.join(runtimeDir, 'node_modules', 'playwright-core', 'package.json');

    ensureDirectory(runtimeDir);

    if (!fs.existsSync(packageJsonPath)) {
        fs.writeFileSync(
            packageJsonPath,
            JSON.stringify({
                name: 'openclaw-founder-e2e-runtime',
                private: true,
            }, null, 2),
        );
    }

    if (!fs.existsSync(modulePath)) {
        if (process.platform === 'win32') {
            execFileSync(
                'cmd.exe',
                ['/d', '/s', '/c', `npm install --no-save playwright-core@${PLAYWRIGHT_CORE_VERSION}`],
                {
                    cwd: runtimeDir,
                    stdio: 'inherit',
                },
            );
        } else {
            execFileSync(
                'npm',
                ['install', '--no-save', `playwright-core@${PLAYWRIGHT_CORE_VERSION}`],
                {
                    cwd: runtimeDir,
                    stdio: 'inherit',
                },
            );
        }
    }

    return require(path.join(runtimeDir, 'node_modules', 'playwright-core'));
}

async function waitForOptional(locator, timeout = 8000) {
    try {
        await locator.waitFor({ state: 'visible', timeout });
        return true;
    } catch {
        return false;
    }
}

async function fillTextboxByName(page, name, value) {
    const field = page.getByRole('textbox', { name, exact: true }).first();
    await field.waitFor({ state: 'visible', timeout: 30000 });
    await field.fill(value);
}

async function choosePlanningModel(page, modelLabel, authMode) {
    try {
        await page.waitForFunction(
            () => document.querySelectorAll('#founder-planning-section button:not(.btn)').length > 0,
            null,
            { timeout: 30000 },
        );
    } catch (error) {
        if (authMode === 'self_bootstrap') {
            throw new Error(
                'No planning model buttons are available for the freshly bootstrapped company. Configure at least one enabled LLM model for that tenant, or provide FOUNDER_E2E_EMAIL/FOUNDER_E2E_PASSWORD for a model-ready founder tenant.',
            );
        }
        throw error;
    }

    await page.evaluate((desiredLabel) => {
        const section = document.getElementById('founder-planning-section');
        if (!section) {
            throw new Error('Founder planning section is missing.');
        }

        const buttons = Array.from(section.querySelectorAll('button'))
            .filter((button) => !button.classList.contains('btn'));
        const normalized = (desiredLabel || '').trim().toLowerCase();
        const target = normalized
            ? buttons.find((button) => (button.textContent || '').toLowerCase().includes(normalized))
            : buttons[0];

        if (!target) {
            throw new Error(
                normalized
                    ? `Unable to find the planning model button for "${desiredLabel}".`
                    : 'Unable to find any planning model button.',
            );
        }

        target.click();
    }, modelLabel);
}

async function waitForFounderDraftReview(page, expectedDraftTexts) {
    const handle = await page.waitForFunction((expectedTexts) => {
        const sectionText = document.getElementById('founder-planning-section')?.innerText || '';
        if (expectedTexts.every((item) => sectionText.toLowerCase().includes(String(item).toLowerCase()))) {
            return { ready: true, sectionText };
        }

        const draftError = Array.from(document.querySelectorAll('[role="alert"], .error, .form-error'))
            .map((node) => (node.textContent || '').trim())
            .find(Boolean);
        if (draftError) {
            return { ready: false, error: draftError, sectionText };
        }

        return false;
    }, expectedDraftTexts, { timeout: 60000 });
    const result = await handle.jsonValue();
    await handle.dispose();

    if (!result?.ready) {
        throw new Error(`Founder draft review did not become ready: ${result?.error || 'no draft text found'}`);
    }

    return result.sectionText || '';
}

function extractMetric(pageText, label) {
    const escapedLabel = escapeRegExp(label);
    const match = pageText.match(new RegExp(`${escapedLabel}\\s*(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
}

function buildFounderSelfBootstrapIdentity(runId) {
    const suffix = runId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(-24) || `${Date.now()}`;
    return {
        email: `founder-e2e-${suffix}@example.com`,
        password: 'OpenClaw!12345',
        companyName: `Founder E2E Company ${suffix}`,
    };
}

async function chooseTenantIfPresent(page, tenantName) {
    const exactButton = page.getByRole('button', { name: tenantName, exact: true }).first();
    if (await waitForOptional(exactButton, 1500)) {
        await exactButton.click();
        return true;
    }

    const partialButton = page.getByRole('button', {
        name: new RegExp(escapeRegExp(tenantName), 'i'),
    }).first();
    if (await waitForOptional(partialButton, 1500)) {
        await partialButton.click();
        return true;
    }

    return false;
}

async function waitForLoginOutcome(page, tenantName, timeout = 30000) {
    const handle = await page.waitForFunction((desiredTenantName) => {
        const normalizedTenantName = desiredTenantName.trim().toLowerCase();
        const bodyText = document.body?.innerText || '';
        const loginErrorText = Array.from(document.querySelectorAll('.login-error'))
            .map((node) => (node.textContent || '').trim())
            .find(Boolean);
        const matchingTenantLabel = Array.from(document.querySelectorAll('button'))
            .map((button) => (button.textContent || '').trim())
            .find((text) => {
                const normalizedText = text.toLowerCase();
                return normalizedText === normalizedTenantName || normalizedText.includes(normalizedTenantName);
            });

        if (loginErrorText) {
            return {
                outcome: 'error',
                message: loginErrorText,
                pathname: window.location.pathname,
                bodyText,
            };
        }

        if (matchingTenantLabel) {
            return {
                outcome: 'tenant',
                tenantLabel: matchingTenantLabel,
                pathname: window.location.pathname,
            };
        }

        if (window.localStorage.getItem('token') || window.location.pathname !== '/login') {
            return {
                outcome: 'authenticated',
                pathname: window.location.pathname,
            };
        }

        return false;
    }, tenantName, { timeout });

    const result = await handle.jsonValue();
    await handle.dispose();
    return result;
}

async function ensureSelfBootstrapModel(page) {
    return page.evaluate(async (payload) => {
        const token = window.localStorage.getItem('token') || '';
        if (!token) {
            throw new Error('Missing auth token while bootstrapping the founder model.');
        }

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        };
        const listResponse = await fetch('/api/enterprise/llm-models', { headers });
        const listText = await listResponse.text();
        if (!listResponse.ok) {
            throw new Error(`Failed to list tenant LLM models: ${listResponse.status} ${listText}`);
        }

        const existingModels = listText ? JSON.parse(listText) : [];
        const enabledModels = Array.isArray(existingModels)
            ? existingModels.filter((item) => item && item.enabled !== false)
            : [];
        if (enabledModels.length > 0) {
            return {
                created: false,
                modelId: String(enabledModels[0]?.id || ''),
                label: String(enabledModels[0]?.label || ''),
            };
        }

        const createResponse = await fetch('/api/enterprise/llm-models', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        const createText = await createResponse.text();
        if (!createResponse.ok) {
            throw new Error(`Failed to create self-bootstrap LLM model: ${createResponse.status} ${createText}`);
        }

        const createdModel = createText ? JSON.parse(createText) : {};
        return {
            created: true,
            modelId: String(createdModel?.id || ''),
            label: String(createdModel?.label || payload.label || ''),
        };
    }, SELF_BOOTSTRAP_MODEL_PAYLOAD);
}

async function cleanupSelfBootstrapArtifacts(page) {
    return page.evaluate(async () => {
        const token = window.localStorage.getItem('token') || '';
        if (!token) {
            throw new Error('Missing auth token before founder self-bootstrap cleanup.');
        }

        const response = await fetch('/api/tenants/self-bootstrap-cleanup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ confirm: true }),
        });
        const bodyText = await response.text();
        if (!response.ok) {
            throw new Error(`Founder self-bootstrap cleanup failed: ${response.status} ${bodyText}`);
        }
        return bodyText ? JSON.parse(bodyText) : { ok: true };
    });
}

async function loginFounderSession(page, config, shot) {
    await page.locator('form.login-form input[type="email"]').fill(config.email);
    await page.locator('form.login-form input[type="password"]').fill(config.password);
    await page.locator('form.login-form button.login-submit').click();

    const loginOutcome = await waitForLoginOutcome(page, config.tenantName);
    if (loginOutcome.outcome === 'error') {
        throw new Error(`Login failed: ${loginOutcome.message}`);
    }

    if (loginOutcome.outcome === 'tenant') {
        const tenantSelected = await chooseTenantIfPresent(
            page,
            loginOutcome.tenantLabel || config.tenantName,
        );
        assert.equal(
            tenantSelected,
            true,
            `Expected tenant selection button "${loginOutcome.tenantLabel || config.tenantName}" to be clickable.`,
        );
        await shot('02-tenant-modal');
    }

    await page.waitForFunction(() => Boolean(window.localStorage.getItem('token')), null, {
        timeout: 30000,
    });
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30000 }).catch(() => {});
}

async function selfBootstrapFounderSession(page, { email, password, companyName, shot }) {
    await page.locator('.login-switch a').click();
    await page.getByRole('button', { name: /^Register/i }).waitFor({ state: 'visible', timeout: 30000 });

    await page.locator('form.login-form input[type="email"]').fill(email);
    await page.locator('form.login-form input[type="password"]').fill(password);
    await shot('02-self-bootstrap-register');
    await page.locator('form.login-form button.login-submit').click();

    await page.waitForFunction(() => Boolean(window.localStorage.getItem('token')), null, {
        timeout: 30000,
    });
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    if (new URL(page.url()).pathname === '/setup-company') {
        const createCompanyPanel = page.locator('.company-setup-panel').last();
        await createCompanyPanel.waitFor({ state: 'visible', timeout: 30000 });
        await createCompanyPanel.locator('input').first().fill(companyName);
        await shot('02b-self-bootstrap-company-setup');
        await createCompanyPanel.locator('button.login-submit').click();
        await page.waitForURL((url) => url.pathname !== '/setup-company', { timeout: 30000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    }

    if (new URL(page.url()).pathname === '/verify-email') {
        await shot('02c-self-bootstrap-verify-email');
        await page.waitForURL((url) => url.pathname !== '/verify-email', { timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        if (new URL(page.url()).pathname === '/verify-email') {
            throw new Error(
                'Self-bootstrap registration requires email verification. Set FOUNDER_E2E_EMAIL/FOUNDER_E2E_PASSWORD or disable SMTP auto-verification for local live E2E.',
            );
        }
    }

    const modelSeedResult = await ensureSelfBootstrapModel(page);
    if (modelSeedResult.created) {
        await shot('02d-self-bootstrap-model-seeded');
    }
    await shot('02d-self-bootstrap-ready');
}

async function main() {
    const config = buildFounderMainlineE2eConfig(process.env);
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const scenario = buildFounderMainlineE2eScenario(runId, config.scenarioKey);
    const runtimeDir = resolveAbsolutePath(config.runtimeDir, os.tmpdir());
    const screenshotDir = resolveAbsolutePath(config.screenshotDir, repoRoot);
    const walkthroughPath = resolveAbsolutePath(config.walkthroughPath, repoRoot);

    if (!fs.existsSync(config.edgePath)) {
        throw new Error(`Microsoft Edge executable was not found at ${config.edgePath}`);
    }

    ensureDirectory(screenshotDir);
    ensureDirectory(path.dirname(walkthroughPath));

    const { chromium } = ensurePlaywrightRuntime(runtimeDir);
    const browser = await chromium.launch({
        executablePath: config.edgePath,
        headless: config.headless,
    });
    const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1440, height: 1200 },
    });

    await context.addInitScript(() => {
        window.localStorage.setItem('i18nextLng', 'en');
    });

    const page = await context.newPage();
    const consoleMessages = [];
    const requestFailures = [];
    const screenshotLog = [];

    page.on('console', (message) => {
        consoleMessages.push(`[${message.type()}] ${message.text()}`);
    });
    page.on('requestfailed', (request) => {
        requestFailures.push(`${request.method()} ${request.url()} => ${request.failure()?.errorText || 'failed'}`);
    });

    async function shot(name) {
        const screenshotPath = path.join(screenshotDir, `${runId}-${name}.png`);
        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
        });
        const annotation = getWalkthroughAnnotation(name);
        screenshotLog.push({
            name,
            path: screenshotPath,
            title: annotation.title,
            note: annotation.note,
        });
    }

    let successPayload = null;
    let primaryError = null;
    let cleanupSummary = null;

    try {
        await page.goto(`${config.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await shot('01-login');

        if (config.authMode === 'login') {
            await loginFounderSession(page, config, shot);
        } else {
            await selfBootstrapFounderSession(page, {
                ...buildFounderSelfBootstrapIdentity(runId),
                shot,
            });
        }

        await page.goto(buildFounderWorkspaceUrl(config.baseUrl), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        assert.notEqual(new URL(page.url()).pathname, '/login', 'Login did not create an authenticated session.');
        await shot('03-post-login');
        await shot('04-founder-workspace');

        await fillTextboxByName(page, 'Workspace name', scenario.workspaceName);
        await fillTextboxByName(page, 'Core offer', scenario.coreOffer);
        await fillTextboxByName(page, 'Acquisition channel', scenario.acquisitionChannel);
        await fillTextboxByName(page, 'Business brief', scenario.businessBrief);
        await page.getByRole('button', { name: 'Create Founder Workspace' }).click();

        await page.locator(`text=${scenario.workspaceName}`).first().waitFor({ state: 'visible', timeout: 30000 });
        const workspaceUrl = new URL(page.url());
        const createdWorkspaceId = workspaceUrl.searchParams.get('workspaceId') || '';
        assert.match(createdWorkspaceId, /^[0-9a-f-]{8,}$/i, 'Expected founder workspace URL to include workspaceId.');
        await shot('05-workspace-created');

        await page.goto(buildFounderWorkspaceUrl(config.baseUrl, createdWorkspaceId), {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await page.locator(`text=${scenario.workspaceName}`).first().waitFor({ state: 'visible', timeout: 30000 });
        await shot('05b-founder-workspace-deeplink');

        await choosePlanningModel(page, config.modelLabel, config.authMode);

        const planningTextareas = page.locator('#founder-planning-section textarea.form-input');
        await planningTextareas.nth(0).waitFor({ state: 'visible', timeout: 30000 });
        await planningTextareas.nth(0).fill(scenario.businessBrief);

        for (let index = 0; index < scenario.answers.length; index += 1) {
            await planningTextareas.nth(index + 1).fill(scenario.answers[index].answerText);
        }

        await shot('06-interview-filled');

        await page.getByRole('button', { name: 'Save interview progress' }).click();
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

        const generateDraftButton = page.getByRole('button', { name: 'Generate founder draft plan' });
        await generateDraftButton.click();
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        const draftText = await waitForFounderDraftReview(page, scenario.expectedDraftTexts);
        for (const expectedDraftText of scenario.expectedDraftTexts) {
            assert.match(
                draftText,
                new RegExp(escapeRegExp(expectedDraftText), 'i'),
                `Expected founder draft review to include "${expectedDraftText}".`,
            );
        }
        await shot('07-draft-plan');

        await page.locator('#founder-planning-section input[type="checkbox"]').first().check();
        await generateDraftButton.click();
        await page.getByRole('button', { name: 'Generate multi-agent company scaffold' }).waitFor({
            state: 'visible',
            timeout: 30000,
        });
        await shot('08-ready-for-materialize');

        await page.getByRole('button', { name: 'Generate multi-agent company scaffold' }).click();
        await page.waitForURL((url) => url.pathname.endsWith('/founder-workspace/dashboard'), { timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        const dashboardUrl = new URL(page.url());
        assert.equal(
            dashboardUrl.searchParams.get('workspaceId'),
            createdWorkspaceId,
            'Expected founder dashboard URL to preserve workspaceId.',
        );
        await shot('09-dashboard');

        await page.goto(buildFounderDashboardUrl(config.baseUrl, createdWorkspaceId), {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await shot('09b-dashboard-deeplink');

        const headline = (await page.locator('h1').first().textContent())?.trim() || '';
        const dashboardText = await page.locator('body').innerText();
        const agentCards = (await page.locator('section').nth(2).locator('strong').allTextContents())
            .map((item) => item.trim())
            .filter(Boolean);

        assert.match(headline, /currently has/i);
        assert.ok(
            agentCards.length >= scenario.expectedAgentNames.length,
            `Expected at least ${scenario.expectedAgentNames.length} agent cards but found ${agentCards.length}.`,
        );
        for (const expectedAgentName of scenario.expectedAgentNames) {
            assert.ok(
                agentCards.includes(expectedAgentName),
                `Expected dashboard to include agent "${expectedAgentName}".`,
            );
        }

        const blockerCount = extractMetric(dashboardText, 'Blockers');
        const relationshipCount = extractMetric(dashboardText, 'Relationships');
        const triggerCount = extractMetric(dashboardText, 'Starter triggers');

        assert.equal(blockerCount, 0, 'Founder dashboard should not report active blockers.');
        assert.ok(
            relationshipCount !== null && relationshipCount >= scenario.minimumRelationshipCount,
            `Expected at least ${scenario.minimumRelationshipCount} relationships but found ${relationshipCount}.`,
        );
        assert.ok(
            triggerCount !== null && triggerCount >= scenario.minimumTriggerCount,
            `Expected at least ${scenario.minimumTriggerCount} starter triggers but found ${triggerCount}.`,
        );

        successPayload = {
            ok: true,
            authMode: config.authMode,
            scenarioKey: scenario.scenarioKey,
            baseUrl: config.baseUrl,
            workspaceName: scenario.workspaceName,
            finalUrl: page.url(),
            headline,
            agentCards,
            blockerCount,
            relationshipCount,
            triggerCount,
            requestFailures,
            consoleMessages: consoleMessages.slice(-20),
            screenshotsPrefix: path.join(screenshotDir, `${runId}-*.png`),
            walkthroughPath,
        };
    } catch (error) {
        primaryError = error;
        await shot('error').catch(() => {});
        console.error(JSON.stringify({
            ok: false,
            authMode: config.authMode,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            currentUrl: page.url(),
            requestFailures,
            consoleMessages: consoleMessages.slice(-40),
            screenshotsPrefix: path.join(screenshotDir, `${runId}-*.png`),
            walkthroughPath,
        }, null, 2));
    } finally {
        if (config.cleanupAfterRun) {
            const hasToken = await page.evaluate(() => Boolean(window.localStorage.getItem('token'))).catch(() => false);
            if (hasToken) {
                try {
                    cleanupSummary = await cleanupSelfBootstrapArtifacts(page);
                } catch (error) {
                    if (primaryError === null) {
                        primaryError = error;
                    } else {
                        console.error(
                            `Founder self-bootstrap cleanup also failed: ${error instanceof Error ? error.message : String(error)}`,
                        );
                    }
                }
            }
        }
        await context.close();
        await browser.close();
    }

    try {
        const walkthroughMarkdown = buildFounderMainlineE2eWalkthroughMarkdown({
            runId,
            baseUrl: config.baseUrl,
            scenario,
            status: primaryError ? 'failed' : 'passed',
            screenshots: screenshotLog.map((screenshot) => ({
                name: screenshot.name,
                title: screenshot.title,
                note: screenshot.note,
                relativePath: buildScreenshotMarkdownPath(walkthroughPath, screenshot.path),
            })),
            metrics: successPayload
                ? {
                    finalUrl: successPayload.finalUrl,
                    headline: successPayload.headline,
                    agentCards: successPayload.agentCards,
                    blockerCount: successPayload.blockerCount,
                    relationshipCount: successPayload.relationshipCount,
                    triggerCount: successPayload.triggerCount,
                }
                : null,
            errorMessage: primaryError instanceof Error ? primaryError.message : primaryError ? String(primaryError) : '',
            cleanupSummary,
        });
        fs.writeFileSync(walkthroughPath, walkthroughMarkdown, 'utf8');
    } catch (error) {
        if (primaryError === null) {
            primaryError = error;
        } else {
            console.error(
                `Founder walkthrough write also failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    if (primaryError) {
        if (successPayload !== null) {
            console.error(primaryError instanceof Error ? primaryError.stack || primaryError.message : String(primaryError));
        }
        process.exitCode = 1;
        return;
    }

    console.log(JSON.stringify({
        ...successPayload,
        cleanupSummary,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
