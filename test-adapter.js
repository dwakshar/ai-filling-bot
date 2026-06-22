import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import { launch, close } from './src/browser.js';
import { pickAdapter } from './src/adapters/index.js';
import { writeAnswer } from './src/ai.js';
import { saveScreenshot } from './src/state.js';

const profile = JSON.parse(fs.readFileSync('./config/profile.json', 'utf8'));
const resume = fs.readFileSync('./config/resume.txt', 'utf8');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node test-adapter.js <greenhouse-url>');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set in .env.local');
  process.exit(1);
}

const { page } = await launch();

try {
  console.log(`\nNavigating to ${url} ...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const adapter = pickAdapter(url);
  if (!adapter) {
    console.error('No adapter matched this URL.');
    process.exit(1);
  }
  console.log(`Adapter: ${adapter.constructor.name}`);

  const jobDescription = await adapter.getJobDescription(page);
  const preview = jobDescription.slice(0, 120).replace(/\n/g, ' ');
  console.log(`Job description: ${preview}...`);

  await adapter.fillBasics(page, profile);
  console.log('Basic fields filled.');

  const questions = await adapter.getQuestions(page);
  console.log(`\nDetected ${questions.length} free-text question(s):`);
  questions.forEach((q, i) => console.log(`  ${i + 1}. [${q.type}] ${q.label}`));

  for (const q of questions) {
    const questionText = q.type === 'text'
      ? `${q.label} (short answer — 1 to 2 sentences)`
      : q.label;

    process.stdout.write(`\nGenerating answer for: "${q.label}" ... `);
    const answer = await writeAnswer({ jobDescription, resume, profile, question: questionText });
    console.log('done');
    console.log(`  → ${answer}`);

    await adapter.fillAnswer(page, q, answer);
  }

  const shot = await saveScreenshot(page, 'greenhouse-filled');
  console.log(`\nScreenshot saved: ${shot}`);
  console.log('\nForm filled — review in the browser. Press Ctrl+C to close.');
} catch (err) {
  console.error('\nError:', err.message ?? err);
  await saveScreenshot(page, 'greenhouse-error').catch(() => {});
}

process.on('SIGINT', async () => {
  await close();
  process.exit(0);
});
