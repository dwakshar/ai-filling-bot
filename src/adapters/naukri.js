import { Adapter, NeedsManualError } from './base.js';

// Naukri job URLs come in several shapes:
//   naukri.com/job-listings-*
//   naukri.com/view-jobdetail?*
//   naukri.com/<slug>-jobs-in-*
const NAUKRI_RE = /naukri\.com\//;

const STANDARD_LABELS = [
  'name', 'email', 'phone', 'mobile', 'resume', 'cv',
  'current ctc', 'expected ctc', 'notice period', 'experience',
];

export class NaukriAdapter extends Adapter {
  static matches(url) {
    return NAUKRI_RE.test(url);
  }

  async getJobDescription(page) {
    const selectors = [
      '.job-desc',
      '[class*="jobDescription"]',
      '[class*="job-description"]',
      '.dang-inner-html',
      '.jd-desc',
      '[class*="description"]',
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

    // After opening, Naukri may show a Quick Apply modal or a multi-step form.
    // Wait briefly for whichever appears.
    await page.waitForTimeout(2000);

    const fullName = `${profile.firstName} ${profile.lastName}`;
    await this.#tryFill(page, [
      'input[placeholder*="name" i]',
      'input[aria-label*="name" i]',
      'input[name*="name" i]',
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

    // India-specific fields common on Naukri
    if (profile.noticePeriod) {
      await this.#tryFill(page, [
        'input[placeholder*="notice" i]',
        'input[aria-label*="notice" i]',
        'input[name*="notice" i]',
      ], profile.noticePeriod);
    }

    if (profile.expectedCtc) {
      await this.#tryFill(page, [
        'input[placeholder*="expected ctc" i]',
        'input[placeholder*="expected salary" i]',
        'input[aria-label*="expected ctc" i]',
        'input[name*="expected" i]',
      ], String(profile.expectedCtc));
    }
  }

  async uploadResume(page, pdfPath) {
    // Naukri's Quick Apply often doesn't need a new upload if a resume is on file.
    // Try the file input anyway.
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      console.warn('[Naukri] No file input found — resume likely pre-attached from profile');
      return;
    }
    if (!(await fileInput.isVisible().catch(() => false))) {
      console.warn('[Naukri] File input hidden — resume likely pre-attached from profile');
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
    // Naukri has "Apply" / "Submit" / "Confirm" depending on the flow
    return page
      .locator(
        'button:has-text("Apply"), button:has-text("Submit"), ' +
        'button:has-text("Confirm"), button[type="submit"]',
      )
      .first();
  }

  // --- private helpers ---

  async #openApplyForm(page) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // Already on an apply page?
    const formVisible = await page.locator('form').first().isVisible().catch(() => false);
    if (formVisible) return;

    // Prefer Quick Apply (uses existing profile — least risky)
    const quickApply = page
      .locator(
        'button[title*="quick apply" i], button:has-text("Quick Apply"), ' +
        'a:has-text("Quick Apply"), [class*="quickApply"]',
      )
      .first();

    const fullApply = page
      .locator(
        'button[title*="apply" i]:not([title*="quick" i]), button:has-text("Apply"), ' +
        'a:has-text("Apply Now"), a:has-text("Apply")',
      )
      .first();

    const btn = (await quickApply.count()) > 0 ? quickApply : fullApply;

    if ((await btn.count()) === 0) {
      throw new NeedsManualError('Naukri: no Apply button found on page');
    }

    await btn.click();
    await page.waitForTimeout(2500);

    // Login detection
    const afterUrl = page.url();
    if (afterUrl.includes('/login') || afterUrl.includes('/nlogin')) {
      throw new NeedsManualError(
        'Naukri: not logged in — log in once via the persistent browser session, then re-run',
      );
    }

    const loginModal = await page
      .locator('[class*="loginModal"], [class*="login-modal"], input[name="username"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (loginModal) {
      throw new NeedsManualError(
        'Naukri: login modal appeared — log in once via the persistent browser session, then re-run',
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
