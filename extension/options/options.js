const PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'linkedin', 'github', 'portfolio', 'currentCompany', 'noticePeriod', 'expectedSalary'];

async function load() {
  const data = await chrome.storage.local.get(['profile', 'resume', 'apiKey']);
  if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
  if (data.resume) document.getElementById('resume').value = data.resume;
  if (data.profile) {
    for (const f of PROFILE_FIELDS) {
      const el = document.getElementById(f);
      if (el && data.profile[f] != null) el.value = data.profile[f];
    }
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const profile = {};
  for (const f of PROFILE_FIELDS) {
    const val = document.getElementById(f).value.trim();
    if (val) profile[f] = val;
  }

  await chrome.storage.local.set({
    apiKey:  document.getElementById('apiKey').value.trim(),
    resume:  document.getElementById('resume').value.trim(),
    profile,
  });

  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Saved!';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

load();
