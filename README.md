# Global Neighbors

A global mutual-aid and nonprofit-collaboration platform. Individuals and communities can ask for or offer help, and nonprofits and NGOs can find each other and respond. It covers everything from a grocery run for an older neighbor in Boston to clean water for a village in Kenya.

Live site: https://global-neighbors.pages.dev · Sample-data demo: https://global-neighbors.pages.dev/demo.html

## Features

- **Accounts:** email + password sign-up and login for individuals and organizations, editable profiles, password change (signs out other devices), and self-service account deletion.
- **Help Board:** post asks or offers (volunteer, paid, stipend, or funding), reply, accept or decline replies, and message privately. Posts can be resolved, reopened, or deleted.
- **Privacy:** the Help Board and individual profiles are visible to signed-in members only. A reply and its messages are visible only to the post's author and the person who replied. Emails are never shown to other members.
- **Trust & safety:** report posts, replies, or members; block members (both directions); an admin panel to review reports, hide posts, suspend accounts, and look up members; every admin action is logged.
- **Usage analytics (admin):** an Activity dashboard in the Admin panel with sessions, active members, time spent, most-used features, guest-to-member conversions, device mix, daily charts, and a per-member drill-down. Tracking is first-party and content-free: it records active time (only while the tab is visible and in use), device type, and which features are used, never what anyone types. Admin accounts are excluded, and data is deleted after 180 days or with the account.
- **Organization verification:** orgs submit legal name, registration number, and role; an admin checks public records and approves, which adds a ✓ Verified badge (renaming the org clears it).
- **Email:** confirmation and password-reset links via Resend, switched on by configuration. Until it's configured, admins can issue one-time reset links.
- **Policies:** `/privacy`, `/terms`, and `/safety` pages. Sign-up requires confirming 18+ and accepting the Terms.
- **Profiles:** LinkedIn-style profiles with a profile photo or logo and a banner, both uploaded and cropped in the browser (which also strips photo location data). Members without a banner pick a preset style. Profiles also show pronouns, languages, and ways I can help / what we offer, and names across the app open the member's profile. Organization images are public; individuals' images are members-only. Admins can remove images.
- **Guest mode:** "Look around as a guest" opens the app with clearly labeled sample posts and the real directory, with no account needed. Guests can draft a post or reply but must sign up to publish, and a drafted post is restored after sign-up.
- **Directory:** member organizations (verified or self-described) plus a read-only reference directory of 74 real nonprofits and NGOs across Greater Boston, the U.S., and the world, filterable by region, cause, and source. Each post suggests organizations matched by cause and region. Reference organizations show their official logos (for identification) and openly licensed, cause-matched banner photos from Wikimedia Commons. See `/credits`.

## Architecture

```
public/               static site (served by Cloudflare Pages)
  index.html          the app (single-file HTML/CSS/JS)
  demo.html           original clickable prototype with sample data only
  privacy.html, terms.html, safety.html, credits.html, legal.css
  orgs/logos/, orgs/banners/   reference-directory logos and banner photos
  _headers            security headers (CSP, frame blocking, nosniff…)
functions/api/        Pages Function: JSON API under /api/*
migrations/           D1 (SQLite) schema migrations
tests/                API test suites (bash + curl); run with tests/run.sh
wrangler.toml         Pages + D1 binding config
```

- **Database:** Cloudflare D1 (`global-neighbors-db`, binding `DB`).
- **Profile images:** stored in D1 (`media` table) after browser-side resizing: avatars ≤ 300 KB and banners ≤ 900 KB, served from `/api/media/:id`. That fits roughly 1,500 members on D1's free tier. To scale further, enable R2 and move `uploadMedia`/`serveMedia` to a bucket; the URLs and API don't need to change.
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
| POST | `/api/auth/verify/send`, `/api/auth/verify`, `/api/auth/forgot`, `/api/auth/reset` | email flows |
| GET / POST | `/api/me/verification` | org verification request |
| POST | `/api/reports` · GET/POST `/api/blocks` · DELETE `/api/blocks/:userId` | |
| GET / POST | `/api/admin/*` | overview, reports, verifications, users, posts; admins only |
| POST / DELETE | `/api/me/media/avatar`, `/api/me/media/banner` | upload `{dataUrl}` (JPEG/PNG/WebP) or remove |
| GET | `/api/media/:id` | org images public; individuals' members-only |
| POST | `/api/activity` | `{sid, activeMs, device, events[]}` usage ping (guests and members) |
| GET | `/api/admin/activity?days=&tz=` · `/api/admin/activity/users/:id` | dashboard data; admins only |

## Admins

Admin rights are never granted automatically. Grant them to an existing account with:

```bash
npx wrangler d1 execute global-neighbors-db --remote --command "UPDATE users SET is_admin=1 WHERE email='someone@example.org'"
```

## Turning on email

1. Create a [Resend](https://resend.com) account, verify a domain you own, and create an API key.
2. In `wrangler.toml`, set `MAIL_FROM` to an address on that domain, e.g. `"Global Neighbors <no-reply@your-domain.org>"`.
3. `npx wrangler pages secret put RESEND_API_KEY --project-name global-neighbors`
4. `npx wrangler pages deploy`

Once email is on, members must confirm their email before posting, replying, or messaging. For local testing, put `RESEND_API_KEY=dev-log` and any `MAIL_FROM` in `.dev.vars`; emails are then printed to the dev-server log instead of sent.

## Development

```bash
npx wrangler d1 migrations apply global-neighbors-db --local
npx wrangler pages dev
```

Then open http://127.0.0.1:8788.

### Tests

With the dev server running **without** `.dev.vars` (email off):

```bash
bash tests/run.sh
```

This runs `api_test.sh`, `trust_test.sh`, `media_test.sh`, and `activity_test.sh`. To exercise the email flows, start the server with `RESEND_API_KEY=dev-log` in `.dev.vars` and run `bash tests/trust_test.sh http://127.0.0.1:8788 devlog <path-to-dev-server-log>`. Test accounts all use `@example.com` addresses.

## Deployment

```bash
npx wrangler d1 migrations apply global-neighbors-db --remote   # only when migrations/ changed
npx wrangler pages deploy
```

## Not yet built

- Email is built but not switched on: it needs a Resend account and a domain (see above).
- Partnership requests, resource listings, and blueprint sharing from the prototype still exist only in `demo.html`.
- The privacy policy and terms were drafted for this prototype. Have them reviewed by someone qualified before a wide launch.
