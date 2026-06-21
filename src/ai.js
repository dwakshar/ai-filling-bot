import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

let _client;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function writeAnswer({ jobDescription, resume, profile, question }) {
  const client = getClient();

  const name = `${profile.firstName} ${profile.lastName}`;

  const system = `You are filling out a job application on behalf of ${name}.

Strict rules:
- Write in first person AS the candidate
- Use ONLY facts stated in the resume and profile — never invent experience, numbers, employers, technologies, or claims that aren't there
- If the resume is sparse or missing a fact, stay general rather than fabricating specifics
- Match the answer tightly to the job description and the exact question asked
- Sound like a real person: concise, direct, no buzzword soup, no filler like "I am thrilled to apply" or "I am passionate about"
- Never open with "I" as the literal first word — vary openers naturally
- Respect any length hint in the question: if it says "briefly" or "short answer", write 1–2 sentences; a textarea question without hints gets 3–5 sentences max
- Return only the answer text — no preamble, no quotation marks around the answer

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

RESUME:
${resume || '(no resume text provided)'}`;

  const user = `JOB DESCRIPTION:
${jobDescription || '(not provided)'}

QUESTION:
${question}

Write the answer now.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: user }],
  });

  return msg.content[0].text.trim();
}

export async function writeColdEmail({ contact, resume, profile }) {
  const client = getClient();

  const name = `${profile.firstName} ${profile.lastName}`;

  const system = `You are drafting a cold outreach email on behalf of ${name}.

Rules:
- Write in first person as the candidate; be direct and human
- Body is 3–5 sentences max — no padding, no multi-paragraph essays
- Reference the contact's company and role explicitly so it feels personal
- Tie ONE concrete, specific thing from the resume to why you're reaching out — pick a single project, skill, or outcome; do not list skills
- End with a single ask: either a referral for an open role OR a quick 15-min chat — not both
- Never open with "I" as the literal first word
- Absolutely no: "I hope this email finds you well", "I am passionate about", generic flattery
- Output ONLY valid JSON: {"subject": "...", "body": "..."}
- In the body, use \\n for line breaks (plain text, not HTML)

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

RESUME:
${resume || '(no resume text provided)'}`;

  const contactContext = [
    `Name: ${contact.name}`,
    `Company: ${contact.company}`,
    `Role: ${contact.role}`,
    contact.jobUrl ? `Job URL: ${contact.jobUrl}` : null,
    contact.notes ? `Notes: ${contact.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: `CONTACT:\n${contactContext}\n\nWrite the cold email now. Return JSON only.` }],
  });

  const raw = msg.content[0].text.trim();
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(json);
}
