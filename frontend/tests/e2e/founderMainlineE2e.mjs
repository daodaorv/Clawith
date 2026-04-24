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
} from '../../src/services/founderMainlineE2e.ts';

const PLAYWRIGHT_CORE_VERSION = '1.59.1';
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

async function choosePlanningModel(page, modelLabel) {
    await page.waitForFunction(
        () => document.querySelectorAll('#founder-planning-section button:not(.btn)').length > 0,
        null,
        { timeout: 30000 },
    );

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

function extractMetric(pageText, label) {
    const escapedLabel = escapeRegExp(label);
    const match = pageText.match(new RegExp(`${escapedLabel}\\s*(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
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

async function main() {
    const config = buildFounderMainlineE2eConfig(process.env);
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const scenario = buildFounderMainlineE2eScenario(runId);
    const runtimeDir = resolveAbsolutePath(config.runtimeDir, os.tmpdir());
    const screenshotDir = resolveAbsolutePath(config.screenshotDir, repoRoot);

    if (!fs.existsSync(config.edgePath)) {
        throw new Error(`Microsoft Edge executable was not found at ${config.edgePath}`);
    }

    ensureDirectory(screenshotDir);

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

    page.on('console', (message) => {
        consoleMessages.push(`[${message.type()}] ${message.text()}`);
    });
    page.on('requestfailed', (request) => {
        requestFailures.push(`${request.method()} ${request.url()} => ${request.failure()?.errorText || 'failed'}`);
    });

    async function shot(name) {
        await page.screenshot({
            path: path.join(screenshotDir, `${runId}-${name}.png`),
            fullPage: true,
        });
    }

    try {
        await page.goto(`${config.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await shot('01-login');

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

        await page.goto(`${config.baseUrl}/founder-workspace`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
        await shot('05-workspace-created');

        await choosePlanningModel(page, config.modelLabel);

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
        await shot('09-dashboard');

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

        console.log(JSON.stringify({
            ok: true,
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
        }, null, 2));
    } catch (error) {
        await shot('error').catch(() => {});
        console.error(JSON.stringify({
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            currentUrl: page.url(),
            requestFailures,
            consoleMessages: consoleMessages.slice(-40),
            screenshotsPrefix: path.join(screenshotDir, `${runId}-*.png`),
        }, null, 2));
        process.exitCode = 1;
    } finally {
        await context.close();
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});
