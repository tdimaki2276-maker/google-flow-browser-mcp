import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { logger } from '../utils/logger.js';
import { get } from '../utils/config.js';
import { FlowError, ErrorCodes } from '../utils/errors.js';
import { launchChromeDirect, setPage, setContext, setConnected, setBrowser, isBrowserConnected } from './connect.js';

const CDP_PORT = get('cdpPort', 9222);
const FLOW_URL = get('flowUrl', 'https://labs.google/fx/tools/flow');

function expandPath(value) {
  if (!value) return value;
  let out = value.replace(/^~(?=$|[\\/])/, os.homedir());
  out = out.replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m);
  out = out.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (m, name) => process.env[name] ?? m);
  return path.resolve(out);
}

function firstExisting(candidates) {
  return candidates.map(expandPath).find(Boolean)?.split('\0')[0] && candidates
    .map(expandPath)
    .find(candidate => candidate && fs.existsSync(candidate));
}

function defaultChromePath() {
  if (process.platform === 'win32') {
    return firstExisting([
      '%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe',
      '%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe',
      '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe',
    ]);
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return firstExisting([
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]);
}

function defaultUserDataDir() {
  if (process.platform === 'win32') {
    return expandPath('%LOCALAPPDATA%\\GoogleFlowMCP\\ChromeUserData');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'GoogleFlowMCP', 'ChromeUserData');
  }
  return path.join(os.homedir(), '.config', 'google-flow-mcp', 'chrome-user-data');
}

export async function launchKiaraProfile(headless = false) {
  if (isBrowserConnected()) {
    logger.info('Browser already connected, reusing');
    return { success: true, message: 'Already connected' };
  }

  const chromePath = expandPath(process.env.FLOW_CHROME_PATH || get('chromePath')) || defaultChromePath();
  const userDataDir = expandPath(process.env.FLOW_CHROME_USER_DATA_DIR || get('chromeUserDataDir')) || defaultUserDataDir();
  const profileName = process.env.FLOW_CHROME_PROFILE || get('chromeProfile', 'Default');

  if (!chromePath || !fs.existsSync(chromePath)) {
    throw new FlowError(
      ErrorCodes.CONFIG_ERROR,
      'Google Chrome was not found. Set chromePath in config/flow.config.json or FLOW_CHROME_PATH.'
    );
  }

  fs.mkdirSync(userDataDir, { recursive: true });

  logger.info('Preparing persistent Chrome + CDP session', {
    chromePath,
    userDataDir,
    profileName,
    cdpPort: CDP_PORT,
  });

  try {
    const existing = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    logger.info('Found existing Chrome instance, reusing');
    const ctx = existing.contexts()[0];
    const pg = ctx?.pages()[0];
    setBrowser(existing);
    setContext(ctx);
    setConnected(true);
    if (pg) {
      setPage(pg);
      return { browser: existing, context: ctx, page: pg };
    }
    const newPage = await ctx.newPage();
    setPage(newPage);
    return { browser: existing, context: ctx, page: newPage };
  } catch {
    return await launchChromeDirect({
      chromePath,
      cdpPort: CDP_PORT,
      headless,
      userDataDir,
      profileName,
    });
  }
}

export async function navigateToFlow(page, toolPage) {
  const targetUrl = toolPage === true
    ? 'https://labs.google/fx/tools/flow'
    : FLOW_URL;

  logger.info('Navigating to Google Flow', { url: targetUrl });
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  logger.info('Flow page loaded', { url: currentUrl.substring(0, 100) });

  if (currentUrl.includes('accounts.google.com')) {
    return {
      authenticated: false,
      url: currentUrl,
      message: 'Google sign-in is required in the persistent MCP Chrome profile. Complete it once, then retry.',
    };
  }

  return { authenticated: true, url: currentUrl };
}
