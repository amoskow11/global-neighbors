# Global Neighbors

A clickable prototype for a global mutual-aid and nonprofit-collaboration platform. Individuals and communities can ask for or offer help, and nonprofits and NGOs can find each other, partner up, and share what works.

## Features

- **Help Board (for individuals and organizations):** anyone can ask for help or offer it. Posts range from a grocery run for an older neighbor in Dorchester to a broken water pump in rural Kenya. Posts can be volunteer, paid, stipend, or funding asks, with replies, accept/decline, and messaging. Each post suggests real organizations matched by cause area and region.
- **Two ways to browse:** switch between sample individuals and community members (Boston, Kenya, Colombia, India) and sample organizations.
- **Organization directory:** interactive demo organizations plus a real-world reference directory of 70+ nonprofits and NGOs across Greater Boston, the U.S., Africa, South Asia, Latin America, and global networks, filterable by region, cause, and source.
- **Partnership requests and messaging:** organizations propose collaborations and message each other.
- **Resource listings:** post and browse shareable resources such as space, equipment, volunteers, and expertise.
- **Blueprint sharing:** NGO-to-NGO sharing of program "blueprints" so proven models can be adapted elsewhere.

## Status

This is a **front-end-only prototype**. Everything lives in a single HTML/CSS/JS file with mock data held in memory. Real organizations are listed from public information for reference only; all people, help posts, demo organizations, and messages are fictional. There is no backend, database, or authentication, and changes reset when the page reloads. It is not a production system.

## Running locally

Open `index.html` (or `app.html`, which is identical) in a browser. No build step is required.

## Deployment

The site is deployed as a static site on Cloudflare Pages:

```bash
npx wrangler pages deploy . --project-name global-neighbors
```
