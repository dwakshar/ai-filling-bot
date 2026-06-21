// Guard against double-injection (manifest auto-inject + popup scripting.executeScript)
if (!window.__aiJobFillerLoaded) {
  window.__aiJobFillerLoaded = true;

  // ─── DOM helpers ─────────────────────────────────────────────────────────────

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function fillField(el, value) {
    try {
      if (el.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter ? setter.call(el, value) : (el.value = value);
      } else {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter ? setter.call(el, value) : (el.value = value);
      }
    } catch {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function tryFill(selectors, value) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (!el || !isVisible(el)) continue;
        fillField(el, value);
        return true;
      } catch { /* try next */ }
    }
    return false;
  }

  function getLabelFor(el) {
    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) return lbl.innerText.trim();
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const lbl = document.getElementById(labelledBy);
      if (lbl) return lbl.innerText.trim();
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const container = el.closest(
      '.field, [class*="question"], [class*="field"], .application-field, fieldset, .form-group, [class*="FormField"]'
    );
    if (container) {
      const lbl = container.querySelector(
        'label, .label, [class*="label"], legend, h3, h4, [class*="Label"], p[data-qa="custom-question-text"], .application-question-text'
      );
      if (lbl) return lbl.innerText.trim();
    }
    return el.getAttribute('placeholder') || '';
  }

  // ─── Platform detection ───────────────────────────────────────────────────────

  function detectPlatform(url) {
    if (/greenhouse\.io/.test(url))      return 'greenhouse';
    if (/lever\.co/.test(url))           return 'lever';
    if (/ashbyhq\.com/.test(url))        return 'ashby';
    if (/wellfound\.com/.test(url))      return 'wellfound';
    if (/instahyre\.com/.test(url))      return 'instahyre';
    if (/naukri\.com/.test(url))         return 'naukri';
    if (/simplyhired\.com/.test(url))    return 'simplyhired';
    if (/jobspresso\.co/.test(url))      return 'jobspresso';
    if (/stackoverflow\.com/.test(url))  return 'stackoverflow';
    if (/indeed\.com/.test(url))         return 'indeed';
    if (/glassdoor\.com/.test(url))      return 'glassdoor';
    if (/nodesk\.co/.test(url))          return 'nodesk';
    if (/remotive\.com/.test(url))       return 'remotive';
    if (/remote4me\.com/.test(url))      return 'remote4me';
    if (/pangian\.com/.test(url))        return 'pangian';
    if (/remotees\.com/.test(url))       return 'remotees';
    if (/remotehabits\.com/.test(url))   return 'remotehabits';
    if (/skipthechive\.com/.test(url))   return 'skipthechive';
    if (/europeremotely\.com/.test(url)) return 'europeremotely';
    if (/workingnomads\.com/.test(url))  return 'workingnomads';
    if (/virtualvocations\.com/.test(url)) return 'virtualvocations';
    if (/weworkremotely\.com/.test(url)) return 'weworkremotely';
    if (/flexjobs\.com/.test(url))       return 'flexjobs';
    return null;
  }

  // ─── Standard field exclusions per platform ───────────────────────────────────

  const GREENHOUSE_STD_IDS = new Set(['first_name', 'last_name', 'email', 'phone', 'resume', 'cover_letter']);
  const GREENHOUSE_STD_NAME_PARTS = ['first_name', 'last_name', '[email]', '[phone]', 'resume', 'cover_letter'];
  const LEVER_STD_NAMES = new Set(['name', 'email', 'phone', 'org', 'comments', 'urls[LinkedIn]', 'urls[Github]', 'urls[GitHub]', 'urls[Twitter]', 'urls[Portfolio]', 'urls[Other]']);
  const ASHBY_STD_NAMES = new Set(['_systemfield_name', '_systemfield_email', '_systemfield_phone', '_systemfield_linkedin_url', '_systemfield_github', '_systemfield_website', 'name', 'email', 'phone']);

  const GENERIC_STD_LABELS = ['name', 'email', 'phone', 'mobile', 'linkedin', 'resume', 'cv', 'cover letter', 'github', 'portfolio', 'website'];

  const STD_LABELS = {
    greenhouse:      ['first name', 'last name', 'email', 'phone number', 'phone', 'resume', 'cover letter', 'linkedin', 'github', 'portfolio', 'website'],
    lever:           ['full name', 'name', 'email', 'phone', 'company', 'current company', 'organization', 'linkedin', 'github', 'twitter', 'portfolio', 'website', 'resume', 'cover letter'],
    ashby:           ['full name', 'first name', 'last name', 'name', 'email', 'phone', 'linkedin', 'github', 'portfolio', 'website', 'resume', 'cv', 'cover letter'],
    wellfound:       ['name', 'email', 'phone', 'linkedin', 'resume', 'cv'],
    instahyre:       ['name', 'email', 'phone', 'mobile', 'resume', 'cv'],
    naukri:          ['name', 'email', 'phone', 'mobile', 'resume', 'cv', 'current ctc', 'expected ctc', 'notice period', 'experience'],
    simplyhired:     GENERIC_STD_LABELS,
    jobspresso:      GENERIC_STD_LABELS,
    stackoverflow:   GENERIC_STD_LABELS,
    indeed:          GENERIC_STD_LABELS,
    glassdoor:       GENERIC_STD_LABELS,
    nodesk:          GENERIC_STD_LABELS,
    remotive:        GENERIC_STD_LABELS,
    remote4me:       GENERIC_STD_LABELS,
    pangian:         GENERIC_STD_LABELS,
    remotees:        GENERIC_STD_LABELS,
    remotehabits:    GENERIC_STD_LABELS,
    skipthechive:    GENERIC_STD_LABELS,
    europeremotely:  GENERIC_STD_LABELS,
    workingnomads:   GENERIC_STD_LABELS,
    virtualvocations:GENERIC_STD_LABELS,
    weworkremotely:  GENERIC_STD_LABELS,
    flexjobs:        GENERIC_STD_LABELS,
  };

  // ─── fillBasics per platform ──────────────────────────────────────────────────

  function fillBasicsGreenhouse(profile) {
    tryFill(['#first_name', 'input[name="job_application[first_name]"]', 'input[autocomplete="given-name"]'], profile.firstName);
    tryFill(['#last_name', 'input[name="job_application[last_name]"]', 'input[autocomplete="family-name"]'], profile.lastName);
    tryFill(['#email', 'input[name="job_application[email]"]', 'input[type="email"]'], profile.email);
    tryFill(['#phone', 'input[name="job_application[phone]"]', 'input[type="tel"]'], profile.phone);
    if (profile.linkedin) tryFill(['input[name*="linkedin" i]', 'input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]'], profile.linkedin);
    if (profile.github)   tryFill(['input[name*="github" i]', 'input[id*="github" i]', 'input[placeholder*="github" i]'], profile.github);
    const portfolio = profile.portfolio || profile.website;
    if (portfolio) tryFill(['input[name="job_application[website]"]', 'input[name*="portfolio" i]', 'input[placeholder*="portfolio" i]', 'input[placeholder*="website" i]'], portfolio);
  }

  function fillBasicsLever(profile) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    tryFill(['input[name="name"]', 'input[placeholder*="full name" i]', 'input[autocomplete="name"]'], fullName);
    tryFill(['input[name="email"]', 'input[type="email"]'], profile.email);
    tryFill(['input[name="phone"]', 'input[type="tel"]'], profile.phone);
    if (profile.currentCompany) tryFill(['input[name="org"]'], profile.currentCompany);
    if (profile.linkedin) tryFill(['input[name="urls[LinkedIn]"]', 'input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]'], profile.linkedin);
    if (profile.github)   tryFill(['input[name="urls[Github]"]', 'input[name="urls[GitHub]"]', 'input[name*="github" i]', 'input[placeholder*="github" i]'], profile.github);
    const portfolio = profile.portfolio || profile.website;
    if (portfolio) tryFill(['input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]', 'input[placeholder*="portfolio" i]', 'input[placeholder*="website" i]'], portfolio);
  }

  function fillBasicsAshby(profile) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    const nameFilled = tryFill(['input[name="_systemfield_name"]', 'input[aria-label*="full name" i]', 'input[placeholder*="full name" i]', 'input[autocomplete="name"]'], fullName);
    if (!nameFilled) {
      tryFill(['input[name*="first" i]', 'input[aria-label*="first name" i]', 'input[autocomplete="given-name"]'], profile.firstName);
      tryFill(['input[name*="last" i]',  'input[aria-label*="last name" i]',  'input[autocomplete="family-name"]'], profile.lastName);
    }
    tryFill(['input[name="_systemfield_email"]', 'input[type="email"]', 'input[aria-label*="email" i]'], profile.email);
    tryFill(['input[name="_systemfield_phone"]', 'input[type="tel"]',   'input[aria-label*="phone" i]'], profile.phone);
    if (profile.linkedin) tryFill(['input[name="_systemfield_linkedin_url"]', 'input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]'], profile.linkedin);
    if (profile.github)   tryFill(['input[name="_systemfield_github"]', 'input[name*="github" i]'], profile.github);
    const portfolio = profile.portfolio || profile.website;
    if (portfolio) tryFill(['input[name="_systemfield_website"]', 'input[name*="portfolio" i]', 'input[name*="website" i]', 'input[placeholder*="website" i]'], portfolio);
  }

  function fillBasicsWellfound(profile) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    tryFill(['input[placeholder*="full name" i]', 'input[aria-label*="name" i]', 'input[name*="name" i]'], fullName);
    tryFill(['input[type="email"]', 'input[placeholder*="email" i]'], profile.email);
    tryFill(['input[type="tel"]',   'input[placeholder*="phone" i]'], profile.phone);
    if (profile.linkedin) tryFill(['input[placeholder*="linkedin" i]', 'input[aria-label*="linkedin" i]', 'input[name*="linkedin" i]'], profile.linkedin);
  }

  function fillBasicsInstahyre(profile) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    tryFill(['input[placeholder*="name" i]', 'input[aria-label*="name" i]', 'input[name*="name" i]', 'input[autocomplete="name"]'], fullName);
    tryFill(['input[type="email"]', 'input[placeholder*="email" i]'], profile.email);
    tryFill(['input[type="tel"]', 'input[placeholder*="phone" i]', 'input[placeholder*="mobile" i]'], profile.phone);
    if (profile.noticePeriod) tryFill(['input[placeholder*="notice" i]', 'input[name*="notice" i]'], profile.noticePeriod);
    if (profile.expectedSalary)  tryFill(['input[placeholder*="expected salary" i]', 'input[placeholder*="expected" i]'], String(profile.expectedSalary));
  }

  function fillBasicsNaukri(profile) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    tryFill(['input[placeholder*="name" i]', 'input[aria-label*="name" i]', 'input[name*="name" i]'], fullName);
    tryFill(['input[type="email"]', 'input[placeholder*="email" i]'], profile.email);
    tryFill(['input[type="tel"]', 'input[placeholder*="phone" i]', 'input[placeholder*="mobile" i]'], profile.phone);
    if (profile.noticePeriod) tryFill(['input[placeholder*="notice" i]', 'input[name*="notice" i]'], profile.noticePeriod);
    if (profile.expectedSalary)  tryFill(['input[placeholder*="expected salary" i]', 'input[placeholder*="expected ctc" i]'], String(profile.expectedSalary));
  }

  function fillBasicsGeneric(profile) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    const nameFilled = tryFill([
      'input[autocomplete="name"]',
      'input[placeholder*="full name" i]',
      'input[aria-label*="full name" i]',
    ], fullName);
    if (!nameFilled) {
      tryFill(['input[autocomplete="given-name"]', 'input[name*="first" i]', 'input[placeholder*="first name" i]'], profile.firstName);
      tryFill(['input[autocomplete="family-name"]', 'input[name*="last" i]',  'input[placeholder*="last name" i]'],  profile.lastName);
    }
    tryFill(['input[type="email"]', 'input[name*="email" i]', 'input[placeholder*="email" i]'], profile.email);
    tryFill(['input[type="tel"]', 'input[name*="phone" i]', 'input[placeholder*="phone" i]', 'input[placeholder*="mobile" i]'], profile.phone);
    if (profile.linkedin) tryFill(['input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]', 'input[aria-label*="linkedin" i]'], profile.linkedin);
    const portfolio = profile.portfolio || profile.website;
    if (portfolio) tryFill(['input[name*="portfolio" i]', 'input[placeholder*="portfolio" i]', 'input[name*="website" i]', 'input[placeholder*="website" i]'], portfolio);
  }

  const FILL_BASICS = {
    greenhouse:      fillBasicsGreenhouse,
    lever:           fillBasicsLever,
    ashby:           fillBasicsAshby,
    wellfound:       fillBasicsWellfound,
    instahyre:       fillBasicsInstahyre,
    naukri:          fillBasicsNaukri,
    simplyhired:     fillBasicsGeneric,
    jobspresso:      fillBasicsGeneric,
    stackoverflow:   fillBasicsGeneric,
    indeed:          fillBasicsGeneric,
    glassdoor:       fillBasicsGeneric,
    nodesk:          fillBasicsGeneric,
    remotive:        fillBasicsGeneric,
    remote4me:       fillBasicsGeneric,
    pangian:         fillBasicsGeneric,
    remotees:        fillBasicsGeneric,
    remotehabits:    fillBasicsGeneric,
    skipthechive:    fillBasicsGeneric,
    europeremotely:  fillBasicsGeneric,
    workingnomads:   fillBasicsGeneric,
    virtualvocations:fillBasicsGeneric,
    weworkremotely:  fillBasicsGeneric,
    flexjobs:        fillBasicsGeneric,
  };

  // ─── getJobDescription ────────────────────────────────────────────────────────

  const GENERIC_JD_SELECTORS = [
    '.job-description', '[class*="job-description"]', '[class*="jobDescription"]',
    '.job-details', '[class*="job-details"]', 'article', 'main',
  ];

  const JD_SELECTORS = {
    greenhouse:      ['.job-description', '#content', '[class*="job-description"]', '.posting-description', '[data-ui="job-description"]'],
    lever:           ['.posting-description', '[data-qa="job-description"]', '.posting-body .content', '.section-wrapper .content'],
    ashby:           ['[class*="ashby-job-posting-description"]', '[class*="jobDescription"]', '[data-testid="job-description"]', 'main'],
    wellfound:       ['[class*="jobDescription"]', '[class*="job_description"]', '[data-test="job-description"]', '.job-description'],
    instahyre:       ['.job-description', '[class*="jobDescription"]', '[class*="job-desc"]', '.jd-content', '.description-content'],
    naukri:          ['.job-desc', '[class*="jobDescription"]', '.dang-inner-html', '.jd-desc', '[class*="description"]'],
    simplyhired:     GENERIC_JD_SELECTORS,
    jobspresso:      GENERIC_JD_SELECTORS,
    stackoverflow:   ['.job-details--content', '[class*="job-description"]', ...GENERIC_JD_SELECTORS],
    indeed:          ['.jobsearch-jobDescriptionText', '[class*="job-description"]', ...GENERIC_JD_SELECTORS],
    glassdoor:       ['[class*="JobDescription"]', '[class*="job-description"]', ...GENERIC_JD_SELECTORS],
    nodesk:          GENERIC_JD_SELECTORS,
    remotive:        ['.job-description', '[class*="description"]', ...GENERIC_JD_SELECTORS],
    remote4me:       GENERIC_JD_SELECTORS,
    pangian:         GENERIC_JD_SELECTORS,
    remotees:        GENERIC_JD_SELECTORS,
    remotehabits:    GENERIC_JD_SELECTORS,
    skipthechive:    GENERIC_JD_SELECTORS,
    europeremotely:  GENERIC_JD_SELECTORS,
    workingnomads:   GENERIC_JD_SELECTORS,
    virtualvocations:GENERIC_JD_SELECTORS,
    weworkremotely:  ['.listing-container', '[class*="job-description"]', ...GENERIC_JD_SELECTORS],
    flexjobs:        ['.description', '[class*="job-description"]', ...GENERIC_JD_SELECTORS],
  };

  function getJobDescription(platform) {
    for (const sel of (JD_SELECTORS[platform] || [])) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = el.innerText.trim();
      if (text.length > 50) return text;
    }
    return '';
  }

  // ─── getQuestions ─────────────────────────────────────────────────────────────

  function getQuestions(platform) {
    const stdLabels = STD_LABELS[platform] || [];
    const questions = [];

    // Lever: prefer .application-question containers
    if (platform === 'lever') {
      const containers = document.querySelectorAll('.application-question');
      if (containers.length > 0) {
        for (const container of containers) {
          const labelEl = container.querySelector('p[data-qa="custom-question-text"], .application-question-text, label');
          const label = labelEl?.innerText.trim() || '';
          if (!label || stdLabels.some(s => label.toLowerCase().includes(s))) continue;

          const textarea = container.querySelector('textarea');
          if (textarea && isVisible(textarea)) {
            const id = textarea.getAttribute('id');
            const name = textarea.getAttribute('name');
            const selector = id ? `#${CSS.escape(id)}` : name ? `[name="${name}"]` : null;
            if (selector) { questions.push({ selector, label, type: 'textarea' }); continue; }
          }
          const input = container.querySelector('input[type="text"], input[type="url"], input[type="number"]');
          if (input && isVisible(input)) {
            const id = input.getAttribute('id');
            const name = input.getAttribute('name') || '';
            if (LEVER_STD_NAMES.has(name)) continue;
            const selector = id ? `#${CSS.escape(id)}` : name ? `[name="${name}"]` : null;
            if (selector) questions.push({ selector, label, type: 'text' });
          }
        }
        return questions;
      }
    }

    // Generic scan
    const candidates = document.querySelectorAll('textarea, input[type="text"], input[type="url"], input[type="number"]');
    for (const el of candidates) {
      if (!isVisible(el)) continue;

      const id   = (el.getAttribute('id') || '').toLowerCase();
      const name = el.getAttribute('name') || '';

      if (platform === 'greenhouse') {
        if (GREENHOUSE_STD_IDS.has(id)) continue;
        if (GREENHOUSE_STD_NAME_PARTS.some(s => name.toLowerCase().includes(s))) continue;
      } else if (platform === 'lever') {
        if (LEVER_STD_NAMES.has(name)) continue;
      } else if (platform === 'ashby') {
        if (ASHBY_STD_NAMES.has(name) || name.startsWith('_systemfield_')) continue;
      }

      const label = getLabelFor(el);
      if (!label || stdLabels.some(s => label.toLowerCase().includes(s))) continue;

      const rawId = el.getAttribute('id');
      const selector = rawId ? `#${CSS.escape(rawId)}` : name ? `[name="${name}"]` : null;
      if (!selector) continue;

      questions.push({ selector, label, type: el.tagName === 'TEXTAREA' ? 'textarea' : 'text' });
    }

    return questions;
  }

  // ─── Status helper ────────────────────────────────────────────────────────────

  function postStatus(msg) {
    chrome.runtime.sendMessage({ action: 'status', msg }).catch(() => {});
  }

  // ─── Job meta scraper (best-effort) ──────────────────────────────────────────

  function scrapeJobMeta(platform) {
    const TITLE_SELS = {
      greenhouse: ['h1.app-title', 'h1[class*="title"]', '.job-title', 'h1'],
      lever:      ['h2[data-qa="posting-name"]', '.posting-headline h2', 'h2', 'h1'],
      ashby:      ['h1[class*="Title"]', 'h1[class*="title"]', 'h1'],
      wellfound:  ['h1[class*="title"]', 'h1[class*="Title"]', 'h1'],
      indeed:     ['h1[class*="jobTitle"]', 'h1'],
      glassdoor:  ['h1[class*="title"]', 'h1'],
    };
    const COMPANY_SELS = {
      greenhouse: ['.company-name', '[class*="company-name"]'],
      lever:      ['.main-header-flex a', '[class*="company"]'],
      ashby:      ['[class*="CompanyName"]', '[class*="company"]'],
      wellfound:  ['[class*="startup-name"]', '[class*="company"]'],
      indeed:     ['[data-testid="inlineHeader-companyName"]', '[class*="companyName"]'],
      glassdoor:  ['[class*="employerName"]', '[class*="companyName"]'],
    };

    let title = '';
    for (const sel of (TITLE_SELS[platform] || ['h1'])) {
      const text = document.querySelector(sel)?.innerText?.trim();
      if (text) { title = text; break; }
    }

    let company = '';
    for (const sel of (COMPANY_SELS[platform] || [])) {
      const text = document.querySelector(sel)?.innerText?.trim();
      if (text) { company = text; break; }
    }
    if (!company) company = document.querySelector('meta[property="og:site_name"]')?.content?.trim() || '';
    if (!company) company = location.hostname.replace(/^www\./, '');
    if (!title)   title   = document.title;

    return { company, title };
  }

  // ─── History log ─────────────────────────────────────────────────────────────

  async function appendHistory(entry) {
    const data = await chrome.storage.local.get('history');
    const history = data.history || [];
    history.unshift(entry);
    if (history.length > 500) history.length = 500;
    await chrome.storage.local.set({ history });
  }

  // ─── Main orchestrator ────────────────────────────────────────────────────────

  async function doFill({ profile, resume, apiKey }) {
    const platform = detectPlatform(location.href);
    if (!platform) {
      appendHistory({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        company: location.hostname.replace(/^www\./, ''),
        title: document.title,
        url: location.href,
        platform: 'unknown',
        status: 'error',
        answered: 0,
        total: 0,
      }).catch(() => {});
      throw new Error(`No adapter for ${location.hostname}`);
    }

    postStatus(`Platform: ${platform}`);

    const meta = scrapeJobMeta(platform);

    FILL_BASICS[platform]?.(profile);
    postStatus('Basic fields filled');

    const jobDescription = getJobDescription(platform);
    const questions = getQuestions(platform);
    postStatus(`${questions.length} custom question(s) found`);

    let errCount = 0;
    for (const q of questions) {
      postStatus(`AI writing: "${q.label.slice(0, 55)}…"`);
      const result = await chrome.runtime.sendMessage({
        action: 'writeAnswer',
        apiKey,
        profile,
        resume,
        jobDescription,
        question: q.label,
      });

      if (result?.error) {
        postStatus(`Error: ${result.error}`);
        errCount++;
        continue;
      }

      const el = document.querySelector(q.selector);
      if (!el) { postStatus(`Field not found: ${q.selector}`); errCount++; continue; }
      fillField(el, result.answer);
      postStatus(`Filled: "${q.label.slice(0, 40)}"`);
    }

    postStatus('Done — review the form before submitting.');

    appendHistory({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      company: meta.company,
      title: meta.title,
      url: location.href,
      platform,
      status: errCount > 0 ? 'partial' : 'filled',
      answered: questions.length - errCount,
      total: questions.length,
    }).catch(() => {});

    return { platform, questionCount: questions.length };
  }

  // ─── Message listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'fill') {
      doFill(msg)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(err  => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  });
}
