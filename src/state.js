import fs from 'fs';
import path from 'path';

const RESULTS_FILE = './results.json';
const SCREENSHOTS_DIR = './screenshots';

// Ensure screenshots directory exists
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Append a result record to results.json.
 * @param {{ url: string, platform: string, status: 'filled'|'submitted'|'needs-manual'|'failed', answers?: object, screenshot?: string, error?: string }} record
 */
export function logResult(record) {
  let existing = [];
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    } catch {
      existing = [];
    }
  }
  existing.push({ ...record, timestamp: new Date().toISOString() });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existing, null, 2));
}

/**
 * Save a Playwright page screenshot and return the file path.
 * @param {import('playwright').Page} page
 * @param {string} label  e.g. "naukri-filled"
 */
export async function saveScreenshot(page, label) {
  const filename = `${Date.now()}-${label}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}
