# AskSphere

A responsive quiz platform for customizable friendship and personality quizzes.

## Run locally

```bash
npm install
npm start
```

## Current features

- Create friendship quizzes with four answer choices and server-side answer keys.
- Create personality quizzes with 2–8 custom outcomes and answer-to-outcome mapping.
- Save both quiz types in Vercel Blob and share them using UUID-based links.
- Calculate quiz results server-side for new quiz links.
- Optional public friendship leaderboard; nickname and score are stored only after explicit player opt-in.
- 15 built-in friendship questions, 15 personality prompts, and 11 starter templates.
- Responsive landing page, FAQ, About page, privacy, terms, contact, sitemap and robots file.

## Environment and deployment

- Node.js and Express.
- Vercel Blob is required for quiz and leaderboard storage.
- On Vercel, connect a Blob store to the project and verify the server-side Blob token is available.
- Health endpoint: `/health`.

## Security and operational notes

- API validation, request body size limits, basic per-instance in-memory rate limiting, and baseline security headers are enabled.
- The in-memory rate limiter is not shared across serverless instances. Use a distributed rate-limit store before high-traffic public launch.
- There is no account system, quiz owner dashboard, or self-service deletion flow.
- Older friendship links created before server-side answer storage may expose correct answers in their URL payload. Recreate these quizzes before sharing again.
- Personality and friendship quiz data is stored in Vercel Blob. Public quiz links should be treated as shareable.
- A monitored support email, deletion workflow, regional privacy/legal review, and abuse-report process must be configured before broad public launch.

## AdSense preparation

Ad slots are placeholders only. The AdSense publisher verification script and ads.txt seller record are configured for publisher ID pub-2264953470106322. Ad-unit IDs and consent-management configuration are not yet set up, and Google approval is not confirmed. Apply only after the site has substantial original useful content, accurate policy disclosures, a working support contact, and the required consent setup for the regions served. Never encourage ad clicks or place ads where they can be confused with quiz controls.
