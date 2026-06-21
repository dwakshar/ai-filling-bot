import { Adapter, NeedsManualError } from './base.js';

const INSTAHYRE_RE = /instahyre\.com\//;

const STANDARD_LABELS = [
  'name', 'email', 'phone', 'mobile', 'resume', 'cv',
];

export class InstahyreAdapter extends Adapter {
  static matches(url) {
    return INSTAHYRE_RE.test(url);
  }

  async getJobDescription(page) {
    const selectors = [
      '.job-description',
      '[class*="jobDescription"]',
      '[class*="job-desc"]',
      '.jd-content',
      '.description-content',
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
    await this.#openApplyForm(page);

    await page
      .waitForSelector('form, [class*="apply"], [class*="modal"]', { timeout: 10000 })
      .catch(() => {});

    const fullName = `${profile.firstName} ${profile.lastName}`;
    await this.#tryFill(page, [
      'input[placeholder*="name" i]',
      'input[aria-label*="name" i]',
      'input[name*="name" i]',
      'input[autocomplete="name"]',
    ], fullName);

    await this.#tryFill(page, [
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[aria-label*="email" i]',
    ], profile.email);

    await this.#tryFill(page, [
      'input[type="tel"]',
      'input[placeholder*="phone" i]',
      'input[placeholder*="mobile" i]',
      'input[aria-label*="phone" i]',
    ], profile.phone);

    // India-specific fields often present on Instahyre
    if (profile.noticePeriod) {
      await this.#tryFill(page, [
        'input[placeholder*="notice" i]',
        'input[aria-label*="notice" i]',
        'input[name*="notice" i]',
      ], profile.noticePeriod);
    }

    if (profile.expectedCtc) {
      await this.#tryFill(page, [
        'input[placeholder*="expected" i]',
        'input[placeholder*="ctc" i]',
        'input[aria-label*="expected" i]',
        'input[aria-label*="ctc" i]',
        'input[name*="expected" i]',
      ], String(profile.expectedCtc));
    }
  }

  async uploadResume(page, pdfPath) {
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      console.warn('[Instahyre] No file input found — skipping resume upload');
      return;
    }
    await fileInput.setInputFiles(pdfPath);
    await page.waitForTimeout(1500);
  }

  async getQuestions(page) {
    const questions = [];
    const candidates = await page
      .locator('textarea, input[type="text"], input[type="url"]')
      .all();

    for (const el of candidates) {
      if (!(await el.isVisible().catch(() => false))) continue;
      const id = await el.getAttribute('id');
      const label = await this.#getLabelFor(page, el, id);
      if (!label) continue;
      const ll = label.toLowerCase();
      if (STANDARD_LABELS.some(s => ll.includes(s))) continue;
      const name = (await el.getAttribute('name')) ?? '';
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
        'button:has-text("Apply"), ' +
        'button:has-text("Submit"), ' +
        'button:has-text("Send Application")',
      )
      .first();
  }

  // --- private helpers ---

  async #openApplyForm(page) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // If form is already visible (rare), skip
    const formVisible = await page
      .locator('form')
      .first()
      .isVisible()
      .catch(() => false);
    if (formVisible) return;

    const applyBtn = page
      .locator('button:has-text("Apply"), a:has-text("Apply"), [class*="apply-btn"], [class*="applyBtn"]')
      .first();

    if ((await applyBtn.count()) === 0) {
      throw new NeedsManualError('Instahyre: no Apply button found on page');
    }

    await applyBtn.click();
    await page.waitForTimeout(2000);

    // Detect login redirect
    const afterUrl = page.url();
    if (afterUrl.includes('/login') || afterUrl.includes('/signin')) {
      throw new NeedsManualError(
        'Instahyre: not logged in — log in once via the persistent browser session, then re-run',
      );
    }

    // Check for login modal
    const loginModal = await page
      .locator('[class*="login"], [class*="signin"], input[type="password"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (loginModal) {
      throw new NeedsManualError(
        'Instahyre: login modal appeared — log in once via the persistent browser session, then re-run',
      );
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
      const container = node.closest('[class*="field"], [class*="question"], fieldset, .form-group');
      if (!container) return '';
      const lbl = container.querySelector('label, legend, [class*="label"]');
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
