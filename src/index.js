import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launch, close } from './browser.js';
import { pickAdapter } from './adapters/index.js';
import { writeAnswer } from './ai.js';
import { logResult, saveScreenshot } from './state.js';

// --- Static inputs ---

const profile = JSON.parse(fs.readFileSync('./config/profile.json', 'utf8'));
const resume = fs.readFileSync('./config/resume.txt', 'utf8');
const jobs = fs
  .readFileSync('./data/jobs.txt', 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

const REVIEW_MODE = process.env.REVIEW_MODE !== 'false';
const AUTO_SUBMIT = process.env.AUTO_SUBMIT === 'true';
const RESUME_PDF  = process.env.RESUME_PDF || path.resolve('./config/resume.pdf');

// --- Helpers ---

function jitter(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function promptReview() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n[REVIEW] Form filled. Press Enter to proceed, s+Enter to skip: ', ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 's' ? 'skip' : 'proceed');
    });
  });
}

/** Returns false if any required basic field is empty or resume input has no file. */
async function validateForm(page) {
  const required = [
    '#first_name, input[name="job_application[first_name]"]',
    '#last_name,  input[name="job_application[last_name]"]',
    '#email,      input[name="job_application[email]"], input[type="email"]',
  ];
  for (const sel of required) {
    const el = page.locator(sel).first();
    if ((await el.count()) === 0) continue;
    const val = await el.inputValue().catch(() => '');
    if (!val.trim()) return false;
  }

  // Resume must be attached
  const fileInput = page
    .locator('input[type="file"][name*="resume" i], input[type="file"]#resume, input[type="file"]')
    .first();
  if ((await fileInput.count()) > 0) {
    const attached = await fileInput
      .evaluate(el => el.files && el.files.length > 0)
      .catch(() => false);
    if (!attached) return false;
  }

  return true;
}

// --- Main ---

const { page } = await launch();

console.log(`\nready — ${jobs.length} job(s) queued`);
console.log(`REVIEW_MODE=${REVIEW_MODE}  AUTO_SUBMIT=${AUTO_SUBMIT}\n`);

if (jobs.length === 0) {
  console.log('No jobs in data/jobs.txt — add URLs and re-run.');
  await close();
  process.exit(0);
}

for (let i = 0; i < jobs.length; i++) {
  const url = jobs[i];
  console.log(`\n[${i + 1}/${jobs.length}] ${url}`);

  let platform = 'unknown';

  try {
    // 1. Open URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // 2. Pick adapter
    const adapter = pickAdapter(url);
    if (!adapter) {
      const screenshot = await saveScreenshot(page, 'needs-manual');
      logResult({ url, platform, status: 'needs-manual', screenshot, error: 'No adapter for this URL' });
      console.log('  → needs-manual (no adapter)');
      continue;
    }

    platform = adapter.constructor.name.replace('Adapter', '').toLowerCase();

    // 3. Pipeline
    console.log('  → getJobDescription');
    const jobDescription = await adapter.getJobDescription(page);

    console.log('  → fillBasics');
    await adapter.fillBasics(page, profile);

    if (fs.existsSync(RESUME_PDF)) {
      console.log('  → uploadResume');
      await adapter.uploadResume(page, RESUME_PDF);
    } else {
      console.warn(`  [warn] No PDF at ${RESUME_PDF} — skipping resume upload`);
    }

    console.log('  → getQuestions');
    const questions = await adapter.getQuestions(page);
    console.log(`      ${questions.length} custom question(s)`);

    const answers = {};
    for (const q of questions) {
      console.log(`  → writeAnswer: "${q.label.slice(0, 70)}"`);
      const answer = await writeAnswer({ jobDescription, resume, profile, question: q.label });
      answers[q.label] = answer;
      await adapter.fillAnswer(page, q, answer);
    }

    // 4. Validate
    const valid = await validateForm(page);
    if (!valid) {
      const screenshot = await saveScreenshot(page, `${platform}-needs-manual`);
      logResult({
        url, platform, status: 'needs-manual', answers, screenshot,
        error: 'Validation failed: required field empty or no resume attached',
      });
      console.log('  → needs-manual (validation failed)');
      continue;
    }

    // 5. Screenshot filled form
    const filledShot = await saveScreenshot(page, `${platform}-filled`);
    console.log(`  → screenshot: ${filledShot}`);

    // 6. Review-mode pause
    let skipped = false;
    if (REVIEW_MODE) {
      const choice = await promptReview();
      if (choice === 'skip') {
        logResult({ url, platform, status: 'needs-manual', answers, screenshot: filledShot, error: 'Skipped by reviewer' });
        console.log('  → skipped');
        skipped = true;
      }
    }
    if (skipped) continue;

    // 7. Submit or leave filled
    let status;
    let finalShot = filledShot;
    if (AUTO_SUBMIT) {
      const submitBtn = await adapter.submit(page);
      await submitBtn.click();
      await page.waitForTimeout(3_000);
      finalShot = await saveScreenshot(page, `${platform}-submitted`);
      status = 'submitted';
    } else {
      status = 'filled';
    }

    logResult({ url, platform, status, answers, screenshot: finalShot });
    console.log(`  → ${status}`);

  } catch (err) {
    const status = err.needsManual ? 'needs-manual' : 'failed';
    let screenshot;
    try { screenshot = await saveScreenshot(page, `${platform}-${status}`); } catch { /* ignore */ }
    logResult({ url, platform, status, error: err.message, screenshot });
    console.error(`  → ${status}: ${err.message}`);
  }

  // 8. Jitter between jobs (skip after last)
  if (i < jobs.length - 1) {
    const delay = jitter(30_000, 90_000);
    console.log(`\n  ↷ waiting ${Math.round(delay / 1_000)}s before next job…`);
    await page.waitForTimeout(delay);
  }
}

// --- Summary ---

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RUN COMPLETE');

let results = [];
try { results = JSON.parse(fs.readFileSync('./results.json', 'utf8')); } catch { /* fresh run */ }

const counts = { filled: 0, submitted: 0, 'needs-manual': 0, failed: 0 };
for (const r of results) {
  if (r.status in counts) counts[r.status]++;
}

console.log(`  filled:       ${counts.filled}`);
console.log(`  submitted:    ${counts.submitted}`);
console.log(`  needs-manual: ${counts['needs-manual']}`);
console.log(`  failed:       ${counts.failed}`);
console.log(`  screenshots:  ${path.resolve('./screenshots')}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await close();
