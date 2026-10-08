import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { launchKiaraProfile, navigateToFlow } from '../src/browser/launch-profile.js';
import { verifyAccount } from '../src/browser/account-check.js';
import { closeBrowser, getPage } from '../src/browser/connect.js';

const rl = readline.createInterface({ input, output });

try {
  console.log('[TEST] Opening persistent Chrome profile...');
  await launchKiaraProfile(false);
  const page = getPage();

  let nav = await navigateToFlow(page);
  if (!nav.authenticated) {
    console.log('');
    console.log('[TEST] Google sign-in is required.');
    console.log('[TEST] Complete the normal Google sign-in in the Chrome window that opened.');
    await rl.question('[TEST] When Flow is visible, press Enter here to continue...');
    nav = await navigateToFlow(page);
  }

  if (!nav.authenticated) {
    throw new Error('Flow still redirects to Google sign-in.');
  }

  const account = await verifyAccount();
  console.log('');
  console.log('[TEST] Flow connection works.');
  console.log(JSON.stringify({
    url: page.url(),
    accountVerified: account,
  }, null, 2));
  console.log('');
  console.log('[TEST] Closing Chrome. Login data remains in the dedicated persistent profile.');
} catch (err) {
  console.error('');
  console.error('[TEST] FAILED:', err?.message || err);
  process.exitCode = 1;
} finally {
  rl.close();
  try { await closeBrowser(); } catch {}
}
