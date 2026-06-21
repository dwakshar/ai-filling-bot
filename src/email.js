// Cold-email drafter: reads contacts.csv, generates one .eml per contact → outbox/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { writeColdEmail } from './ai.js';

dotenv.config({ path: '.env.local' });

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function toEml({ contact, subject, body }) {
  const date = new Date().toUTCString();
  const lines = [
    `To: ${contact.name} <${contact.email}>`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ];
  return lines.join('\r\n');
}

function safeFilename(contact) {
  return `${contact.company}-${contact.name}`
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

async function main() {
  const contacts = parseCSV(
    fs.readFileSync(path.join(ROOT, 'data', 'contacts.csv'), 'utf8')
  ).filter(c => c.email);

  const resume = fs.readFileSync(path.join(ROOT, 'config', 'resume.txt'), 'utf8');
  const profile = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'profile.json'), 'utf8')
  );

  const outbox = path.join(ROOT, 'outbox');
  if (!fs.existsSync(outbox)) fs.mkdirSync(outbox);

  let count = 0;
  for (const contact of contacts) {
    process.stdout.write(`Drafting → ${contact.name} @ ${contact.company} … `);
    const { subject, body } = await writeColdEmail({ contact, resume, profile });
    const eml = toEml({ contact, subject, body });
    fs.writeFileSync(path.join(outbox, `${safeFilename(contact)}.eml`), eml, 'utf8');
    count++;
    console.log('done');
  }

  console.log(`\nDrafted ${count} email(s) → outbox/`);
}

main().catch(err => { console.error(err); process.exit(1); });
