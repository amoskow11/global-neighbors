# Global Neighbors

A global mutual-aid and nonprofit-collaboration platform. Individuals and communities can ask for or offer help, and nonprofits and NGOs can find each other and respond. It covers everything from a grocery run for an older neighbor in Boston to clean water for a village in Kenya.

Live site: https://global-neighbors.pages.dev · Sample-data demo: https://global-neighbors.pages.dev/demo.html

## Features

- **Accounts:** email + password sign-up and login for individuals and organizations, editable profiles, password change (signs out other devices), and self-service account deletion.
- **Help Board:** post asks or offers (volunteer, paid, stipend, or funding), reply, accept or decline replies, and message privately. Posts can be resolved, reopened, or deleted.
- **Privacy:** the Help Board and individual profiles are visible to signed-in members only. A reply and its messages are visible only to the post's author and the person who replied. Emails are never shown to other members.
- **Directory:** member organizations (self-described, not yet verified) plus a read-only reference directory of 74 real nonprofits and NGOs across Greater Boston, the U.S., and the world, filterable by region, cause, and source. Each post suggests organizations matched by cause and region.

## Architecture

```
public/               static site (served by Cloudflare Pages)
  index.html          the app (single-file HTML/CSS/JS)
  demo.html           original clickable prototype with sample data only
  _headers            security headers (CSP, frame blocking, nosniff…)
functions/api/        Pages Function: JSON API under /api/*
migrations/           D1 (SQLite) schema migrations
wrangler.toml         Pages + D1 binding config
```

- **Database:** Cloudflare D1 (`global-neighbors-db`, binding `DB`).
- **Passwords:** PBKDF2-SHA256 (100k iterations, per-user salt) via WebCrypto.
- **Sessions:** random 256-bit tokens in an `HttpOnly; Secure; SameSite=Lax` cookie. Only a SHA-256 hash is stored, and sessions expire after 30 days.
- **CSRF:** state-changing requests must be JSON and same-origin.
- **Rate limits:** 8 failed logins per email (and 30 per IP) per 15 minutes; 10 sign-ups per IP per hour.

### API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | |
| GET / PATCH / DELETE | `/api/me` | DELETE requires `{password}` |
| POST | `/api/me/password` | `{currentPassword, newPassword}` |
| GET | `/api/orgs` | public list of member organizations |
| GET | `/api/users/:id` | org profiles public; individuals members-only |
| GET / POST | `/api/help?view=browse\|mine\|helping` | members only |
| GET / PATCH / DELETE | `/api/help/:id` | PATCH/DELETE author only |
| POST | `/api/help/:id/replies` | one reply per member per post |
| PATCH | `/api/replies/:id` | accept/decline; post author only |
| POST | `/api/replies/:id/messages` | post author or replier only |

## Development

```bash
npx wrangler d1 migrations apply global-neighbors-db --local
npx wrangler pages dev
```

Then open http://127.0.0.1:8788.

## Deployment

```bash
npx wrangler d1 migrations apply global-neighbors-db --remote   # only when migrations/ changed
npx wrangler pages deploy
```

## Not yet built

- **Password reset and email verification:** these need an email-sending service such as Resend or Postmark.
- **Organization verification:** member organizations are self-described.
- **Reporting, blocking, and moderation tools**, plus a privacy policy and terms of use. These should be in place before promoting the site widely, especially to vulnerable users.
- **Partnership requests, resource listings, and blueprint sharing** from the prototype still exist only in `demo.html`.
