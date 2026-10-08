import { logger } from '../utils/logger.js';
import { get } from '../utils/config.js';
import { FlowError, ErrorCodes } from '../utils/errors.js';
import { takeScreenshot } from '../utils/screenshots.js';
import { getPage } from './connect.js';

const EXPECTED_ACCOUNT = process.env.FLOW_EXPECTED_ACCOUNT || get('expectedAccount');

export async function verifyAccount() {
  const page = getPage();
  const currentUrl = page.url();

  if (!EXPECTED_ACCOUNT) {
    logger.warn('No expectedAccount configured; skipping strict Google account match');
    return {
      verified: null,
      account: null,
      method: 'not-configured',
      message: 'Set expectedAccount in config/flow.config.json or FLOW_EXPECTED_ACCOUNT to enable account verification.',
    };
  }

  logger.info('Verifying Google account on Flow', { expectedAccount: EXPECTED_ACCOUNT });

  try {
    const accountChip = await page.$('[data-account-email], [aria-label*="gmail"], [data-test-id*="account"]');
    if (accountChip) {
      const text = await accountChip.textContent();
      if (text && text.includes(EXPECTED_ACCOUNT)) {
        logger.info('Account verified via UI chip', { account: EXPECTED_ACCOUNT });
        return { verified: true, account: EXPECTED_ACCOUNT, method: 'ui-chip' };
      }
      if (text && text.includes('@gmail.com') && !text.includes(EXPECTED_ACCOUNT)) {
        await takeScreenshot(page, 'wrong-account');
        throw new FlowError(
          ErrorCodes.WRONG_GOOGLE_ACCOUNT,
          `Wrong Google account detected. Expected ${EXPECTED_ACCOUNT}, found account with: ${text.trim()}`
        );
      }
    }

    const title = await page.title();
    if (title) logger.debug('Page title', { title });

    const accountSelector = await page.$('[role="button"][aria-haspopup], .account-chooser, [jsname*="account"]');
    if (accountSelector) {
      const selText = await accountSelector.textContent();
      logger.debug('Account selector found', { text: selText?.substring(0, 50) });
    }

    try {
      const gaiaInfo = await page.evaluate(() => {
        const flowData = document.getElementById('__NEXT_DATA__')?.textContent;
        if (!flowData) return null;
        try {
          const parsed = JSON.parse(flowData);
          return parsed?.props?.pageProps?.user?.email || null;
        } catch {
          return null;
        }
      });

      if (gaiaInfo) {
        if (gaiaInfo !== EXPECTED_ACCOUNT) {
          await takeScreenshot(page, 'wrong-account');
          throw new FlowError(
            ErrorCodes.WRONG_GOOGLE_ACCOUNT,
            `Wrong Google account detected. Expected ${EXPECTED_ACCOUNT}, found ${gaiaInfo}`
          );
        }
        return { verified: true, account: EXPECTED_ACCOUNT, method: 'page-data' };
      }
    } catch (e) {
      if (e instanceof FlowError) throw e;
      logger.debug('Could not read page internals for account', { error: e.message });
    }

    logger.info('Account check found no conflicting account', {
      account: EXPECTED_ACCOUNT,
      currentUrl: currentUrl?.substring(0, 80),
    });

    return { verified: true, account: EXPECTED_ACCOUNT, method: 'no-conflict-detected' };
  } catch (err) {
    if (err instanceof FlowError) throw err;
    throw new FlowError(
      ErrorCodes.PLAYWRIGHT_ERROR,
      `Failed to verify account: ${err.message}`
    );
  }
}
