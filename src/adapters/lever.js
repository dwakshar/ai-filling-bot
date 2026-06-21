import { Adapter } from './base.js';

const LEVER_RE = /jobs\.lever\.co\//;

// Lever's built-in field names — skip in getQuestions
const STANDARD_NAMES = new Set([
  'name', 'email', 'phone', 'org', 'comments',
  'urls[LinkedIn]', 'urls[Github]', 'urls[GitHub]',
  'urls[Twitter]', 'urls[Portfolio]', 'urls[Other]',
]);

const STANDARD_LABELS = [
  'full name', 'name', 'email', 'phone', 'company', 'current company',
  'organization', 'linkedin', 'github', 'twitter', 'portfolio', 'website',
  'resume', 'cover letter',
];

export class LeverAdapter extends Adapter {
  static matches(url) {
    return LEVER_RE.test(url);
  }

  async getJobDescription(page) {
    const selectors = [
      '.posting-description',
      '[data-qa="job-description"]',
      '.posting-body .content',
      '.section-wrapper .content',
    ];
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) === 0) continue;
        const text = (await el.innerText()).trim();
        if (text.length > 50) return text;
      } catch { /* try next */ }
    }
    return '';
  }

  async fillBasics(page, profile) {
    await this.#ensureApplyPage(page);
    await page
      .waitForSelector('form, .application-form', { timeout: 15000 })
      .catch(() => {});

    // Lever uses a single "full name" field
    const fullName = `${profile.firstName} ${profile.lastName}`;
    await this.#tryFill(page, [
      'input[name="name"]',
      'input[placeholder*="full name" i]',
      'input[autocomplete="name"]',
    ], fullName);

    await this.#tryFill(page, [
      'input[name="email"]',
      'input[type="email"]',
    ], profile.email);

    await this.#tryFill(page, [
      'input[name="phone"]',
      'input[type="tel"]',
    ], profile.phone);

    if (profile.currentCompany) {
      await this.#tryFill(page, ['input[name="org"]'], profile.currentCompany);
    }

    if (profile.linkedin) {
      await this.#tryFill(page, [
        'input[name="urls[LinkedIn]"]',
        'input[name*="linkedin" i]',
        'input[placeholder*="linkedin" i]',
      ], profile.linkedin);
    }

    if (profile.github) {
      await this.#tryFill(page, [
        'input[name="urls[Github]"]',
        'input[name="urls[GitHub]"]',
        'input[name*="github" i]',
        'input[placeholder*="github" i]',
      ], profile.github);
    }

    const portfolio = profile.portfolio || profile.website;
    if (portfolio) {
      await this.#tryFill(page, [
        'input[name="urls[Portfolio]"]',
        'input[name="urls[Other]"]',
        'input[name*="portfolio" i]',
        'input[placeholder*="portfolio" i]',
        'input[placeholder*="website" i]',
      ], portfolio);
    }
  }

  async uploadResume(page, pdfPath) {
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      console.warn('[Lever] No file input found — skipping resume upload');
      return;
    }
    await fileInput.setInputFiles(pdfPath);
    await page.waitForTimeout(1500);
  }

  async getQuestions(page) {
    await page
      .waitForSelector('form, .application-form', { timeout: 10000 })
      .catch(() => {});

    const questions = [];

    // Primary: Lever wraps each custom question in .application-question
    const containers = await page.locator('.application-question').all();
    for (const container of containers) {
      const labelEl = container
        .locator('p[data-qa="custom-question-text"], .application-question-text, label')
        .first();
      const label = (await labelEl.innerText().catch(() => '')).trim();
      if (!label) continue;

      const ll = label.toLowerCase();
      if (STANDARD_LABELS.some(s => ll.includes(s))) continue;

      const textarea = container.locator('textarea').first();
      if ((await textarea.count()) > 0 && (await textarea.isVisible().catch(() => false))) {
        const id = await textarea.getAttribute('id');
        const name = await textarea.getAttribute('name');
        const selector = id ? `#${id}` : name ? `[name="${name}"]` : null;
        if (selector) { questions.push({ selector, label, type: 'textarea' }); continue; }
      }

      const input = container
        .locator('input[type="text"], input[type="url"], input[type="number"]')
        .first();
      if ((await input.count()) > 0 && (await input.isVisible().catch(() => false))) {
        const id = await input.getAttribute('id');
        const name = await input.getAttribute('name');
        if (STANDARD_NAMES.has(name ?? '')) continue;
        const selector = id ? `#${id}` : name ? `[name="${name}"]` : null;
        if (selector) questions.push({ selector, label, type: 'text' });
      }
    }

    // Fallback: scan all visible fields not in STANDARD_NAMES
    if (questions.length === 0) {
      const candidates = await page
        .locator('textarea, input[type="text"], input[type="url"]')
        .all();
      for (const el of candidates) {
        const name = (await el.getAttribute('name')) ?? '';
        if (STANDARD_NAMES.has(name)) continue;
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
        'button[type="submit"], button[data-qa="btn-submit"], ' +
        'button:has-text("Submit Application"), button:has-text("Submit")',
      )
      .first();
  }

  // --- private helpers ---

  async #ensureApplyPage(page) {
    const url = page.url();
    if (url.includes('/apply')) return;
    const applyBtn = page
      .locator('a[href*="/apply"], button:has-text("Apply for this job"), a:has-text("Apply for this job")')
      .first();
    if ((await applyBtn.count()) > 0) {
      await applyBtn.click();
      await page.waitForURL('**/apply**', { timeout: 10000 }).catch(() => {});
    }
  }

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
    const fromDOM = await el.evaluate(node => {
      const container = node.closest('.application-question, .field, fieldset, [class*="question"]');
      if (!container) return '';
      const lbl = container.querySelector('p.application-question-text, label, legend');
      return lbl ? lbl.innerText.trim() : '';
    });
    if (fromDOM) return fromDOM;
    return (await el.getAttribute('placeholder')) ?? '';
  }
}
