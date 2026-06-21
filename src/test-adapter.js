/**
 * Manual smoke-test for a single adapter.
 * Usage:
 *   node src/test-adapter.js <url> [resume.pdf]
 *
 * Opens the URL in the persistent browser, runs the adapter pipeline
 * (getJobDescription → fillBasics → uploadResume → getQuestions → locate submit),
 * logs findings, then leaves the browser open for visual inspection.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { launch } from './browser.js';
import { pickAdapter } from './adapters/index.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node src/test-adapter.js <url> [resume.pdf]');
  process.exit(1);
}

const profile = JSON.parse(readFileSync('./config/profile.json', 'utf8'));

// Resolve resume PDF: explicit arg > config/resume.pdf > skip
const pdfArg = process.argv[3];
let pdfPath = null;
if (pdfArg) {
  pdfPath = resolve(pdfArg);
} else if (existsSync('./config/resume.pdf')) {
  pdfPath = resolve('./config/resume.pdf');
}

console.log('─────────────────────────────────');
console.log('URL    :', url);
console.log('Profile:', profile.firstName, profile.lastName, `<${profile.email}>`);
console.log('Resume :', pdfPath ?? '(none — upload step will be skipped)');
console.log('─────────────────────────────────\n');

const { page } = await launch();

try {
  console.log('→ Navigating to URL…');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  Page title:', await page.title());

  const adapter = pickAdapter(url);
  if (!adapter) {
    console.error('\n✗ No adapter matched this URL.');
    console.log('  Registered adapters handle: greenhouse.io');
    console.log('\nBrowser is open — press Ctrl+C to exit.');
    await new Promise(() => {});
  }

  console.log(`\n✓ Adapter matched: ${adapter.constructor.name}`);

  // ── 1. Job description ─────────────────────────────────────────
  console.log('\n[1/4] Scraping job description…');
  const jd = await adapter.getJobDescription(page);
  if (jd) {
    console.log(`  Length: ${jd.length} chars`);
    console.log('  Preview:', jd.slice(0, 300).replace(/\n+/g, ' ') + (jd.length > 300 ? '…' : ''));
  } else {
    console.log('  (no job description found)');
  }

  // ── 2. Fill basics ─────────────────────────────────────────────
  console.log('\n[2/4] Filling basic fields…');
  await adapter.fillBasics(page, profile);
  console.log('  Done — check the browser for filled values.');

  // ── 3. Upload resume ───────────────────────────────────────────
  if (pdfPath) {
    console.log('\n[3/4] Uploading resume…');
    await adapter.uploadResume(page, pdfPath);
    console.log('  Done.');
  } else {
    console.log('\n[3/4] Resume upload skipped (no PDF found).');
    console.log('  Place a PDF at config/resume.pdf or pass the path as the second argument.');
  }

  // ── 4. Detect questions ────────────────────────────────────────
  console.log('\n[4/4] Detecting custom questions…');
  const questions = await adapter.getQuestions(page);
  if (questions.length === 0) {
    console.log('  No custom questions detected.');
  } else {
    console.log(`  Found ${questions.length} question(s):`);
    for (const q of questions) {
      console.log(`    [${q.type.padEnd(8)}] "${q.label}" → ${q.selector}`);
    }
  }

  // ── Submit locator (no click) ──────────────────────────────────
  const submitLoc = await adapter.submit(page);
  const submitText = await submitLoc.innerText().catch(() => '');
  const submitCount = await submitLoc.count();
  if (submitCount > 0) {
    console.log(`\n✓ Submit button found: "${submitText.trim() || '(no text)'}"`);
    console.log('  NOT clicking — manual review mode.');
  } else {
    console.log('\n✗ Submit button not located.');
  }

} catch (err) {
  console.error('\n✗ Error during test run:', err.message);
  if (process.env.DEBUG) console.error(err);
}

console.log('\n─────────────────────────────────');
console.log('Browser is open — inspect the page, then press Ctrl+C to exit.');
await new Promise(() => {});
