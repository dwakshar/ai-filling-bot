/**
 * Throw this when a step can't be automated reliably.
 * The main runner catches it and records status='needs-manual'.
 */
export class NeedsManualError extends Error {
  constructor(reason) {
    super(`needs-manual: ${reason}`);
    this.needsManual = true;
    this.reason = reason;
  }
}

/**
 * Base class that every platform adapter must extend.
 * All methods must be overridden — they throw by default so omissions are obvious.
 */
export class Adapter {
  /** Return true if this adapter handles the given URL. */
  static matches(url) {
    throw new Error('matches() not implemented');
  }

  /** Scrape the full job description text from the current page. */
  async getJobDescription(page) {
    throw new Error('getJobDescription() not implemented');
  }

  /** Fill name, email, phone, location, and other standard fields. */
  async fillBasics(page, profile) {
    throw new Error('fillBasics() not implemented');
  }

  /** Upload the resume PDF via the platform's file-input widget. */
  async uploadResume(page, pdfPath) {
    throw new Error('uploadResume() not implemented');
  }

  /**
   * Return an array of free-text question strings that need AI-generated answers.
   * @returns {Promise<string[]>}
   */
  async getQuestions(page) {
    throw new Error('getQuestions() not implemented');
  }

  /** Locate the textarea for `question` and type `answer` into it. */
  async fillAnswer(page, question, answer) {
    throw new Error('fillAnswer() not implemented');
  }

  /** Click the final submit button. Only called when AUTO_SUBMIT=true. */
  async submit(page) {
    throw new Error('submit() not implemented');
  }
}
