import { Adapter } from './base.js';

const BOARDS_RE = /^https?:\/\/(boards|job-boards)\.greenhouse\.io\//;
const DOMAIN_RE = /greenhouse\.io/;

const STANDARD_IDS = new Set([
  'first_name', 'last_name', 'email', 'phone', 'resume', 'cover_letter',
]);
const STANDARD_NAME_PARTS = [
  'first_name', 'last_name', '[email]', '[phone]', 'resume', 'cover_letter',
];
const STANDARD_LABELS = [
  'first name', 'last name', 'email', 'phone number', 'phone', 'resume', 'cover letter',
];

export class GreenhouseAdapter extends Adapter {
  static matches(url) {
    return BOARDS_RE.test(url) || DOMAIN_RE.test(url);
  }

  // DOM-based detection for embedded iframes — call from pickAdapter when URL alone is ambiguous
  static async matchesPage(page) {
    try {
      return (await page.locator('#application-form, .boards-greenhouse, [data-greenhouse-job-id]').count()) > 0;
    } catch {
      return false;
    }
  }

  async getJobDescription(page) {
    const selectors = [
      '.job-description',
      '#content',
      '[class*="job-description"]',
      '.posting-description',
      '[data-ui="job-description"]',
      '.section-wrapper',
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
    await page
      .waitForSelector('#application-form, form[action*="application"]', { timeout: 15000 })
      .catch(() => {});

    await this.#tryFill(page, [
      '#first_name',
      'input[name="job_application[first_name]"]',
      'input[autocomplete="given-name"]',
    ], profile.firstName);

    await this.#tryFill(page, [
      '#last_name',
      'input[name="job_application[last_name]"]',
      'input[autocomplete="family-name"]',
    ], profile.lastName);

    await this.#tryFill(page, [
      '#email',
      'input[name="job_application[email]"]',
      'input[type="email"]',
    ], profile.email);

    await this.#tryFill(page, [
      '#phone',
      'input[name="job_application[phone]"]',
      'input[type="tel"]',
    ], profile.phone);

    if (profile.linkedin) {
      const filled = await this.#fillByLabel(page, ['linkedin'], profile.linkedin);
      if (!filled) {
        await this.#tryFill(page, [
          'input[name*="linkedin" i]',
          'input[id*="linkedin" i]',
          'input[placeholder*="linkedin" i]',
        ], profile.linkedin);
      }
    }

    if (profile.github) {
      const filled = await this.#fillByLabel(page, ['github'], profile.github);
      if (!filled) {
        await this.#tryFill(page, [
          'input[name*="github" i]',
          'input[id*="github" i]',
          'input[placeholder*="github" i]',
        ], profile.github);
      }
    }

    const portfolioUrl = profile.portfolio || profile.website;
    if (portfolioUrl) {
      const filled = await this.#fillByLabel(page, ['portfolio', 'website', 'personal site'], portfolioUrl);
      if (!filled) {
        await this.#tryFill(page, [
          'input[name="job_application[website]"]',
          'input[name*="portfolio" i]',
          'input[id*="portfolio" i]',
          'input[placeholder*="portfolio" i]',
          'input[placeholder*="website" i]',
        ], portfolioUrl);
      }
    }
  }

  async uploadResume(page, pdfPath) {
    // Greenhouse hides the real <input type="file"> behind an "Attach" button;
    // setInputFiles works directly on the hidden input without clicking the button.
    const fileInput = page
      .locator('input[type="file"][name*="resume" i], input[type="file"]#resume, input[type="file"]')
      .first();

    if ((await fileInput.count()) === 0) {
      console.warn('[Greenhouse] No file input found — skipping resume upload');
      return;
    }

    await fileInput.setInputFiles(pdfPath);

    // Greenhouse sometimes offers "Autofill from resume?" — dismiss it
    await page.waitForTimeout(2000);
    const skipBtn = page
      .locator('button:has-text("Skip"), button:has-text("No thanks"), button:has-text("Close"), [aria-label*="dismiss" i]')
      .first();
    if ((await skipBtn.count()) > 0 && (await skipBtn.isVisible().catch(() => false))) {
      await skipBtn.click();
    }
  }

  async getQuestions(page) {
    await page
      .waitForSelector('#application-form, form', { timeout: 10000 })
      .catch(() => {});

    const questions = [];

    const candidates = await page
      .locator('textarea, input[type="text"], input[type="url"], input[type="number"]')
      .all();

    for (const el of candidates) {
      const id = ((await el.getAttribute('id')) ?? '').toLowerCase();
      const name = ((await el.getAttribute('name')) ?? '').toLowerCase();

      if (STANDARD_IDS.has(id)) continue;
      if (STANDARD_NAME_PARTS.some(s => name.includes(s))) continue;
      if (!(await el.isVisible().catch(() => false))) continue;

      const label = await this.#getLabelFor(page, el, id);
      if (!label) continue;

      const ll = label.toLowerCase();
      if (STANDARD_LABELS.some(s => ll.includes(s))) continue;

      const rawId = await el.getAttribute('id');
      const rawName = await el.getAttribute('name');
      const selector = rawId ? `#${rawId}` : rawName ? `[name="${rawName}"]` : null;
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

  // Returns the submit button locator without clicking it.
  async submit(page) {
    return page
      .locator(
        'button[type="submit"], input[type="submit"], ' +
        'button:has-text("Submit Application"), button:has-text("Submit")',
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
      } catch { /* try next selector */ }
    }
    return false;
  }

  async #fillByLabel(page, keywords, value) {
    const labels = await page.locator('label').all();
    for (const lbl of labels) {
      const text = (await lbl.innerText()).toLowerCase();
      if (!keywords.some(kw => text.includes(kw))) continue;

      // Prefer label[for=id]
      const forAttr = await lbl.getAttribute('for');
      if (forAttr) {
        const inp = page.locator(`#${forAttr}`).first();
        if ((await inp.count()) > 0 && (await inp.isVisible().catch(() => false))) {
          await inp.fill(value);
          return true;
        }
      }

      // Fall back to an input/textarea inside the label's parent container
      const parent = lbl.locator('xpath=..');
      const inp = parent.locator('input[type="text"], input[type="url"], textarea').first();
      if ((await inp.count()) > 0 && (await inp.isVisible().catch(() => false))) {
        await inp.fill(value);
        return true;
      }
    }
    return false;
  }

  async #getLabelFor(page, el, lowercaseId) {
    // 1. Explicit label[for=id]
    if (lowercaseId) {
      const lbl = page.locator(`label[for="${lowercaseId}"]`).first();
      if ((await lbl.count()) > 0) return (await lbl.innerText()).trim();
    }

    // 2. Nearest ancestor container that has a label/heading
    const fromDOM = await el.evaluate(node => {
      const container = node.closest(
        '.field, [class*="question"], [class*="field"], .application-field, fieldset',
      );
      if (!container) return '';
      const lbl = container.querySelector('label, .label, [class*="label"], legend, h3, h4');
      return lbl ? lbl.innerText.trim() : '';
    });
    if (fromDOM) return fromDOM;

    // 3. Placeholder as last resort
    return (await el.getAttribute('placeholder')) ?? '';
  }
}
