<div align="center">

# 🤖 AI Job Filler

**Stop copy-pasting. Start applying.**

AI Job Filler uses Claude to read job descriptions, understand your resume, and write tailored answers to every custom question — automatically. Run it as a CLI bot that applies to a whole list overnight, or install the Chrome extension and fill any form in one click.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Powered by Claude](https://img.shields.io/badge/Powered%20by-Claude%20Sonnet-6B47ED?logo=anthropic&logoColor=white)](https://anthropic.com)
[![Playwright](https://img.shields.io/badge/Playwright-1.45+-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?logo=googlechrome&logoColor=white)](extension/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ What it does

- **Fills basics automatically** — name, email, phone, LinkedIn, GitHub, portfolio, CTC, notice period
- **Writes custom answers with Claude** — tailored to the specific company and JD, never generic
- **Strict no-hallucination rules** — only claims skills and experience from your resume
- **Two modes** — a headless CLI batch runner and a one-click Chrome extension
- **6 platforms supported** — Greenhouse, Lever, Ashby, Wellfound, Instahyre, Naukri
- **Review before submit** — pause to inspect every form before it goes out

---

## 🌐 Supported Platforms

| Platform                            | CLI Bot | Chrome Extension |
| ----------------------------------- | :-----: | :--------------: |
| [Greenhouse](https://greenhouse.io) |   ✅    |        ✅        |
| [Lever](https://lever.co)           |   ✅    |        ✅        |
| [Ashby](https://ashbyhq.com)        |   ✅    |        ✅        |
| [Wellfound](https://wellfound.com)  |   ✅    |        ✅        |
| [Instahyre](https://instahyre.com)  |   ✅    |        ✅        |
| [Naukri](https://naukri.com)        |   ✅    |        ✅        |

---

## 🚀 Quick Start

### Option A — Chrome Extension _(recommended)_

No terminal. Works while you browse.

1. Clone the repo
2. Open **`chrome://extensions`** → enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon → **Settings**
5. Enter your Anthropic API key, profile details, and paste your resume text
6. Navigate to any supported job page → click **Fill Application**

> **Note:** Resume file upload must be done manually — Chrome blocks extensions from setting file inputs for security reasons.

---

### Option B — CLI Bot _(batch mode)_

Applies to a whole list of jobs while you sleep.

```bash
# 1. Install dependencies
npm install

# 2. Download Chromium
npx playwright install chromium

# 3. Set your API key
cp .env.example .env.local
# Add ANTHROPIC_API_KEY to .env.local

# 4. Add your profile & resume
#    Edit config/profile.json with your details
#    Paste plain-text resume into config/resume.txt
#    Drop resume PDF as config/resume.pdf

# 5. Queue your jobs
#    Add one job URL per line to data/jobs.txt

# 6. Run
npm run apply
```

---

## ⚙️ Configuration

### `config/profile.json`

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+91-9999999999",
  "linkedin": "https://linkedin.com/in/janedoe",
  "github": "https://github.com/janedoe",
  "portfolio": "https://janedoe.dev",
  "currentCompany": "Acme Corp",
  "noticePeriod": "30 days",
  "expectedSalary": "25 LPA"
}
```

### `.env.local`

| Variable            | Default | Description                                                                       |
| ------------------- | ------- | --------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | —       | **Required.** Get yours at [console.anthropic.com](https://console.anthropic.com) |
| `REVIEW_MODE`       | `true`  | Pause after each form so you can review before submitting                         |
| `AUTO_SUBMIT`       | `false` | Auto-click Submit — use with caution                                              |
| `AUTO_SEND`         | `false` | Auto-send cold outreach emails                                                    |

---

## 🏗️ How It Works

```
You add job URLs to data/jobs.txt
         │
         ▼
    CLI Bot opens Chrome (Playwright)
    navigates to each URL
         │
         ▼
    Platform adapter detects the site
    scrapes the job description
         │
         ▼
    Fills basics from profile.json
    (name, email, phone, links)
         │
         ▼
    Finds custom questions on the form
         │
         ▼
    Claude reads your resume + JD
    writes a tailored answer per question
         │
         ▼
    Fills answers into the form
    takes a screenshot
         │
         ▼
    REVIEW_MODE=true → you inspect & approve
    AUTO_SUBMIT=true  → clicks Submit for you
         │
         ▼
    Logs result to results.json
```

---

## 📁 Project Structure

```
ai-filling-bot/
├── config/
│   ├── profile.json      # Your static info
│   ├── resume.txt        # Plain-text resume (Claude context)
│   └── resume.pdf        # PDF uploaded to job portals
├── data/
│   ├── jobs.txt          # One job URL per line
│   └── contacts.csv      # Contacts for cold email outreach
├── src/
│   ├── index.js          # CLI orchestrator
│   ├── browser.js        # Persistent Playwright browser
│   ├── ai.js             # Claude API wrapper
│   ├── email.js          # Cold email generator
│   ├── state.js          # Result logger & screenshots
│   └── adapters/
│       ├── base.js       # Adapter interface
│       ├── greenhouse.js
│       ├── lever.js
│       ├── ashby.js
│       ├── wellfound.js
│       ├── instahyre.js
│       └── naukri.js
├── extension/            # Chrome Extension (MV3)
│   ├── manifest.json
│   ├── background/       # Service worker → Claude API
│   ├── content/          # DOM adapter logic
│   ├── popup/            # Extension popup UI
│   └── options/          # Settings page
├── screenshots/          # Per-job form screenshots (git-ignored)
└── results.json          # Run output log (git-ignored)
```

---

## 🤖 AI Answer Quality

Every answer Claude writes follows strict rules:

- **No hallucinations** — only uses facts from your resume and profile; never invents skills, employers, or numbers
- **Company-specific** — reads the actual JD and ties answers to it
- **Length-aware** — short answer fields get 1–2 sentences; long textareas get up to 5
- **Human tone** — no "I am excited to apply", no buzzword soup, no AI-tells
- **First-person** — written as you, not about you

---

## ➕ Adding a New Platform

1. Create `src/adapters/<platform>.js` extending `Adapter` from `base.js`
2. Implement: `matches()`, `getJobDescription()`, `fillBasics()`, `uploadResume()`, `getQuestions()`, `fillAnswer()`, `submit()`
3. Register it in `src/adapters/index.js`
4. Add the domain to `extension/manifest.json` under `host_permissions` and `content_scripts.matches`

---

## ⚠️ Responsible Use

- Always review filled forms before submitting — you're responsible for what gets sent
- Don't misrepresent your experience — the bot is configured to stay within your resume
- Respect each platform's Terms of Service
- Keep your API key out of version control (`.env.local` is git-ignored)

---

## 🛠️ Tech Stack

| Layer              | Technology                                               |
| ------------------ | -------------------------------------------------------- |
| AI                 | [Claude Sonnet](https://anthropic.com) via Anthropic API |
| Browser automation | [Playwright](https://playwright.dev)                     |
| Runtime            | Node.js 22+ (ESM)                                        |
| Extension          | Chrome MV3, Vanilla JS (no bundler needed)               |

---

<div align="center">

Built for job hunters who'd rather code once than apply manually forever.

**Star ⭐ if this saved you time.**

</div>
