import { Adapter } from './base.js';

const GENERIC_STD_LABELS = [
  'name', 'email', 'phone', 'mobile', 'linkedin', 'resume', 'cv',
  'cover letter', 'github', 'portfolio', 'website',
];

const GENERIC_JD_SELECTORS = [
  '.job-description', '[class*="job-description"]', '[class*="jobDescription"]',
  '.job-details', '[class*="job-details"]', 'article main', 'article', 'main',
];

function makeJobBoardAdapter(displayName, domain) {
  const re = new RegExp(domain.replace(/\./g, '\\.'));

  return class extends Adapter {
    static get displayName() { return displayName; }

    static matches(url) {
      return re.test(url);
    }

    async getJobDescription(page) {
      for (const sel of GENERIC_JD_SELECTORS) {
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
      const fullName = `${profile.firstName} ${profile.lastName}`;
      const nameFilled = await this.#tryFill(page, [
        'input[autocomplete="name"]',
        'input[placeholder*="full name" i]',
        'input[aria-label*="full name" i]',
      ], fullName);

      if (!nameFilled) {
        await this.#tryFill(page, [
          'input[autocomplete="given-name"]',
          'input[name*="first" i]',
          'input[placeholder*="first name" i]',
          'input[aria-label*="first name" i]',
        ], profile.firstName);
        await this.#tryFill(page, [
          'input[autocomplete="family-name"]',
          'input[name*="last" i]',
          'input[placeholder*="last name" i]',
          'input[aria-label*="last name" i]',
        ], profile.lastName);
      }

      await this.#tryFill(page, [
        'input[type="email"]', 'input[name*="email" i]', 'input[placeholder*="email" i]',
      ], profile.email);

      await this.#tryFill(page, [
        'input[type="tel"]', 'input[name*="phone" i]', 'input[placeholder*="phone" i]',
        'input[placeholder*="mobile" i]',
      ], profile.phone);

      if (profile.linkedin) {
        await this.#tryFill(page, [
          'input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]',
          'input[aria-label*="linkedin" i]',
        ], profile.linkedin);
      }

      const portfolio = profile.portfolio || profile.website;
      if (portfolio) {
        await this.#tryFill(page, [
          'input[name*="portfolio" i]', 'input[placeholder*="portfolio" i]',
          'input[name*="website" i]',  'input[placeholder*="website" i]',
        ], portfolio);
      }
    }

    async uploadResume(page, pdfPath) {
      const fileInput = page.locator('input[type="file"]').first();
      if ((await fileInput.count()) === 0) return;
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
        const id    = await el.getAttribute('id');
        const label = await this.#getLabelFor(page, el, id);
        if (!label) continue;
        const ll = label.toLowerCase();
        if (GENERIC_STD_LABELS.some(s => ll.includes(s))) continue;
        const name     = (await el.getAttribute('name')) ?? '';
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
      return page.locator(
        'button[type="submit"], button:has-text("Submit Application"), ' +
        'button:has-text("Apply"), button:has-text("Submit")',
      ).first();
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
  };
}

export const SimplyHiredAdapter      = makeJobBoardAdapter('SimplyHired',       'simplyhired.com');
export const JobspressoAdapter       = makeJobBoardAdapter('Jobspresso',        'jobspresso.co');
export const StackOverflowAdapter    = makeJobBoardAdapter('Stack Overflow',    'stackoverflow.com');
export const IndeedAdapter           = makeJobBoardAdapter('Indeed',            'indeed.com');
export const GlassdoorAdapter        = makeJobBoardAdapter('Glassdoor',         'glassdoor.com');
export const NoDeskAdapter           = makeJobBoardAdapter('NoDesk',            'nodesk.co');
export const RemotiveAdapter         = makeJobBoardAdapter('Remotive',          'remotive.com');
export const Remote4MeAdapter        = makeJobBoardAdapter('Remote4Me',         'remote4me.com');
export const PangianAdapter          = makeJobBoardAdapter('Pangian',           'pangian.com');
export const RemoteesAdapter         = makeJobBoardAdapter('Remotees',          'remotees.com');
export const RemoteHabitsAdapter     = makeJobBoardAdapter('RemoteHabits',      'remotehabits.com');
export const SkipTheDriveAdapter     = makeJobBoardAdapter('Skip The Drive',    'skipthechive.com');
export const EuropeRemotelyAdapter   = makeJobBoardAdapter('Europe Remotely',   'europeremotely.com');
export const WorkingNomadsAdapter    = makeJobBoardAdapter('Working Nomads',    'workingnomads.com');
export const VirtualVocationsAdapter = makeJobBoardAdapter('Virtual Vocations', 'virtualvocations.com');
export const WeWorkRemotelyAdapter   = makeJobBoardAdapter('We Work Remotely',  'weworkremotely.com');
export const FlexJobsAdapter         = makeJobBoardAdapter('FlexJobs',          'flexjobs.com');
