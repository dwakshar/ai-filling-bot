const MODEL = 'claude-sonnet-4-6';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'writeAnswer') {
    callClaude(msg)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }
});

async function callClaude({ apiKey, profile, resume, jobDescription, question }) {
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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [
        {
          role: 'user',
          content: `JOB DESCRIPTION:\n${jobDescription || '(not provided)'}\n\nQUESTION:\n${question}\n\nWrite the answer now.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return { answer: data.content[0].text.trim() };
}
