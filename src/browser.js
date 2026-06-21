import { chromium } from 'playwright';
import path from 'path';

const BROWSER_DATA_DIR = path.resolve('./browser-data');

let _browser;

/**
 * Launch (or reuse) a persistent Chromium context so platform logins survive runs.
 * Returns { context, page } — page is a fresh blank tab.
 */
export async function launch() {
  // persistentContext keeps cookies/localStorage across runs
  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--start-maximized'],
  });

  const page = await context.newPage();
  _browser = context;
  return { context, page };
}

/** Close the persistent context gracefully. */
export async function close() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
