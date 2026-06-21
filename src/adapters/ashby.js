import { Adapter } from './base.js';

const ASHBY_RE = /jobs\.ashbyhq\.com\//;

// Ashby's system field names across form versions
const STANDARD_NAMES = new Set([
  '_systemfield_name', '_systemfield_email', '_systemfield_phone',
  '_systemfield_linkedin_url', '_systemfield_github', '_systemfield_website',
  'name', 'email', 'phone',
]);

const STANDARD_LABELS = [
  'full name', 'first name', 'last name', 'name', 'email', 'phone',
  'linkedin', 'github', 'portfolio', 'website', 'resume', 'cv', 'cover letter',
];

export class AshbyAdapter extends Adapter {
  static matches(url) {
    return ASHBY_RE.test(url);
  }

  async getJobDescription(page) {
    const selectors = [
      '[class*="ashby-job-posting-description"]',
      '[class*="jobDescription"]',
      '[class*="job-description"]',
      '[data-testid="job-description"]',
      'main [class*="description"]',
    ];
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) === 0) continue;
        const text = (await el.innerText()).trim();
        if (text.length > 50) return text;
      } catch { /* try next */ }
    }
    // Broad fallback: grab main content
    try {
      const main = page.locator('main, [role="main"]').first();
      if ((await main.count()) > 0) {
        const text = (await main.innerText()).trim();
        if (text.length > 50) return text;
      }
    } catch { /* ignore */ }
    return '';
  }

  async fillBasics(page, profile) {
    await page
      .waitForSelector('form', { timeout: 15000 })
      .catch(() => {});

    const fullName = `${profile.firstName} ${profile.lastName}`;

    // Try combined name field first, then split
    const nameFilled = await this.#tryFill(page, [
      'input[name="_systemfield_name"]',
      'input[aria-label*="full name" i]',
      'input[placeholder*="full name" i]',
      'input[autocomplete="name"]',
    ], fullName);

    if (!nameFilled) {
      await this.#tryFill(page, [
        'input[name*="first" i]',
        'input[aria-label*="first name" i]',
        'input[placeholder*="first name" i]',
        'input[autocomplete="given-name"]',
      ], profile.firstName);
      await this.#tryFill(page, [
        'input[name*="last" i]',
        'input[aria-label*="last name" i]',
        'input[placeholder*="last name" i]',
        'input[autocomplete="family-name"]',
      ], profile.lastName);
    }

    await this.#tryFill(page, [
      'input[name="_systemfield_email"]',
      'input[type="email"]',
      'input[aria-label*="email" i]',
      'input[placeholder*="email" i]',
    ], profile.email);

    await this.#tryFill(page, [
      'input[name="_systemfield_phone"]',
      'input[type="tel"]',
      'input[aria-label*="phone" i]',
      'input[placeholder*="phone" i]',
    ], profile.phone);

    if (profile.linkedin) {
      await this.#tryFill(page, [
        'input[name="_systemfield_linkedin_url"]',
        'input[name*="linkedin" i]',
        'input[aria-label*="linkedin" i]',
        'input[placeholder*="linkedin" i]',
      ], profile.linkedin);
    }

    if (profile.github) {
      await this.#tryFill(page, [
        'input[name="_systemfield_github"]',
        'input[name*="github" i]',
        'input[aria-label*="github" i]',
        'input[placeholder*="github" i]',
      ], profile.github);
    }

    const portfolio = profile.portfolio || profile.website;
    if (portfolio) {
      await this.#tryFill(page, [
        'input[name="_systemfield_website"]',
        'input[name*="portfolio" i]',
        'input[name*="website" i]',
        'input[aria-label*="portfolio" i]',
        'input[aria-label*="website" i]',
        'input[placeholder*="portfolio" i]',
        'input[placeholder*="website" i]',
        'input[placeholder*="personal site" i]',
      ], portfolio);
    }
  }

  async uploadResume(page, pdfPath) {
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      console.warn('[Ashby] No file input found — skipping resume upload');
      return;
    }
    await fileInput.setInputFiles(pdfPath);
    await page.waitForTimeout(2000);
    // Dismiss autofill-from-resume dialog if it appears
    const skipBtn = page
      .locator('button:has-text("Skip"), button:has-text("No thanks"), button:has-text("Dismiss"), button:has-text("Close")')
      .first();
    if ((await skipBtn.count()) > 0 && (await skipBtn.isVisible().catch(() => false))) {
      await skipBtn.click();
    }
  }

  async getQuestions(page) {
    await page.waitForSelector('form', { timeout: 10000 }).catch(() => {});
    const questions = [];

    const candidates = await page
      .locator('textarea, input[type="text"], input[type="url"], input[type="number"]')
      .all();

    for (const el of candidates) {
      const name = (await el.getAttribute('name')) ?? '';
      if (STANDARD_NAMES.has(name)) continue;

      // Skip system fields by name prefix
      if (name.startsWith('_systemfield_')) continue;

      if (!(await el.isVisible().catch(() => false))) continue;

      const id = await el.getAttribute('id');
      const label = await this.#getLabelFor(page, el, id);
      if (!label) continue;

      const ll = label.toLowerCase();
      if (STANDARD_LABELS.some(s => ll.includes(s))) continue;

      const selector = id ? `#${id}` : name ? `[name="${name}"]` : null;
      if (!selector) continue;

      const tag = await el.evaluate(n => n.tagName.toLowerCase());
      questions.push({ selector, label, type: tag === 'textarea' ? 'textarea' : 'text' });
    }

    return questions;
  }

  async fillAnswer(page, question, answer) {
    const selector = typeof question === 'string' ? question : question.selector;
    const field = page.locator(selector).first();
    await field.waitFor({ timeout: 5000 });
    await field.fill(answer);
  }

  async submit(page) {
    return page
      .locator(
        'button[type="submit"], ' +
        'button:has-text("Submit Application"), ' +
        'button:has-text("Submit")',
      )
      .first();
  }

  // --- private helpers ---

  async #tryFill(page, selectors, value) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        if (!(await loc.isVisible({ timeout: 500 }).catch(() => false))) continue;
        await loc.fill(value);
        return true;
      } catch { /* try next */ }
    }
    return false;
  }

  async #getLabelFor(page, el, id) {
    if (id) {
      const lbl = page.locator(`label[for="${id}"]`).first();
      if ((await lbl.count()) > 0) return (await lbl.innerText()).trim();
    }
    // Check aria-labelledby
    const labelledBy = await el.getAttribute('aria-labelledby').catch(() => null);
    if (labelledBy) {
      const lbl = page.locator(`#${labelledBy}`).first();
      if ((await lbl.count()) > 0) return (await lbl.innerText()).trim();
    }
    const fromDOM = await el.evaluate(node => {
      const container = node.closest('[class*="field"], [class*="question"], fieldset, .form-group, [class*="FormField"]');
      if (!container) return '';
      const lbl = container.querySelector('label, legend, [class*="label"], [class*="Label"]');
      return lbl ? lbl.innerText.trim() : '';
    });
    if (fromDOM) return fromDOM;
    return (
      (await el.getAttribute('aria-label').catch(() => null)) ??
      (await el.getAttribute('placeholder').catch(() => null)) ??
      ''
    );
  }
}
