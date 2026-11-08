# AskSphere

A responsive friendship and personality quiz builder.

## Run locally

```bash
npm install
npm start
```

## Current MVP behavior

- Create friendship quizzes with keyed answers and score results.
- Create personality quizzes with custom result types.
- Share quiz definitions using a URL-encoded payload.
- Play sample quiz, responsive landing page, legal-page starter templates, and reserved ad slots.

## Production work still required

This is a frontend MVP. Shared quiz payloads travel in the URL; responses are calculated in the visitor's browser and are not collected into a cross-device leaderboard. Before public monetization, connect a database and authentication, add abuse reporting/rate limits, configure a real support contact and privacy disclosures, and add the approved AdSense publisher/client + ad unit IDs only after Google approval. Never encourage invalid ad clicks or show ads on thin/empty content pages.

## Deployment

Node/Express static host. Health endpoint: `/health`.
