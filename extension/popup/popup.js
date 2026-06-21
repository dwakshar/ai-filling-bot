const fillBtn    = document.getElementById('fillBtn');
const platformEl = document.getElementById('platform');
const logEl      = document.getElementById('log');

const PLATFORM_NAMES = {
  'greenhouse.io':       'Greenhouse',
  'lever.co':            'Lever',
  'ashbyhq.com':         'Ashby',
  'wellfound.com':       'Wellfound',
  'instahyre.com':       'Instahyre',
  'naukri.com':          'Naukri',
  'simplyhired.com':     'SimplyHired',
  'jobspresso.co':       'Jobspresso',
  'stackoverflow.com':   'Stack Overflow Jobs',
  'indeed.com':          'Indeed',
  'glassdoor.com':       'Glassdoor',
  'nodesk.co':           'NoDesk',
  'remotive.com':        'Remotive',
  'remote4me.com':       'Remote4Me',
  'pangian.com':         'Pangian',
  'remotees.com':        'Remotees',
  'remotehabits.com':    'RemoteHabits',
  'skipthechive.com':    'Skip The Drive',
  'europeremotely.com':  'Europe Remotely',
  'workingnomads.com':   'Working Nomads',
  'virtualvocations.com':'Virtual Vocations',
  'weworkremotely.com':  'We Work Remotely',
  'flexjobs.com':        'FlexJobs',
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

// ─── History ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  const recent = history.slice(0, 20);
  if (recent.length === 0) {
    list.innerHTML = '<div class="hist-empty">No history yet.</div>';
    return;
  }
  list.innerHTML = recent.map(e => {
    const label = (e.company || new URL(e.url).hostname).slice(0, 28);
    return `<div class="hist-row">
      <span class="hist-date">${formatDate(e.timestamp)}</span>
      <span class="hist-company" title="${e.title || ''}">${label}</span>
      <span class="hist-status ${e.status}">${e.status}</span>
    </div>`;
  }).join('');
}

async function loadHistory() {
  const data = await chrome.storage.local.get('history');
  renderHistory(data.history || []);
}

loadHistory();

document.getElementById('exportBtn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get('history');
  const history = data.history || [];
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `job-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove('history');
  renderHistory([]);
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
