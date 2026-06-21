import { Adapter, NeedsManualError } from './base.js';

const WELLFOUND_RE = /wellfound\.com\//;

const STANDARD_LABELS = [
  'name', 'email', 'phone', 'linkedin', 'resume', 'cv',
];

export class WellfoundAdapter extends Adapter {
  static matches(url) {
    return WELLFOUND_RE.test(url);
  }

  async getJobDescription(page) {
    const selectors = [
      '[class*="jobDescription"]',
      '[class*="job_description"]',
      '[data-test="job-description"]',
      '.job-description',
      'section[class*="description"]',
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
    // Open the apply drawer/modal
    await this.#openApplyForm(page);

    // If Wellfound is pre-filling from profile we may have nothing to fill,
    // but try the visible inputs anyway.
    const fullName = `${profile.firstName} ${profile.lastName}`;
    await this.#tryFill(page, [
      'input[placeholder*="full name" i]',
      'input[aria-label*="name" i]',
      'input[name*="name" i]',
    ], fullName);

    await this.#tryFill(page, [
      'input[type="email"]',
      'input[placeholder*="email" i]',
    ], profile.email);

    await this.#tryFill(page, [
      'input[type="tel"]',
      'input[placeholder*="phone" i]',
    ], profile.phone);

    if (profile.linkedin) {
      await this.#tryFill(page, [
        'input[placeholder*="linkedin" i]',
        'input[aria-label*="linkedin" i]',
        'input[name*="linkedin" i]',
      ], profile.linkedin);
    }
  }

  async uploadResume(page, pdfPath) {
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      console.warn('[Wellfound] No file input found — skipping resume upload');
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
        'button:has-text("Submit Application"), ' +
        'button:has-text("Apply"), ' +
        'button:has-text("Submit")',
      )
      .first();
  }

  // --- private helpers ---

  async #openApplyForm(page) {
    // Wait for the page to settle
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // Check for login wall before doing anything
    const loginBtn = page.locator(
      'a[href*="/login"], button:has-text("Log in"), a:has-text("Sign in")',
    ).first();

    // If there's already an apply form visible, skip button click
    const formAlreadyVisible = await page
      .locator('form, [class*="applicationForm"], [class*="apply-form"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (formAlreadyVisible) return;

    // Try clicking the Apply button
    const applyBtn = page
      .locator(
        'button:has-text("Apply"), a:has-text("Apply"), ' +
        '[data-test="apply-button"], [class*="applyButton"]',
      )
      .first();

    if ((await applyBtn.count()) === 0) {
      throw new NeedsManualError('Wellfound: no Apply button found — check if the job is still open');
    }

    await applyBtn.click();
    await page.waitForTimeout(2000);

    // Detect login redirect / login modal
    const afterUrl = page.url();
    const isLoginPage = afterUrl.includes('/login') || afterUrl.includes('/sign_in');
    const hasLoginModal = (await loginBtn.count()) > 0 && (await loginBtn.isVisible().catch(() => false));

    if (isLoginPage || hasLoginModal) {
      throw new NeedsManualError(
        'Wellfound: not logged in — log in once via the persistent browser session, then re-run',
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
