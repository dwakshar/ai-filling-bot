const MODEL = 'gemini-2.0-flash';

// Statuses worth retrying; everything else (400, 401, 403…) is returned immediately
const RETRY_STATUSES = new Set([429, 500, 502, 503, 529]);
const MAX_ATTEMPTS   = 3;

async function fetchWithRetry(url, options) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // ~1 s, ~2 s — exponential base with small jitter
      const ms = 1000 * Math.pow(2, attempt - 1) + Math.random() * 200;
      await new Promise(r => setTimeout(r, ms));
    }
    let res;
    try {
      res = await fetch(url, options);
    } catch (netErr) {
      // Network failure (offline, DNS, connection refused) — always retry
      lastErr = netErr;
      continue;
    }
    // Return immediately for success OR non-retryable status codes (auth errors, bad request…)
    if (res.ok || !RETRY_STATUSES.has(res.status)) return res;
    lastErr = res;
  }
  if (lastErr instanceof Error) throw lastErr;
  return lastErr; // exhausted retries — return final bad Response so caller can read status
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'writeAnswer') {
    callGemini(msg)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }
});

async function callGemini({ apiKey, profile, resume, jobDescription, question }) {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: `JOB DESCRIPTION:\n${jobDescription || '(not provided)'}\n\nQUESTION:\n${question}\n\nWrite the answer now.` }],
        },
      ],
      generationConfig: { maxOutputTokens: 512 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return { answer: data.candidates[0].content.parts[0].text.trim() };
}
