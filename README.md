# Global Neighbors

A global mutual-aid and nonprofit-collaboration platform. Individuals and communities can ask for or offer help, and nonprofits and NGOs can find each other and respond. It covers everything from a grocery run for an older neighbor in Boston to clean water for a village in Kenya.

Live site: https://global-neighbors.pages.dev · Sample-data demo: https://global-neighbors.pages.dev/demo.html

## Features

- **Accounts:** email + password sign-up and login for individuals and organizations, editable profiles, password change (signs out other devices), and self-service account deletion.
- **Help Board:** a three-step post form (choose "I need help" or "I can help", fill in details, then preview) for asks and offers (volunteer, paid, stipend, or funding). One vocabulary everywhere: "Needs help" / "Offering help", with "I can help" on asks and "Request this" on offers.
- **Editing posts:** the poster can change any field after publishing (wording, category, location, reach, urgency, date/time, compensation, helper count) through the same form, ending in a preview and "Save changes". Asking ↔ offering can switch only before anyone replies, and the helper count never drops below the number committed. Real edits show "Edited" and notify everyone in a conversation (one unread notice per post); resaving unchanged values does neither.
- **Scheduling & arranging the board:** posts can carry an optional date and time ("When do you need it?" / "When are you available?"). The board can be arranged by Newest, Urgency (Urgent → Hiring now → This week → This month → Ongoing → Flexible), Date (Today, Tomorrow, Next 7 days, Later, No set date, Date has passed), or Location (Near you, elsewhere in your region, Remote, Other regions), with a "When" filter (today / 7 days / 30 days) and a "Near me" filter matched on your profile's city.
- **Commitments:** a reply starts a private conversation (`talking`). Spots fill only when the helper commits (the replier on an ask, the poster on an offer) after a confirmation dialog. Replies move through `talking → committed → completed`, or end as `withdrawn` (back out, release, or cancel) or `declined`. Messaging works in every state except declined and withdrawn.
- **Multi-helper posts:** `helpers_needed` (1–20, editable but never below the number committed). Status is derived from commitments: open, in progress (still needs N or full), and resolved when the poster marks it complete. Commits are a single conditional statement, so two people can't overfill a post. Cards show "2 of 4 helpers · needs 2 more" or "Full", and there's a "Still needs helpers" filter. The poster sees helpers with ratings, can release them, and can send one update to all of them. Helpers see each other by first name and last initial.
- **Ratings:** after completion, the poster and each helper rate each other once (1–5 stars, an optional comment of up to 280 characters), enforced on the server. "★ 4.8 · 12 ratings" (or "New") appears on profiles, organization pages, and next to names. Ratings are reportable, and admins can hide them, which removes them from averages.
- **Privacy:** the Help Board and individual profiles are visible to signed-in members only. A reply and its messages are visible only to the post's author and the person who replied. Emails are never shown to other members.
- **Trust & safety:** report posts, replies, or members; block members (both directions); an admin panel to review reports, hide posts, suspend accounts, and look up members; every admin action is logged.
- **Notifications:** a bell with an unread count (also shown in the browser tab title) for replies, accepted offers, new messages (one notice per conversation), verification decisions, and moderation notices; admins also hear about new feedback. Optional browser alerts while the site is open in a tab. Polled every 45 seconds.
- **Feedback tab:** a "Feedback" button on every page, for guests too, sends ideas, problems, and category requests to Admin → Feedback (new / reviewed / done).
- **Categories:** 26 help categories in six groups, plus "Other" with the poster's own topic, which is shown as the post's category and is searchable.
- **Guest → member:** guests see real aggregate counts (open posts, members, posts this week; never content), a one-time invitation after opening two posts or about 90 seconds, and a shorter sign-up (location optional). The Activity dashboard tracks invitations shown and sign-up clicks.
- **Usage analytics (admin):** an Activity dashboard in the Admin panel with sessions, active members, time spent, most-used features, guest-to-member conversions, device mix, daily charts, and a per-member drill-down. Tracking is first-party and content-free: it records active time (only while the tab is visible and in use), device type, and which features are used, never what anyone types. Admin accounts are excluded, and data is deleted after 180 days or with the account.
- **Landing page:** `/start` is a marketing page with two value propositions, A (stop duplicated work) and B (neighbors helping neighbors). **Version B is live for everyone; the A/B split is off.** Only the hero headline, lead, and example differ. Results are in Admin → Landing page.
- **Organization verification:** orgs submit legal name, registration number, and role; an admin checks public records and approves, which adds a ✓ Verified badge (renaming the org clears it).
- **Email:** confirmation and password-reset links via Resend, switched on by configuration. Until it's configured, admins can issue one-time reset links.
- **Policies:** `/privacy`, `/terms`, and `/safety` pages. Sign-up requires confirming 18+ and accepting the Terms.
- **Profiles:** LinkedIn-style profiles with a profile photo or logo and a banner, both uploaded and cropped in the browser (which also strips photo location data). Members without a banner pick a preset style. Profiles also show pronouns, languages, and ways I can help / what we offer, and names across the app open the member's profile. Organization images are public; individuals' images are members-only. Admins can remove images.
- **Guest mode:** "Look around as a guest" opens the app with clearly labeled sample posts and the real directory, with no account needed. Guests can draft a post or reply but must sign up to publish, and a drafted post is restored after sign-up.
- **Directory:** member organizations (verified or self-described) plus a read-only reference directory of 74 real nonprofits and NGOs across Greater Boston, the U.S., and the world, filterable by region, cause, and source. Each post suggests organizations matched by cause and region. Reference organizations show their official logos (for identification) and openly licensed, cause-matched banner photos from Wikimedia Commons. See `/credits`.


## Traction dashboard

Admin → **Traction** opens on **Today**: a greeting, the top suggestions, how recently members visited, and what was done. Then it follows four steps: frame a unique benefit, build marketing assets, display results, and find what people want. **Present** shows the same story on four screens (use the arrow keys) with no member details.

- **Traction coach** (`public/traction-coach.js`) turns live numbers into ranked suggestions and adds fresh ideas daily, some seasonal. It uses rules, not an AI service. It sits on every Traction screen. Done and Later are saved in `coach_log` with the number the idea should move.
- **Outreach** (`public/traction-outreach.js`) has two sections. *Current members* puts each member in one group (`memberSegments` in the API) with a ready message. The admin picks people, confirms, and sends an in-app note, or opens an email draft in their own mail app. Limits: one message per person per week, the same message once in 30 days, and nobody who turned suggestions off. Email addresses aren’t in the list. One is returned, and logged, only when a draft is opened. *Possible new users* is a prospect list with stages, follow-up dates, messages, and a tracked `invite-` link each, plus directory organizations that fit what neighbors ask for.
- **Posts that need a push** lists posts with no reply, stalled conversations, and commitments nobody confirmed, with the members who fit and why. Suggestions are in-app notices: the admin chooses who gets one, each member gets at most one invitation a week, blocks are respected, and members can turn them off in My profile. `rescueQueue` in the API has the matching rules.
- **Assets** are drawn in the browser (`public/traction-assets.js`, including the QR encoder) and downloaded as PNG. Each has its own `/start?src=` tag, saved in `campaigns`.
- **Counting:** admin accounts are left out, and a reply, commitment, or completed task counts only when neither side is an admin.
- `public/traction.js`, `traction.css`, and `traction-assets.js` load only when an admin opens the tab. Benefit claims come from the November 2026 competitive analysis, so check them before reusing them later.
- Migration 0009 adds `sprints`, `campaigns`, `nudges`, and `users.no_nudges`. Migration 0010 adds `outreach`, `leads`, and `coach_log`.

## Architecture

```
public/               static site (served by Cloudflare Pages)
  index.html          the app (single-file HTML/CSS/JS)
  start.html          marketing landing page (versions A and B)
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
| GET / DELETE | `/api/help/:id` | DELETE author only |
| POST | `/api/help/:id/replies` | one reply per member per post |
| POST | `/api/replies/:id/commit` · `/withdraw` · `/decline` · `/rating` | helper commits; either side withdraws; poster declines; ratings after completion |
| PATCH · POST | `/api/help/:id` (any post fields, including `whenDate`/`whenTime`/`helpersNeeded`/`type`) · `/api/help/:id/complete` · `/api/help/:id/update` `{text}` | poster only |
| POST | `/api/admin/ratings/:id` `{action: hide\|unhide}` | admins only |
| POST | `/api/replies/:id/messages` | post author or replier only |
| POST | `/api/auth/verify/send`, `/api/auth/verify`, `/api/auth/forgot`, `/api/auth/reset` | email flows |
| GET / POST | `/api/me/verification` | org verification request |
| POST | `/api/reports` · GET/POST `/api/blocks` · DELETE `/api/blocks/:userId` | |
| GET / POST | `/api/admin/*` | overview, reports, verifications, users, posts; admins only |
| POST / DELETE | `/api/me/media/avatar`, `/api/me/media/banner` | upload `{dataUrl}` (JPEG/PNG/WebP) or remove |
| GET | `/api/media/:id` | org images public; individuals' members-only |
| POST | `/api/activity` | `{sid, activeMs, device, events[]}` usage ping (guests and members) |
| GET | `/api/admin/activity?days=&tz=` · `/api/admin/activity/users/:id` | dashboard data; admins only |
| GET · POST | `/api/notifications` · `/api/notifications/read` `{ids[]}\|{all:true}` | members only |
| POST | `/api/feedback` | `{kind, message, contactEmail?, page}`; guests allowed (10/hour per IP) |
| GET · POST | `/api/admin/feedback?status=` · `/api/admin/feedback/:id` `{status}` | admins only |
| POST | `/api/landing` | `{vid, experiment, event?, source?, device}`; anonymous, one visitor row and one row per event |
| GET | `/api/admin/landing` | A/B results; admins only |
| GET | `/api/stats` | public aggregate counts for guests (cached 5 min) |

## Landing page and A/B test

- **Mode:** `solo-b` shows everyone B. To run the test, set `EXP = 'vp1'` and `ONLY = ''` in `public/start.html` and `LANDING_ACTIVE = 'vp1'` in the API. The modes are counted separately (`/api/admin/landing?experiment=`).
- **Links:** share `/start`, or `/start?src=flyer` to compare channels. `/start?v=a` and `/start?v=b` preview a version without counting.
- **Assignment:** the browser makes a random 32-digit hex id and keeps it; an even first digit is A, odd is B. The server derives the version from the id, so a client can't report the wrong one. Signed-in members, bots, and browsers sending GPC/DNT aren't counted.
- **Goals:** primary is any `cta:*` click, per visitor. Secondary is an account created in the same browser within 30 days. Sign-up events store the day only and no account id.
- **Sample size:** 200 visitors per version detects a click rate doubling from 10% to 20% (80% power, 5% significance, two-sided). A smaller lift needs more: 10% to 15% takes about 690 each. In test mode, the dashboard gives no verdict before the target and warns if the split is uneven.
- **Another test:** add a new key to `LANDING_EXPERIMENTS` and use it in both places, so visitors are re-randomized.

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

This runs `api_test.sh`, `trust_test.sh`, `media_test.sh`, `activity_test.sh`, `writeup_test.sh`, `commit_test.sh`, `edit_test.sh`, and `landing_test.sh`. To exercise the email flows, start the server with `RESEND_API_KEY=dev-log` in `.dev.vars` and run `bash tests/trust_test.sh http://127.0.0.1:8788 devlog <path-to-dev-server-log>`. Test accounts all use `@example.com` addresses.

## Deployment

```bash
npx wrangler d1 migrations apply global-neighbors-db --remote   # only when migrations/ changed
npx wrangler pages deploy
```

## Not yet built

- Email is built but not switched on: it needs a Resend account and a domain (see above). Email notifications would build on it.
- Web push (alerts when the site is closed) needs a service worker and VAPID keys. Browser alerts currently work only while a tab is open.
- Partnership requests, resource listings, and blueprint sharing from the prototype still exist only in `demo.html`.
- The privacy policy and terms were drafted for this prototype. Have them reviewed by someone qualified before a wide launch.
