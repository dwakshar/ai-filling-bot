# ai-filling-bot

Personal CLI tool that automates job applications using Playwright + Claude.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Chromium browser
npx playwright install chromium

# 3. Configure environment
cp .env.example .env
# Open .env and add your ANTHROPIC_API_KEY

# 4. Add your resume
#    - Paste plain text into config/resume.txt  (Claude reads this)
#    - Drop your real PDF as config/resume.pdf  (uploaded to job sites)

# 5. Add job URLs
#    Open data/jobs.txt and add one URL per line

# 6. Run
npm run apply
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Get from console.anthropic.com |
| `REVIEW_MODE` | `true` | Pause after filling so you can review before submit |
| `AUTO_SUBMIT` | `false` | Automatically click Submit (use with caution) |
| `AUTO_SEND` | `false` | Automatically send cold emails |

## File layout

```
config/
  profile.json   — your static info (name, phone, LinkedIn, etc.)
  resume.txt     — plain-text resume for Claude context
  resume.pdf     — PDF uploaded to job portals
data/
  jobs.txt       — one job URL per line, # for comments
src/
  index.js       — orchestrator entry point
  browser.js     — persistent Playwright browser
  ai.js          — Claude API wrapper
  state.js       — result logger & screenshot helper
  adapters/
    base.js      — adapter interface
    index.js     — adapter registry
results.json     — output log (git-ignored)
screenshots/     — per-job screenshots (git-ignored)
```

## Adding a new platform adapter

1. Create `src/adapters/<platform>.js` extending `Adapter` from `base.js`
2. Implement all six methods
3. Register it in `src/adapters/index.js`
