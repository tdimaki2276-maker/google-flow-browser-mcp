import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';
import { get } from '../utils/config.js';
import { FlowError, ErrorCodes } from '../utils/errors.js';

let browser = null;
let context = null;
let page = null;
let isConnected = false;

function expandPath(value) {
  if (!value) return value;
  let out = value.replace(/^~(?=$|[\\/])/, os.homedir());
  out = out.replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m);
  out = out.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (m, name) => process.env[name] ?? m);
  return path.resolve(out);
}

export async function connectToBrowser(options = {}) {
  if (isConnected && page) {
    logger.info('Already connected to browser');
    return { browser, context, page };
  }

  const cdpPort = options.cdpPort || get('cdpPort', 9222);
  const cdpUrl = `http://127.0.0.1:${cdpPort}`;

  try {
    logger.info('Attempting CDP connection', { url: cdpUrl });
    browser = await chromium.connectOverCDP(cdpUrl);
    logger.info('Connected via CDP');

    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    isConnected = true;
    logger.info('Browser connected successfully');
    return { browser, context, page };
  } catch (err) {
    logger.warn('CDP connection failed, will launch new browser', { error: err.message });
    return await launchNewBrowser(cdpPort, options);
  }
}

async function launchNewBrowser(cdpPort, options = {}) {
  const chromePath = expandPath(options.chromePath || process.env.FLOW_CHROME_PATH || get('chromePath'));
  const userDataDir = expandPath(
    options.userDataDir ||
    process.env.FLOW_CHROME_USER_DATA_DIR ||
    get('chromeUserDataDir') ||
    path.join(os.homedir(), '.google-flow-mcp', 'chrome-user-data')
  );
  const profileName = options.profileName || process.env.FLOW_CHROME_PROFILE || get('chromeProfile', 'Default');

  if (!chromePath || !fs.existsSync(chromePath)) {
    throw new FlowError(ErrorCodes.PLAYWRIGHT_ERROR, `Chrome not found at ${chromePath || '(not configured)'}`);
  }

  fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileName}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
  ];

  if (get('headless', false)) args.push('--headless=new');

  logger.info('Launching Chrome with persistent MCP profile', {
    chromePath,
    userDataDir,
    profileName,
    cdpPort,
  });

  return await launchChromeDirect({
    chromePath,
    cdpPort,
    headless: get('headless', false),
    userDataDir,
    profileName,
  });
}

/**
 * Launch Chrome directly and connect through CDP.
 *
 * The MCP profile is persistent: cookies and Google login remain in userDataDir
 * across runs. Use a dedicated MCP user-data directory rather than your normal
 * day-to-day Chrome profile to avoid profile locks and Chrome remote-debugging
 * restrictions.
 */
export async function launchChromeDirect(options = {}) {
  const chromePath = expandPath(options.chromePath || process.env.FLOW_CHROME_PATH || get('chromePath'));
  const cdpPort = options.cdpPort || get('cdpPort', 9222);
  const headless = options.headless ?? get('headless', false);
  const userDataDir = expandPath(
    options.userDataDir ||
    process.env.FLOW_CHROME_USER_DATA_DIR ||
    get('chromeUserDataDir') ||
    path.join(os.homedir(), '.google-flow-mcp', 'chrome-user-data')
  );
  const profileName = options.profileName || process.env.FLOW_CHROME_PROFILE || get('chromeProfile', 'Default');

  if (isConnected && page) {
    logger.info('Already connected, reusing browser');
    return { browser, context, page };
  }

  if (!chromePath || !fs.existsSync(chromePath)) {
    throw new FlowError(ErrorCodes.PLAYWRIGHT_ERROR, `Chrome not found at ${chromePath || '(not configured)'}`);
  }

  fs.mkdirSync(userDataDir, { recursive: true });

  try {
    const existing = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    logger.info('Existing CDP Chrome found, reusing');
    browser = existing;
    context = browser.contexts()[0];
    page = context?.pages()[0] || await context.newPage();
    isConnected = true;
    return { browser, context, page };
  } catch {
    // No CDP browser is running yet.
  }

  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileName}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
  ];
  if (headless) args.push('--headless=new');

  logger.info('Launching Chrome directly', {
    chromePath,
    cdpPort,
    headless,
    userDataDir,
    profileName,
  });

  const chromeProcess = spawn(chromePath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  chromeProcess.on('error', (err) => {
    logger.error('Chrome process failed', { error: err.message });
  });

  const cdpUrl = `http://127.0.0.1:${cdpPort}`;
  let attempts = 0;
  while (attempts < 25) {
    try {
      const resp = await fetch(`${cdpUrl}/json/version`);
      if (resp.ok) break;
    } catch {
      // Wait for Chrome to expose CDP.
    }
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  if (attempts >= 25) {
    throw new FlowError(ErrorCodes.PLAYWRIGHT_ERROR, 'Chrome CDP failed to start in time');
  }

  browser = await chromium.connectOverCDP(cdpUrl);
  context = browser.contexts()[0];
  page = context?.pages()[0] || await context.newPage();
  isConnected = true;

  logger.info('Chrome direct + CDP connected', {
    webdriver: await page.evaluate(() => navigator.webdriver),
    persistentProfile: userDataDir,
  });

  return { browser, context, page };
}

export async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      logger.warn('Error closing browser', { error: err.message });
    }
  }
  browser = null;
  context = null;
  page = null;
  isConnected = false;
  logger.info('Browser disconnected; persistent profile data kept on disk');
}

export function getPage() {
  if (!page) {
    throw new FlowError(ErrorCodes.BROWSER_NOT_CONNECTED, 'Browser not connected. Call connectToBrowser() first.');
  }
  return page;
}

export function getContext() {
  return context;
}

export function isBrowserConnected() {
  return isConnected;
}

export function setPage(newPage) {
  page = newPage;
}

export function getBrowser() {
  return browser;
}

export function setBrowser(b) {
  browser = b;
}

export function setConnected(connected) {
  isConnected = connected;
}

export function setContext(ctx) {
  context = ctx;
}
