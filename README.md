# Global Neighbors

A clickable prototype for a nonprofit-collaboration platform: a place where nonprofits can find each other, partner up, and share what works.

## Features

- **Organization directory:** browse interactive demo organizations alongside a real-world reference directory of national and Boston-area nonprofits.
- **Partnership requests and messaging:** propose collaborations and message other organizations.
- **Resource listings:** post and browse shareable resources such as space, equipment, volunteers, and expertise.
- **Blueprint sharing:** NGO-to-NGO sharing of program "blueprints" so proven models can be adapted elsewhere.

## Status

This is a **front-end-only prototype**. Everything lives in a single HTML/CSS/JS file with mock data held in memory. There is no backend, database, or authentication, and changes reset when the page reloads. It is not a production system.

## Running locally

Open `index.html` (or `app.html`, which is identical) in a browser. No build step is required.

## Deployment

The site is deployed as a static site on Cloudflare Pages:

```bash
npx wrangler pages deploy . --project-name global-neighbors
```
