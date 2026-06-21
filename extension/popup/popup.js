const fillBtn    = document.getElementById('fillBtn');
const platformEl = document.getElementById('platform');
const logEl      = document.getElementById('log');

const PLATFORM_NAMES = {
  'greenhouse.io': 'Greenhouse',
  'lever.co':      'Lever',
  'ashbyhq.com':   'Ashby',
  'wellfound.com': 'Wellfound',
  'instahyre.com': 'Instahyre',
  'naukri.com':    'Naukri',
};

function log(msg, isErr = false) {
  const el = document.createElement('div');
  el.textContent = msg;
  if (isErr) el.className = 'err';
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
}

// Detect platform from active tab URL
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const url = tab?.url || '';
  let found = null;
  for (const [domain, name] of Object.entries(PLATFORM_NAMES)) {
    if (url.includes(domain)) { found = name; break; }
  }
  if (found) {
    platformEl.textContent = `Platform: ${found}`;
    platformEl.className = 'ok';
    fillBtn.disabled = false;
  } else {
    platformEl.textContent = 'Not a supported job site';
    platformEl.className = 'unsupported';
  }
});

// Relay status messages from content script into the log
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'status') log(msg.msg);
});

document.getElementById('optionsLink').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

fillBtn.addEventListener('click', async () => {
  fillBtn.disabled = true;
  logEl.innerHTML = '';

  const data = await chrome.storage.local.get(['profile', 'resume', 'apiKey']);

  if (!data.apiKey) {
    log('No API key — open Settings first.', true);
    fillBtn.disabled = false;
    return;
  }
  if (!data.profile?.firstName) {
    log('No profile saved — open Settings first.', true);
    fillBtn.disabled = false;
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Re-inject content script in case the page loaded before extension was installed
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/content.js'],
  }).catch(() => {});

  log('Starting…');

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action:  'fill',
      profile: data.profile,
      resume:  data.resume || '',
      apiKey:  data.apiKey,
    });

    if (response?.ok) {
      log(`Finished — ${response.questionCount} question(s) answered.`);
    } else {
      log(`Failed: ${response?.error || 'unknown error'}`, true);
    }
  } catch (err) {
    log(`Error: ${err.message}`, true);
  }

  fillBtn.disabled = false;
});
