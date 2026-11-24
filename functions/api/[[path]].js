// Global Neighbors API — Cloudflare Pages Function backed by D1 (binding: DB).
// Every route lives under /api/*. Responses are JSON; auth is a session cookie.
//
// Optional environment:
//   RESEND_API_KEY, MAIL_FROM  — enable verification and password-reset emails (via Resend)
//   CONTACT_EMAIL              — shown in user-facing messages

const SESSION_COOKIE = 'gn_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;          // Workers' WebCrypto caps PBKDF2 at 100k
const MAX_BODY_BYTES = 20 * 1024;
const HOUR = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 30;
const MAX_SIGNUPS_PER_IP_PER_HOUR = 10;
const VERIFY_TOKEN_TTL_MS = 24 * HOUR;
const RESET_TOKEN_TTL_MS = HOUR;
const ADMIN_RESET_TOKEN_TTL_MS = 24 * HOUR;
const MAX_REPORTS_PER_DAY = 20;
const MAX_UPLOAD_BODY_BYTES = 1600 * 1024;
const MEDIA_LIMITS = { avatar: 300 * 1024, banner: 900 * 1024 };   // after browser-side resizing
const MAX_UPLOADS_PER_HOUR = 20;
const BANNER_PRESETS = ['harbor', 'sunrise', 'meadow', 'dusk', 'sand', 'night'];
const DAY = 24 * HOUR;
// Features the app reports for usage analytics (never content).
const FEATURES = [
  'help_board', 'post_view', 'post_create', 'reply', 'message', 'directory', 'org_view', 'member_view',
  'my_profile', 'profile_edit', 'photo_upload', 'search', 'report', 'block', 'admin', 'signup_prompt', 'guest_draft',
  'notifications', 'feedback', 'signup_nudge', 'signup_click', 'commit', 'complete', 'rating'
];
const NOTIFICATION_RETENTION_MS = 90 * DAY;
const FEEDBACK_KINDS = ['idea', 'problem', 'category', 'other'];
const MAX_FEEDBACK_PER_IP_PER_HOUR = 10;
const ACTIVITY_RETENTION_MS = 180 * DAY;
const MAX_ACTIVE_MS_PER_PING = 70 * 1000;
const MAX_NEW_SESSIONS_PER_IP_PER_HOUR = 120;
// Landing page (/start). 'only' shows everyone one version; null splits visitors between A and B.
// LANDING_ACTIVE must match EXP in public/start.html. Use a new key for a fresh test.
const LANDING_EXPERIMENTS = { 'solo-b': { only: 'B' }, vp1: { only: null } };
const LANDING_ACTIVE = 'solo-b';
const LANDING_EVENTS = ['cta:hero-person', 'cta:hero-org', 'cta:elder', 'cta:need', 'cta:offer', 'cta:org', 'cta:promise', 'cta:final-person', 'cta:final-org', 'guest', 'scroll'];
const LANDING_TARGET_PER_VARIANT = 200;             // set before the test starts; see README for the math
const MAX_LANDING_VISITORS_PER_IP_PER_HOUR = 300;   // campus networks share one address
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp/i;

const REGIONS = ['Greater Boston', 'North America', 'Latin America', 'Africa', 'South Asia', 'Global'];
const CATEGORIES = [
  'Groceries & errands', 'Elder care & companionship', 'Clean water & sanitation', 'Food & meals',
  'Housing & repairs', 'Health & medical', 'Education & tutoring', 'Transportation & rides',
  'Jobs & livelihoods', 'Legal & paperwork', 'Disaster & emergency', 'Energy & solar', 'Tech & skills',
  // Added after member feedback asked for more inclusive categories (Oct 2026).
  'Childcare & family', 'Pets & animals', 'Emotional support & wellbeing', 'Moving & heavy lifting',
  'Translation & interpretation', 'Clothing & household items', 'Mentoring & career advice',
  'Arts, music & culture', 'Sports & recreation', 'Community events & organizing', 'Environment & cleanup',
  'Small business & entrepreneurship', 'Other'
];
const CAUSES = [
  'Community Health', 'Disability & Access', 'Disaster Response', 'Economic Development', 'Education',
  'Elder Care', 'Environment', 'Food Security', 'Global Health', 'Housing', 'Immigrant & Refugee Services',
  'Legal Aid', 'Logistics', 'Volunteer Mobilization', 'Water & Sanitation', 'Workforce Development',
  'Youth Development'
];
const SCALES = ['Neighborhood', 'Village', 'City', 'Region', 'Remote'];
const URGENCIES = ['Ongoing', 'Urgent', 'This week', 'This month', 'Hiring now', 'Flexible'];
const PAY_KINDS = ['volunteer', 'paid', 'stipend', 'funding'];
const REPORT_REASONS = [
  'Scam or fraud', 'Harassment or hate', 'Unsafe or exploitative request', 'Spam',
  'Impersonation or fake organization', 'Inappropriate content', 'Other'
];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- entry point ---------- */

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    if (!env.DB) throw new Error('D1 binding "DB" is not configured');
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') checkCsrf(request, url);

    const seg = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
    const ctx = { request, env, url, method, seg };
    const route = seg.join('/');

    if (seg[0] === 'media' && seg.length === 2 && method === 'GET') return await serveMedia(ctx, seg[1]);
    if (route === 'activity' && method === 'POST') return await recordActivity(ctx);
    if (route === 'landing' && method === 'POST') return await recordLanding(ctx);
    if (route === 'stats' && method === 'GET') return await publicStats(ctx);
    if (route === 'feedback' && method === 'POST') return await createFeedback(ctx);
    if (route === 'notifications' && method === 'GET') return await listNotifications(ctx);
    if (route === 'notifications/read' && method === 'POST') return await readNotifications(ctx);
    if (route === 'config' && method === 'GET') return json({ emailEnabled: emailEnabled(env), contactEmail: contact(env) });

    // Auth
    if (route === 'auth/signup' && method === 'POST') return await signup(ctx);
    if (route === 'auth/login' && method === 'POST') return await login(ctx);
    if (route === 'auth/logout' && method === 'POST') return await logout(ctx);
    if (route === 'auth/verify/send' && method === 'POST') return await sendVerification(ctx);
    if (route === 'auth/verify' && method === 'POST') return await verifyEmail(ctx);
    if (route === 'auth/forgot' && method === 'POST') return await forgotPassword(ctx);
    if (route === 'auth/reset' && method === 'POST') return await resetPassword(ctx);

    // Current user
    if (route === 'me' && method === 'GET') return await getMe(ctx);
    if (route === 'me' && method === 'PATCH') return await updateMe(ctx);
    if (route === 'me' && method === 'DELETE') return await deleteMe(ctx);
    if (route === 'me/password' && method === 'POST') return await changePassword(ctx);
    if (route === 'me/verification' && method === 'GET') return await getMyVerification(ctx);
    if (route === 'me/verification' && method === 'POST') return await requestVerification(ctx);
    if (seg[0] === 'me' && seg[1] === 'media' && seg.length === 3 && ['avatar', 'banner'].includes(seg[2])) {
      if (method === 'POST') return await uploadMedia(ctx, seg[2]);
      if (method === 'DELETE') return await deleteMedia(ctx, seg[2]);
    }

    // Directory & profiles
    if (route === 'orgs' && method === 'GET') return await listOrgs(ctx);
    if (seg[0] === 'users' && seg.length === 2 && method === 'GET') return await getUser(ctx, seg[1]);

    // Help Board
    if (route === 'help' && method === 'GET') return await listHelp(ctx);
    if (route === 'help' && method === 'POST') return await createHelp(ctx);
    if (seg[0] === 'help' && seg.length === 2) {
      if (method === 'GET') return await getHelp(ctx, seg[1]);
      if (method === 'PATCH') return await updateHelp(ctx, seg[1]);
      if (method === 'DELETE') return await deleteHelp(ctx, seg[1]);
    }
    if (seg[0] === 'help' && seg.length === 3 && method === 'POST') {
      if (seg[2] === 'replies') return await createReply(ctx, seg[1]);
      if (seg[2] === 'complete') return await completeHelp(ctx, seg[1]);
      if (seg[2] === 'update') return await postUpdate(ctx, seg[1]);
    }
    if (seg[0] === 'replies' && seg.length === 3 && method === 'POST') {
      if (seg[2] === 'messages') return await createMessage(ctx, seg[1]);
      if (seg[2] === 'commit') return await commitReply(ctx, seg[1]);
      if (seg[2] === 'withdraw') return await withdrawReply(ctx, seg[1]);
      if (seg[2] === 'decline') return await declineReply(ctx, seg[1]);
      if (seg[2] === 'rating') return await createRating(ctx, seg[1]);
    }

    // Safety
    if (route === 'reports' && method === 'POST') return await createReport(ctx);
    if (route === 'blocks' && method === 'GET') return await listBlocks(ctx);
    if (route === 'blocks' && method === 'POST') return await createBlock(ctx);
    if (seg[0] === 'blocks' && seg.length === 2 && method === 'DELETE') return await deleteBlock(ctx, seg[1]);

    // Admin
    if (seg[0] === 'admin') {
      if (route === 'admin/overview' && method === 'GET') return await adminOverview(ctx);
      if (route === 'admin/reports' && method === 'GET') return await adminListReports(ctx);
      if (seg[1] === 'reports' && seg.length === 3 && method === 'POST') return await adminResolveReport(ctx, seg[2]);
      if (route === 'admin/verifications' && method === 'GET') return await adminListVerifications(ctx);
      if (seg[1] === 'verifications' && seg.length === 3 && method === 'POST') return await adminReviewVerification(ctx, seg[2]);
      if (route === 'admin/users' && method === 'GET') return await adminListUsers(ctx);
      if (seg[1] === 'users' && seg.length === 3 && method === 'POST') return await adminUserAction(ctx, seg[2]);
      if (seg[1] === 'posts' && seg.length === 3 && method === 'POST') return await adminPostAction(ctx, seg[2]);
      if (seg[1] === 'ratings' && seg.length === 3 && method === 'POST') return await adminRatingAction(ctx, seg[2]);
      if (route === 'admin/activity' && method === 'GET') return await adminActivity(ctx);
      if (route === 'admin/landing' && method === 'GET') return await adminLanding(ctx);
      if (route === 'admin/feedback' && method === 'GET') return await adminListFeedback(ctx);
      if (seg[1] === 'feedback' && seg.length === 3 && method === 'POST') return await adminUpdateFeedback(ctx, seg[2]);
      if (seg[1] === 'activity' && seg[2] === 'users' && seg.length === 4 && method === 'GET') return await adminActivityUser(ctx, seg[3]);
    }

    throw new HttpError(404, 'Not found.');
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err && err.stack || err);
    return json({ error: 'Something went wrong on our end. Please try again.' }, 500);
  }
}

/* ---------- auth routes ---------- */

async function signup(ctx) {
  const { env, request } = ctx;
  const ip = clientIp(request);
  const now = Date.now();
  const recent = await countAttempts(env, 'signup-ip:' + ip, now - HOUR);
  if (recent >= MAX_SIGNUPS_PER_IP_PER_HOUR) throw new HttpError(429, 'Too many sign-ups from this network. Please try again later.');

  const body = await readJson(request);
  if (body.acceptTerms !== true) throw new HttpError(400, 'Please confirm you’re 18 or older and agree to the Terms and Privacy Policy.');
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  validatePassword(password);
  const accountType = oneOf(body.accountType, ['person', 'org'], 'Account type');
  const displayName = text(body.displayName, 80, accountType === 'org' ? 'Organization name' : 'Name', true);
  const location = text(body.location, 100, 'Location');
  const region = oneOf(body.region || 'Greater Boston', REGIONS, 'Region');
  const headline = text(body.headline, 120, 'Headline');

  const existing = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (existing) throw new HttpError(409, 'An account with that email already exists. Try logging in instead.');

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, account_type, display_name, headline, location, region, terms_accepted_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, email, hash, accountType, displayName, headline, location, region, now, now, now),
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind('signup-ip:' + ip, now)
  ]);
  const cookie = await createSession(env, id, ctx.url);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  // Counting a landing-page conversion must never get in the way of signing up.
  try { await recordLandingSignup(env, body.landingId, accountType, now); } catch (e) { console.error('landing signup not counted', e); }
  let verificationSent = false;
  if (emailEnabled(env)) {
    try { await emailVerificationLink(ctx, user); verificationSent = true; } catch (e) { console.error('verification email failed', e); }
  }
  return json({ user: privateUser(user), verificationSent }, 201, { 'Set-Cookie': cookie });
}

async function login(ctx) {
  const { env, request } = ctx;
  const body = await readJson(request);
  const email = normalizeEmail(body.email, false);
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = clientIp(request);
  const now = Date.now();
  const since = now - LOGIN_WINDOW_MS;

  const [emailFails, ipFails] = await Promise.all([
    countAttempts(env, 'email:' + email, since),
    countAttempts(env, 'ip:' + ip, since)
  ]);
  if (emailFails >= MAX_FAILS_PER_EMAIL || ipFails >= MAX_FAILS_PER_IP) {
    throw new HttpError(429, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }

  const user = email ? await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() : null;
  // Always run a hash so response time doesn't reveal whether the email exists.
  const ok = user ? await verifyPassword(password, user.password_hash) : (await hashPassword(password || 'x'), false);

  if (!ok) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind('email:' + email, now),
      env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind('ip:' + ip, now),
      env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(now - 24 * HOUR)
    ]);
    throw new HttpError(401, 'That email and password don’t match an account.');
  }
  if (user.suspended_at) throw new HttpError(403, `This account has been suspended. If you think this is a mistake, contact ${contact(env)}.`);

  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind('email:' + email).run();
  const cookie = await createSession(env, user.id, ctx.url);
  return json({ user: privateUser(user) }, 200, { 'Set-Cookie': cookie });
}

async function logout(ctx) {
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (token) await ctx.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(ctx.url) });
}

async function sendVerification(ctx) {
  const user = await requireUser(ctx);
  if (!emailEnabled(ctx.env)) throw new HttpError(400, 'Email isn’t set up on Global Neighbors yet.');
  if (user.email_verified_at) return json({ ok: true, alreadyVerified: true });
  const key = 'verify-send:' + user.id;
  if (await countAttempts(ctx.env, key, Date.now() - HOUR) >= 3) throw new HttpError(429, 'We’ve sent a few emails already. Please check your inbox (and spam folder) or try again in an hour.');
  await ctx.env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(key, Date.now()).run();
  await emailVerificationLink(ctx, user);
  return json({ ok: true });
}

async function verifyEmail(ctx) {
  const body = await readJson(ctx.request);
  const userId = await consumeToken(ctx.env, String(body.token || ''), 'verify');
  await ctx.env.DB.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
    .bind(Date.now(), Date.now(), userId).run();
  const viewer = await currentUser(ctx);
  const fresh = viewer && viewer.id === userId ? await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first() : null;
  return json({ ok: true, user: fresh ? privateUser(fresh) : null });
}

async function forgotPassword(ctx) {
  const { env, request } = ctx;
  if (!emailEnabled(env)) {
    throw new HttpError(400, `Password reset by email isn’t available yet. Email ${contact(env)} from the address on your account and we’ll send you a reset link.`);
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const now = Date.now();
  const ipKey = 'forgot-ip:' + clientIp(request), emailKey = 'forgot:' + email;
  const [ipCount, emailCount] = await Promise.all([countAttempts(env, ipKey, now - HOUR), countAttempts(env, emailKey, now - HOUR)]);
  if (ipCount >= 10) throw new HttpError(429, 'Too many requests. Please try again later.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(ipKey, now),
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(emailKey, now)
  ]);
  // Same response whether or not the account exists, so this can't be used to discover members.
  if (emailCount < 3) {
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND suspended_at IS NULL').bind(email).first();
    if (user) {
      const token = await issueToken(env, user.id, 'reset', RESET_TOKEN_TTL_MS);
      const link = `${ctx.url.origin}/#/reset/${token}`;
      await sendEmail(env, user.email, 'Reset your Global Neighbors password',
        `Hi ${user.display_name},\n\nSomeone (hopefully you) asked to reset your Global Neighbors password. Use this link within the next hour:\n\n${link}\n\nIf you didn’t ask for this, you can ignore this email; your password won’t change.\n\n— Global Neighbors`);
    }
  }
  return json({ ok: true });
}

async function resetPassword(ctx) {
  const { env } = ctx;
  const body = await readJson(ctx.request);
  const password = typeof body.password === 'string' ? body.password : '';
  validatePassword(password);
  const userId = await consumeToken(env, String(body.token || ''), 'reset');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) throw new HttpError(400, 'This link is invalid or has expired.');
  if (user.suspended_at) throw new HttpError(403, `This account has been suspended. Contact ${contact(env)}.`);
  const hash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(hash, Date.now(), userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind('email:' + user.email)
  ]);
  const cookie = await createSession(env, userId, ctx.url);
  return json({ user: privateUser(user) }, 200, { 'Set-Cookie': cookie });
}

/* ---------- current user ---------- */

async function getMe(ctx) {
  const user = await currentUser(ctx);
  return json({ user: user ? privateUser(user) : null });
}

async function updateMe(ctx) {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);
  const f = {
    display_name: body.displayName !== undefined ? text(body.displayName, 80, 'Name', true) : user.display_name,
    headline: body.headline !== undefined ? text(body.headline, 120, 'Headline') : user.headline,
    location: body.location !== undefined ? text(body.location, 100, 'Location') : user.location,
    region: body.region !== undefined ? oneOf(body.region, REGIONS, 'Region') : user.region,
    bio: body.bio !== undefined ? text(body.bio, 2000, 'About') : user.bio,
    website: body.website !== undefined ? websiteUrl(body.website) : user.website,
    causes: body.causes !== undefined ? JSON.stringify(causeList(body.causes)) : user.causes,
    pronouns: body.pronouns !== undefined ? text(body.pronouns, 40, 'Pronouns') : user.pronouns,
    languages: body.languages !== undefined ? JSON.stringify(tagList(body.languages, 6, 30, 'Languages')) : user.languages,
    skills: body.skills !== undefined ? JSON.stringify(tagList(body.skills, 10, 40, 'Ways you can help')) : user.skills,
    banner_preset: body.bannerPreset !== undefined ? oneOf(body.bannerPreset, BANNER_PRESETS, 'Banner') : user.banner_preset
  };
  // A verified badge belongs to a specific name; renaming sends the org back through review.
  const status = (user.verification_status === 'verified' && f.display_name !== user.display_name) ? 'none' : user.verification_status;
  const now = Date.now();
  await ctx.env.DB.prepare(`UPDATE users SET display_name=?, headline=?, location=?, region=?, bio=?, website=?, causes=?,
                              pronouns=?, languages=?, skills=?, banner_preset=?, verification_status=?, updated_at=? WHERE id=?`)
    .bind(f.display_name, f.headline, f.location, f.region, f.bio, f.website, f.causes,
          f.pronouns, f.languages, f.skills, f.banner_preset, status, now, user.id).run();
  const fresh = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json({ user: privateUser(fresh), verificationReset: status !== user.verification_status });
}

async function changePassword(ctx) {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);
  if (!(await verifyPassword(String(body.currentPassword || ''), user.password_hash))) {
    throw new HttpError(403, 'Your current password is incorrect.');
  }
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';
  validatePassword(next);
  const hash = await hashPassword(next);
  // Sign out every other device, keep this one.
  const keep = await sha256Hex(getCookie(ctx.request, SESSION_COOKIE));
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').bind(hash, Date.now(), user.id),
    ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.id, keep)
  ]);
  return json({ ok: true });
}

async function deleteMe(ctx) {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);
  if (!(await verifyPassword(String(body.password || ''), user.password_hash))) {
    throw new HttpError(403, 'Password is incorrect. Your account was not deleted.');
  }
  const db = ctx.env.DB;
  // Explicit deletes (children first) so removal doesn't depend on foreign-key enforcement.
  // Reports about this member are kept as moderation records; reports they filed lose their reporter link.
  await db.batch([
    db.prepare(`DELETE FROM help_messages WHERE user_id=?1
                  OR reply_id IN (SELECT id FROM help_replies WHERE user_id=?1)
                  OR reply_id IN (SELECT r.id FROM help_replies r JOIN help_posts p ON p.id=r.post_id WHERE p.author_id=?1)`).bind(user.id),
    db.prepare('DELETE FROM help_replies WHERE user_id=?1 OR post_id IN (SELECT id FROM help_posts WHERE author_id=?1)').bind(user.id),
    db.prepare('DELETE FROM help_posts WHERE author_id=?').bind(user.id),
    db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM auth_tokens WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM media WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM activity_events WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM notifications WHERE user_id=?1 OR actor_id=?1').bind(user.id),
    db.prepare('DELETE FROM ratings WHERE rater_id=?1 OR ratee_id=?1').bind(user.id),
    db.prepare('UPDATE feedback SET user_id=NULL WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM activity_sessions WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM blocks WHERE blocker_id=?1 OR blocked_id=?1').bind(user.id),
    db.prepare('DELETE FROM org_verifications WHERE user_id=?').bind(user.id),
    db.prepare('UPDATE reports SET reporter_id=NULL WHERE reporter_id=?').bind(user.id),
    db.prepare('DELETE FROM login_attempts WHERE key=?').bind('email:' + user.email),
    db.prepare('DELETE FROM users WHERE id=?').bind(user.id)
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(ctx.url) });
}

/* ---------- organization verification ---------- */

function verificationRow(v) {
  return v ? {
    id: v.id, legalName: v.legal_name, registrationNumber: v.registration_number, country: v.country,
    website: v.website, contactRole: v.contact_role, notes: v.notes, status: v.status,
    createdAt: v.created_at, reviewedAt: v.reviewed_at, reviewNote: v.review_note
  } : null;
}

async function getMyVerification(ctx) {
  const user = await requireUser(ctx);
  const v = await ctx.env.DB.prepare('SELECT * FROM org_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first();
  return json({ verification: verificationRow(v) });
}

async function requestVerification(ctx) {
  const user = await requireActive(ctx);
  if (user.account_type !== 'org') throw new HttpError(400, 'Only organization accounts can request verification.');
  if (user.verification_status === 'verified') throw new HttpError(400, 'Your organization is already verified.');
  if (user.verification_status === 'pending') throw new HttpError(409, 'Your verification request is already being reviewed.');
  const b = await readJson(ctx.request);
  const now = Date.now();
  const v = {
    id: crypto.randomUUID(),
    legal: text(b.legalName, 150, 'Legal name', true),
    reg: text(b.registrationNumber, 60, 'Registration number', true),
    country: text(b.country, 60, 'Country', true),
    website: websiteUrl(b.website || ''),
    role: text(b.contactRole, 100, 'Your role', true),
    notes: text(b.notes, 1500, 'Notes')
  };
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO org_verifications (id, user_id, legal_name, registration_number, country, website, contact_role, notes, status, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(v.id, user.id, v.legal, v.reg, v.country, v.website, v.role, v.notes, now),
    ctx.env.DB.prepare("UPDATE users SET verification_status='pending', updated_at=? WHERE id=?").bind(now, user.id)
  ]);
  return getMyVerification(ctx);
}

/* ---------- directory & profiles ---------- */

async function listOrgs(ctx) {
  const { results } = await ctx.env.DB.prepare(
    `SELECT u.*, ${RATING_COLS('u')} FROM users u WHERE u.account_type='org' AND u.suspended_at IS NULL ORDER BY u.display_name COLLATE NOCASE LIMIT 500`
  ).all();
  return json({ orgs: results.map(publicUser) });
}

async function getUser(ctx, id) {
  const viewer = await currentUser(ctx);
  const user = await ctx.env.DB.prepare(`SELECT u.*, ${RATING_COLS('u')} FROM users u WHERE u.id = ?`).bind(id).first();
  const admin = viewer && viewer.is_admin;
  // Organization profiles are public; individuals are visible to signed-in members only.
  if (!user || (user.account_type === 'person' && !viewer) || (user.suspended_at && !admin)) throw new HttpError(404, 'Profile not found.');
  if (viewer && !admin && await isBlocked(ctx.env, viewer.id, id)) throw new HttpError(404, 'Profile not found.');
  let posts = [];
  if (viewer) {
    const { results } = await ctx.env.DB.prepare(helpSelect('p.author_id = ?2')).bind(viewer.id, id).all();
    posts = results.map(r => helpRow(r, viewer.id));
  }
  const iBlocked = viewer ? !!(await ctx.env.DB.prepare('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?').bind(viewer.id, id).first()) : false;
  return json({ user: publicUser(user), posts, blockedByMe: iBlocked, ratings: viewer ? await ratingsAbout(ctx.env.DB, id) : [] });
}

/* ---------- help board ---------- */
//
// Replies start a conversation ('talking'). A spot fills only when the helper commits:
// the replier on an "ask", or the poster on an "offer". Post status is derived from commitments:
// open (none) → in-progress (some, maybe full) → resolved (poster marked it complete).

const RATING_COLS = alias => `
  (SELECT ROUND(AVG(g.stars), 1) FROM ratings g WHERE g.ratee_id = ${alias}.id AND g.hidden_at IS NULL) AS rating_avg,
  (SELECT COUNT(*) FROM ratings g WHERE g.ratee_id = ${alias}.id AND g.hidden_at IS NULL) AS rating_count`;
const COMMITTED = "('committed','completed')";

function ratingOf(r) { return { avg: r.rating_avg == null ? null : Number(r.rating_avg), count: r.rating_count || 0 }; }
// First name and last initial, for showing helpers to people other than the poster. Organizations keep their name.
function shortName(name, accountType) {
  if (accountType === 'org') return name;
  const w = String(name || '').trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1].charAt(0)}.` : w[0];
}

// Posts a viewer (?1) may see: not hidden by moderators (unless theirs), author not suspended,
// and no block in either direction. Admins reviewing reports skip those filters.
function helpSelect(extra, opts = {}) {
  const conds = [];
  if (!opts.admin) {
    conds.push('(p.hidden_at IS NULL OR p.author_id = ?1)');
    conds.push('u.suspended_at IS NULL');
    conds.push(`NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ?1 AND b.blocked_id = p.author_id)
                                                 OR (b.blocker_id = p.author_id AND b.blocked_id = ?1))`);
  }
  if (extra) conds.push(extra);
  return `SELECT p.*, u.display_name AS author_name, u.account_type AS author_type, u.headline AS author_headline,
            u.verification_status AS author_verification, u.avatar_id AS author_avatar, ${RATING_COLS('u')},
            (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = p.id) AS reply_count,
            (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = p.id AND r.status IN ${COMMITTED}) AS committed_count,
            (SELECT r.status FROM help_replies r WHERE r.post_id = p.id AND r.user_id = ?1) AS my_reply_status,
            (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = p.id AND r.status = 'completed'
               AND (r.user_id = ?1 OR p.author_id = ?1)
               AND NOT EXISTS (SELECT 1 FROM ratings g WHERE g.reply_id = r.id AND g.rater_id = ?1)) AS ratings_due
          FROM help_posts p JOIN users u ON u.id = p.author_id
          ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
          ORDER BY p.created_at DESC LIMIT 300`;
}

function helpRow(r, viewerId) {
  const needed = r.helpers_needed || 1, committed = r.committed_count || 0;
  return {
    id: r.id,
    author: { id: r.author_id, name: r.author_name, accountType: r.author_type, headline: r.author_headline,
              verified: r.author_verification === 'verified', avatarUrl: mediaUrl(r.author_avatar), rating: ratingOf(r) },
    type: r.type, category: r.category, categoryNote: r.category_note || '', scale: r.scale, title: r.title, detail: r.detail,
    location: r.location, region: r.region, pay: { kind: r.pay_kind, label: r.pay_label },
    urgency: r.urgency, status: r.status, createdAt: r.created_at, hidden: !!r.hidden_at,
    helpersNeeded: needed, committedCount: committed,
    whenDate: r.when_date || null, whenTime: r.when_time || null, editedAt: r.edited_at || null,
    spotsLeft: r.status === 'resolved' ? 0 : Math.max(0, needed - committed),
    full: r.status !== 'resolved' && committed >= needed,
    replyCount: r.reply_count, myReplyStatus: r.my_reply_status || null, ratingsDue: r.ratings_due || 0,
    isMine: r.author_id === viewerId
  };
}

async function listHelp(ctx) {
  const user = await requireUser(ctx);
  const view = ctx.url.searchParams.get('view') || 'browse';
  const where = view === 'mine' ? 'p.author_id = ?1'
    : view === 'helping' ? 'EXISTS (SELECT 1 FROM help_replies r WHERE r.post_id = p.id AND r.user_id = ?1)'
    : '';
  const { results } = await ctx.env.DB.prepare(helpSelect(where)).bind(user.id).all();
  return json({ posts: results.map(r => helpRow(r, user.id)) });
}

async function loadPost(ctx, id, viewer) {
  const row = await ctx.env.DB.prepare(helpSelect('p.id = ?2', { admin: !!viewer.is_admin })).bind(viewer.id, id).first();
  if (!row) throw new HttpError(404, 'That post isn’t available.');
  return row;
}

async function getHelp(ctx, id) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const post = helpRow(await loadPost(ctx, id, user), user.id);
  post.helperIsReplier = post.type === 'ask';

  // Only the post's author sees every reply (minus blocked or suspended members); everyone else sees only their own.
  const filter = post.isMine
    ? `r.post_id = ?1 AND u.suspended_at IS NULL AND NOT EXISTS (SELECT 1 FROM blocks b
         WHERE (b.blocker_id = ?2 AND b.blocked_id = r.user_id) OR (b.blocker_id = r.user_id AND b.blocked_id = ?2))`
    : 'r.post_id = ?1 AND r.user_id = ?2';
  const [{ results: replies }, { results: team }] = await db.batch([
    db.prepare(
      `SELECT r.*, u.display_name, u.account_type, u.headline, u.location, u.verification_status, u.avatar_id, ${RATING_COLS('u')},
              (SELECT g.stars FROM ratings g WHERE g.reply_id = r.id AND g.rater_id = ?2) AS my_stars,
              (SELECT g.stars FROM ratings g WHERE g.reply_id = r.id AND g.rater_id <> ?2) AS their_stars
         FROM help_replies r JOIN users u ON u.id = r.user_id
        WHERE ${filter} ORDER BY r.created_at`).bind(id, user.id),
    // Everyone committed to this post (shown to participants; non-posters see short names only).
    db.prepare(
      `SELECT r.user_id, r.status, r.committed_at, u.display_name, u.account_type, u.avatar_id, ${RATING_COLS('u')}
         FROM help_replies r JOIN users u ON u.id = r.user_id
        WHERE r.post_id = ?1 AND r.status IN ${COMMITTED} AND u.suspended_at IS NULL ORDER BY r.committed_at`).bind(id)
  ]);

  let messages = [];
  if (replies.length) {
    const ph = replies.map(() => '?').join(',');
    ({ results: messages } = await db.prepare(
      `SELECT m.*, u.display_name FROM help_messages m JOIN users u ON u.id = m.user_id
        WHERE m.reply_id IN (${ph}) ORDER BY m.created_at`
    ).bind(...replies.map(r => r.id)).all());
  }

  const participant = post.isMine || replies.some(r => r.user_id === user.id);
  post.committed = participant ? team.map(t => ({
    name: post.isMine || t.user_id === user.id ? t.display_name : shortName(t.display_name, t.account_type),
    isMe: t.user_id === user.id, status: t.status, committedAt: t.committed_at,
    ...(post.isMine ? { id: t.user_id, rating: ratingOf(t), avatarUrl: mediaUrl(t.avatar_id), accountType: t.account_type } : {})
  })) : [];

  post.replies = replies.map(r => ({
    id: r.id, status: r.status, text: r.text, createdAt: r.created_at, isMine: r.user_id === user.id,
    committedAt: r.committed_at, endedAt: r.ended_at, endedBy: r.ended_by === user.id ? 'me' : (r.ended_by ? 'them' : null),
    canMessage: !['declined', 'withdrawn'].includes(r.status) && !post.hidden,
    canRate: r.status === 'completed' && r.my_stars == null,
    myStars: r.my_stars, theirStars: r.their_stars,
    user: { id: r.user_id, name: r.display_name, accountType: r.account_type, headline: r.headline, location: r.location,
            verified: r.verification_status === 'verified', avatarUrl: mediaUrl(r.avatar_id), rating: ratingOf(r) },
    messages: messages.filter(m => m.reply_id === r.id).map(m => ({
      id: m.id, text: m.text, createdAt: m.created_at, isMine: m.user_id === user.id, from: m.display_name
    }))
  }));
  return json({ post });
}

function helpersNeededValue(v) {
  const n = Number(v === undefined || v === null || v === '' ? 1 : v);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new HttpError(400, 'Number of helpers must be between 1 and 20.');
  return n;
}

async function createHelp(ctx) {
  const user = await requireActive(ctx);
  const b = await readJson(ctx.request);
  const now = Date.now();
  const id = crypto.randomUUID();
  const category = oneOf(b.category, CATEGORIES, 'Category');
  const categoryNote = category === 'Other' ? text(b.categoryNote, 40, 'Category description', true) : '';
  const when = whenValues(b, { allowPast: false });
  await ctx.env.DB.prepare(
    `INSERT INTO help_posts (id, author_id, type, category, category_note, scale, title, detail, location, region, pay_kind, pay_label, urgency, helpers_needed, when_date, when_time, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).bind(
    id, user.id,
    oneOf(b.type, ['ask', 'offer'], 'Post type'),
    category, categoryNote,
    oneOf(b.scale, SCALES, 'Reach'),
    text(b.title, 120, 'Title', true),
    text(b.detail, 3000, 'Details', true),
    text(b.location, 100, 'Location', true),
    oneOf(b.region, REGIONS, 'Region'),
    oneOf(b.payKind, PAY_KINDS, 'Compensation'),
    text(b.payLabel, 60, 'Amount'),
    oneOf(b.urgency, URGENCIES, 'Timing'),
    helpersNeededValue(b.helpersNeeded),
    when.date, when.time,
    now, now
  ).run();
  return json({ post: helpRow(await loadPost(ctx, id, user), user.id) }, 201);
}

// Re-derive a post's status from its commitments (resolved stays resolved).
function recomputeStmt(db, postId) {
  return db.prepare(`UPDATE help_posts SET updated_at = ?2, status = CASE
      WHEN status = 'resolved' THEN 'resolved'
      WHEN (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = ?1 AND r.status = 'committed') > 0 THEN 'in-progress'
      ELSE 'open' END WHERE id = ?1`).bind(postId, Date.now());
}

// Usage analytics for key milestones, logged server-side so they're recorded even if the tab closes.
function eventStmt(db, userId, feature) {
  return db.prepare('INSERT INTO activity_events (session_id, user_id, feature, created_at) VALUES (?, ?, ?, ?)')
    .bind('server', userId, feature, Date.now());
}

async function loadOwnPost(ctx, id, user) {
  const post = await ctx.env.DB.prepare('SELECT * FROM help_posts WHERE id = ?').bind(id).first();
  if (!post) throw new HttpError(404, 'That post isn’t available.');
  if (post.author_id !== user.id) throw new HttpError(403, 'Only the person who posted this can change it.');
  return post;
}

// Optional date ("YYYY-MM-DD") and time ("HH:MM") a task happens or is needed by, in the poster's local terms.
function whenValues(b, { allowPast }) {
  const date = b.whenDate == null || b.whenDate === '' ? null : String(b.whenDate);
  const time = b.whenTime == null || b.whenTime === '' ? null : String(b.whenTime);
  if (date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new HttpError(400, 'Please choose a valid date.');
    // Allow a day of slack for time zones; nothing more than two years out.
    if (!allowPast && d.getTime() < Date.now() - 2 * DAY) throw new HttpError(400, 'That date has already passed.');
    if (d.getTime() > Date.now() + 730 * DAY) throw new HttpError(400, 'Please choose a date within the next two years.');
  }
  if (time) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, 'Please choose a valid time.');
    if (!date) throw new HttpError(400, 'Add a date to go with the time.');
  }
  return { date, time };
}

// The poster can change anything about their post. Two guards protect people already involved:
// ask ↔ offer only before anyone has replied (it flips who the helper is), and the number of
// helpers never below the number already committed. Participants are told about content edits.
async function updateHelp(ctx, id) {
  const user = await requireActive(ctx);
  const db = ctx.env.DB;
  const b = await readJson(ctx.request);
  const post = await loadOwnPost(ctx, id, user);
  const resolved = post.status === 'resolved';
  const sets = [], vals = [];
  // Only real changes count: resaving the form unchanged doesn't mark the post edited or notify anyone.
  const set = (col, v) => {
    if (!['edited_at', 'updated_at'].includes(col) && (post[col] ?? null) === (v ?? null)) return;
    sets.push(`${col} = ?`); vals.push(v);
  };

  if (b.title !== undefined) set('title', text(b.title, 120, 'Title', true));
  if (b.detail !== undefined) set('detail', text(b.detail, 3000, 'Details', true));
  if (b.location !== undefined) set('location', text(b.location, 100, 'Location', true));
  if (b.region !== undefined) set('region', oneOf(b.region, REGIONS, 'Region'));
  if (b.scale !== undefined) set('scale', oneOf(b.scale, SCALES, 'Reach'));
  if (b.urgency !== undefined) set('urgency', oneOf(b.urgency, URGENCIES, 'Timing'));
  if (b.payKind !== undefined) set('pay_kind', oneOf(b.payKind, PAY_KINDS, 'Compensation'));
  if (b.payLabel !== undefined) set('pay_label', text(b.payLabel, 60, 'Amount'));
  if (b.category !== undefined || b.categoryNote !== undefined) {
    const category = b.category !== undefined ? oneOf(b.category, CATEGORIES, 'Category') : post.category;
    set('category', category);
    set('category_note', category === 'Other' ? text(b.categoryNote !== undefined ? b.categoryNote : post.category_note, 40, 'Category description', true) : '');
  }
  if (b.whenDate !== undefined || b.whenTime !== undefined) {
    const w = whenValues({ whenDate: b.whenDate !== undefined ? b.whenDate : post.when_date, whenTime: b.whenTime !== undefined ? b.whenTime : post.when_time },
                        { allowPast: b.whenDate === undefined || b.whenDate === post.when_date });
    set('when_date', w.date); set('when_time', w.time);
  }
  if (b.type !== undefined && b.type !== post.type) {
    const type = oneOf(b.type, ['ask', 'offer'], 'Post type');
    if (resolved) throw new HttpError(400, 'This task is already complete.');
    const replies = await db.prepare('SELECT COUNT(*) AS n FROM help_replies WHERE post_id = ?').bind(id).first();
    if (replies.n) throw new HttpError(409, 'You can’t switch between asking and offering once people have replied. Create a new post instead.');
    set('type', type);
  }
  const contentEdited = sets.length > 0;
  let needed = null;
  if (b.helpersNeeded !== undefined && Number(b.helpersNeeded) !== post.helpers_needed) {
    if (resolved) throw new HttpError(400, 'This task is already complete.');
    needed = helpersNeededValue(b.helpersNeeded);
    set('helpers_needed', needed);
  }
  if (!sets.length) return getHelp(ctx, id);

  const now = Date.now();
  if (contentEdited) set('edited_at', now);
  set('updated_at', now);
  // The helper count can never drop below the number committed; checked in the same statement.
  const guard = needed !== null ? " AND ? >= (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = help_posts.id AND r.status = 'committed')" : '';
  const res = await db.prepare(`UPDATE help_posts SET ${sets.join(', ')} WHERE id = ?${guard}`)
    .bind(...vals, id, ...(needed !== null ? [needed] : [])).run();
  if (!res.meta.changes) throw new HttpError(409, 'You can’t go below the number of people who already committed. Release someone first.');

  if (contentEdited) {
    const { results: people } = await db.prepare("SELECT id, user_id FROM help_replies WHERE post_id = ? AND status IN ('talking','committed')").bind(id).all();
    if (people.length) {
      await db.batch(people.flatMap(p => [
        db.prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'post_edited' AND post_id = ? AND read_at IS NULL").bind(p.user_id, id),
        notifyStmt(db, p.user_id, 'post_edited', { actor: user.id, post: id, reply: p.id })
      ]));
    }
  }
  return getHelp(ctx, id);
}

// The poster marks the task done: every committed reply becomes completed, and both sides are asked to rate.
async function completeHelp(ctx, id) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const post = await loadOwnPost(ctx, id, user);
  if (post.status === 'resolved') throw new HttpError(400, 'This post is already complete.');
  const { results: committed } = await db.prepare("SELECT id, user_id FROM help_replies WHERE post_id = ? AND status = 'committed'").bind(id).all();
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE help_replies SET status = 'completed', ended_at = ? WHERE post_id = ? AND status = 'committed'").bind(now, id),
    db.prepare("UPDATE help_posts SET status = 'resolved', updated_at = ? WHERE id = ?").bind(now, id),
    ...committed.map(c => notifyStmt(db, c.user_id, 'completed', { actor: user.id, post: id, reply: c.id })),
    eventStmt(db, user.id, 'complete')
  ]);
  return getHelp(ctx, id);
}

// One message from the poster to everyone committed, delivered into each one-to-one conversation.
async function postUpdate(ctx, id) {
  const user = await requireActive(ctx);
  const db = ctx.env.DB;
  const post = await loadOwnPost(ctx, id, user);
  if (post.hidden_at) throw new HttpError(400, 'This post was hidden by moderators.');
  const msg = text((await readJson(ctx.request)).text, 2000, 'Update', true);
  const { results: team } = await db.prepare(
    `SELECT r.id, r.user_id FROM help_replies r WHERE r.post_id = ?1 AND r.status IN ${COMMITTED}
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ?2 AND b.blocked_id = r.user_id) OR (b.blocker_id = r.user_id AND b.blocked_id = ?2))`
  ).bind(id, user.id).all();
  if (!team.length) throw new HttpError(400, 'No one has committed yet.');
  const now = Date.now();
  await db.batch(team.flatMap(t => [
    db.prepare('INSERT INTO help_messages (id, reply_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), t.id, user.id, msg, now),
    db.prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'message' AND reply_id = ? AND read_at IS NULL").bind(t.user_id, t.id),
    notifyStmt(db, t.user_id, 'message', { actor: user.id, post: id, reply: t.id })
  ]));
  return json({ ok: true, sent: team.length });
}

async function deleteHelp(ctx, id) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const post = await db.prepare('SELECT author_id FROM help_posts WHERE id = ?').bind(id).first();
  if (!post) throw new HttpError(404, 'That post isn’t available.');
  if (post.author_id !== user.id) throw new HttpError(403, 'Only the person who posted this can delete it.');
  await db.batch([
    // Ratings outlive the post; they just lose the link to it.
    db.prepare('UPDATE ratings SET reply_id = NULL WHERE reply_id IN (SELECT id FROM help_replies WHERE post_id=?)').bind(id),
    db.prepare('DELETE FROM help_messages WHERE reply_id IN (SELECT id FROM help_replies WHERE post_id=?)').bind(id),
    db.prepare('DELETE FROM help_replies WHERE post_id=?').bind(id),
    db.prepare('DELETE FROM help_posts WHERE id=?').bind(id)
  ]);
  return json({ ok: true });
}

async function createReply(ctx, postId) {
  const user = await requireActive(ctx);
  const b = await readJson(ctx.request);
  const post = await ctx.env.DB.prepare('SELECT author_id, status, hidden_at FROM help_posts WHERE id = ?').bind(postId).first();
  if (!post || post.hidden_at) throw new HttpError(404, 'That post isn’t available.');
  if (post.author_id === user.id) throw new HttpError(400, 'You can’t reply to your own post.');
  if (post.status === 'resolved') throw new HttpError(400, 'This task is already complete.');
  if (await isBlocked(ctx.env, user.id, post.author_id)) throw new HttpError(403, 'You can’t reply to this post.');
  const replyText = text(b.text, 2000, 'Reply', true);
  const replyId = crypto.randomUUID();
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO help_replies (id, post_id, user_id, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(replyId, postId, user.id, replyText, 'talking', Date.now()),
      notifyStmt(ctx.env.DB, post.author_id, 'reply', { actor: user.id, post: postId, reply: replyId })
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, 'You’ve already replied to this post.');
    throw e;
  }
  return getHelp(ctx, postId);
}

async function loadReplyWithPost(ctx, replyId) {
  const r = await ctx.env.DB.prepare(
    `SELECT r.*, p.author_id AS post_author_id, p.status AS post_status, p.hidden_at AS post_hidden_at, p.type AS post_type,
            p.helpers_needed, p.title AS post_title
       FROM help_replies r JOIN help_posts p ON p.id = r.post_id WHERE r.id = ?`
  ).bind(replyId).first();
  if (!r) throw new HttpError(404, 'That reply isn’t available.');
  return r;
}
// The helper is the replier on an "ask" and the poster on an "offer".
function helperIdOf(r) { return r.post_type === 'ask' ? r.user_id : r.post_author_id; }
function otherPartyOf(r, userId) { return r.user_id === userId ? r.post_author_id : r.user_id; }
function requireParticipant(r, user) {
  if (r.user_id !== user.id && r.post_author_id !== user.id) throw new HttpError(403, 'You’re not part of this conversation.');
}

async function commitReply(ctx, replyId) {
  const user = await requireActive(ctx);
  const db = ctx.env.DB;
  const r = await loadReplyWithPost(ctx, replyId);
  requireParticipant(r, user);
  if (helperIdOf(r) !== user.id) throw new HttpError(403, 'Only the helper can commit to this task.');
  if (r.post_hidden_at) throw new HttpError(400, 'This post was hidden by moderators.');
  if (r.post_status === 'resolved') throw new HttpError(400, 'This task is already complete.');
  if (r.status !== 'talking') throw new HttpError(409, r.status === 'committed' ? 'You’ve already committed.' : 'This conversation has ended.');
  if (await isBlocked(ctx.env, r.user_id, r.post_author_id)) throw new HttpError(403, 'You can’t commit to this task.');
  // Count and claim in one statement so two people can't take the last spot at the same time.
  const now = Date.now();
  const [res] = await db.batch([
    db.prepare(`UPDATE help_replies SET status = 'committed', committed_at = ?3 WHERE id = ?1 AND status = 'talking'
                  AND (SELECT COUNT(*) FROM help_replies x WHERE x.post_id = ?2 AND x.status = 'committed')
                    < (SELECT helpers_needed FROM help_posts WHERE id = ?2 AND status <> 'resolved')`).bind(replyId, r.post_id, now),
    recomputeStmt(db, r.post_id)
  ]);
  if (!res.meta.changes) throw new HttpError(409, 'This task is full. You can still message them.');
  await db.batch([
    notifyStmt(db, otherPartyOf(r, user.id), 'committed', { actor: user.id, post: r.post_id, reply: replyId }),
    eventStmt(db, user.id, 'commit')
  ]);
  return getHelp(ctx, r.post_id);
}

// The helper backs out, the poster releases a helper, or the requester on an offer cancels.
async function withdrawReply(ctx, replyId) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const r = await loadReplyWithPost(ctx, replyId);
  requireParticipant(r, user);
  if (!['talking', 'committed'].includes(r.status)) throw new HttpError(409, 'This conversation has already ended.');
  if (r.post_status === 'resolved') throw new HttpError(400, 'This task is already complete.');
  const res = await db.prepare("UPDATE help_replies SET status = 'withdrawn', ended_at = ?, ended_by = ? WHERE id = ? AND status IN ('talking','committed')")
    .bind(Date.now(), user.id, replyId).run();
  if (!res.meta.changes) throw new HttpError(409, 'This conversation has already ended.');
  await db.batch([
    recomputeStmt(db, r.post_id),
    notifyStmt(db, otherPartyOf(r, user.id), 'withdrawn', { actor: user.id, post: r.post_id, reply: replyId,
      detail: r.status === 'committed' ? (helperIdOf(r) === user.id ? 'backed_out' : 'released') : 'ended' })
  ]);
  return getHelp(ctx, r.post_id);
}

async function declineReply(ctx, replyId) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const r = await loadReplyWithPost(ctx, replyId);
  if (r.post_author_id !== user.id) throw new HttpError(403, 'Only the person who posted can decline a reply.');
  if (r.status !== 'talking') throw new HttpError(409, r.status === 'committed' ? 'Release this helper instead.' : 'This conversation has already ended.');
  await db.batch([
    db.prepare("UPDATE help_replies SET status = 'declined', ended_at = ?, ended_by = ? WHERE id = ? AND status = 'talking'").bind(Date.now(), user.id, replyId),
    notifyStmt(db, r.user_id, 'declined', { actor: user.id, post: r.post_id, reply: replyId })
  ]);
  return getHelp(ctx, r.post_id);
}

async function createMessage(ctx, replyId) {
  const user = await requireActive(ctx);
  const b = await readJson(ctx.request);
  const r = await loadReplyWithPost(ctx, replyId);
  requireParticipant(r, user);
  if (['declined', 'withdrawn'].includes(r.status)) throw new HttpError(400, 'This conversation has ended.');
  if (r.post_hidden_at) throw new HttpError(400, 'This post was hidden by moderators.');
  const other = otherPartyOf(r, user.id);
  if (await isBlocked(ctx.env, user.id, other)) throw new HttpError(403, 'You can’t message this member.');
  // One unread "new messages" notice per conversation, refreshed with each message.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO help_messages (id, reply_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), replyId, user.id, text(b.text, 2000, 'Message', true), Date.now()),
    ctx.env.DB.prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'message' AND reply_id = ? AND read_at IS NULL").bind(other, replyId),
    notifyStmt(ctx.env.DB, other, 'message', { actor: user.id, post: r.post_id, reply: replyId })
  ]);
  return getHelp(ctx, r.post_id);
}

/* ---------- ratings ---------- */
// Pairwise: after completion, the poster and each helper may rate each other once.

async function createRating(ctx, replyId) {
  const user = await requireActive(ctx);
  const db = ctx.env.DB;
  const b = await readJson(ctx.request);
  const r = await loadReplyWithPost(ctx, replyId);
  requireParticipant(r, user);
  if (r.status !== 'completed') throw new HttpError(400, 'You can rate each other once the task is marked complete.');
  const stars = Number(b.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Choose 1 to 5 stars.');
  const comment = text(b.comment, 280, 'Comment');
  const ratee = otherPartyOf(r, user.id);
  try {
    await db.batch([
      db.prepare('INSERT INTO ratings (id, reply_id, rater_id, ratee_id, stars, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), replyId, user.id, ratee, stars, comment, Date.now()),
      notifyStmt(db, ratee, 'rated', { actor: user.id, post: r.post_id, reply: replyId, detail: String(stars) }),
      eventStmt(db, user.id, 'rating')
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, 'You’ve already rated this.');
    throw e;
  }
  return getHelp(ctx, r.post_id);
}

// Visible ratings about a member, newest first (for profiles).
async function ratingsAbout(db, userId, limit = 10) {
  const { results } = await db.prepare(
    `SELECT g.id, g.stars, g.comment, g.created_at, u.display_name, u.account_type
       FROM ratings g JOIN users u ON u.id = g.rater_id
      WHERE g.ratee_id = ? AND g.hidden_at IS NULL AND u.suspended_at IS NULL
      ORDER BY g.created_at DESC LIMIT ?`).bind(userId, limit).all();
  return results.map(g => ({ id: g.id, stars: g.stars, comment: g.comment, createdAt: g.created_at, from: shortName(g.display_name, g.account_type) }));
}

/* ---------- reports & blocks ---------- */

async function createReport(ctx) {
  const user = await requireUser(ctx);
  const { env } = ctx;
  const now = Date.now();
  const key = 'report:' + user.id;
  if (await countAttempts(env, key, now - 24 * HOUR) >= MAX_REPORTS_PER_DAY) throw new HttpError(429, 'You’ve sent a lot of reports today. Please try again tomorrow.');
  const b = await readJson(ctx.request);
  const type = oneOf(b.targetType, ['post', 'reply', 'user', 'rating'], 'Report type');
  const reason = oneOf(b.reason, REPORT_REASONS, 'Reason');
  const details = text(b.details, 1000, 'Details');
  const targetId = text(b.targetId, 64, 'Target', true);

  let targetUser, snapshot;
  if (type === 'post') {
    const p = await env.DB.prepare('SELECT author_id, title, detail FROM help_posts WHERE id = ?').bind(targetId).first();
    if (!p) throw new HttpError(404, 'That post isn’t available.');
    targetUser = p.author_id; snapshot = `${p.title}\n\n${p.detail}`;
  } else if (type === 'reply') {
    const r = await loadReplyWithPost(ctx, targetId);
    if (r.user_id !== user.id && r.post_author_id !== user.id) throw new HttpError(403, 'You’re not part of this conversation.');
    targetUser = r.user_id === user.id ? r.post_author_id : r.user_id;
    const { results: msgs } = await env.DB.prepare(
      'SELECT text FROM help_messages WHERE reply_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10'
    ).bind(targetId, targetUser).all();
    snapshot = (r.user_id === targetUser ? `Reply: ${r.text}\n` : '') + msgs.reverse().map(m => `Message: ${m.text}`).join('\n');
  } else if (type === 'rating') {
    const g = await env.DB.prepare('SELECT rater_id, stars, comment FROM ratings WHERE id = ?').bind(targetId).first();
    if (!g) throw new HttpError(404, 'That rating isn’t available.');
    targetUser = g.rater_id; snapshot = `${g.stars} stars\n\n${g.comment}`;
  } else {
    const u = await env.DB.prepare('SELECT id, display_name, headline, bio FROM users WHERE id = ?').bind(targetId).first();
    if (!u) throw new HttpError(404, 'That member isn’t available.');
    targetUser = u.id; snapshot = `${u.display_name}\n${u.headline}\n\n${u.bio}`;
  }
  if (targetUser === user.id) throw new HttpError(400, 'You can’t report yourself.');

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO reports (id, reporter_id, target_type, target_id, target_user_id, reason, details, snapshot, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`)
      .bind(crypto.randomUUID(), user.id, type, targetId, targetUser, reason, details, snapshot.slice(0, 5000), now),
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(key, now)
  ]);
  return json({ ok: true }, 201);
}

async function isBlocked(env, a, b) {
  const row = await env.DB.prepare('SELECT 1 FROM blocks WHERE (blocker_id=?1 AND blocked_id=?2) OR (blocker_id=?2 AND blocked_id=?1)').bind(a, b).first();
  return !!row;
}

async function listBlocks(ctx) {
  const user = await requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(
    'SELECT u.id, u.display_name, u.account_type FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC'
  ).bind(user.id).all();
  return json({ blocks: results.map(r => ({ id: r.id, displayName: r.display_name, accountType: r.account_type })) });
}

async function createBlock(ctx) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const target = text(b.userId, 64, 'Member', true);
  if (target === user.id) throw new HttpError(400, 'You can’t block yourself.');
  const exists = await ctx.env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(target).first();
  if (!exists) throw new HttpError(404, 'That member isn’t available.');
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').bind(user.id, target, Date.now()).run();
  return json({ ok: true });
}

async function deleteBlock(ctx, target) {
  const user = await requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').bind(user.id, target).run();
  return json({ ok: true });
}

/* ---------- admin ---------- */

async function requireAdmin(ctx) {
  const user = await requireUser(ctx);
  if (!user.is_admin) throw new HttpError(403, 'Admins only.');
  return user;
}

function audit(db, admin, action, target, note) {
  return db.prepare('INSERT INTO admin_actions (id, admin_id, action, target, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), admin.id, action, target, note || '', Date.now());
}

function suspendStatements(db, userId) {
  return [
    db.prepare('UPDATE users SET suspended_at = COALESCE(suspended_at, ?) WHERE id = ?').bind(Date.now(), userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId)
  ];
}

async function adminOverview(ctx) {
  await requireAdmin(ctx);
  const row = await ctx.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM reports WHERE status='open') AS open_reports,
      (SELECT COUNT(*) FROM org_verifications WHERE status='pending') AS pending_verifications,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM help_posts) AS posts,
      (SELECT COUNT(*) FROM feedback WHERE status='new') AS new_feedback`).first();
  return json({ openReports: row.open_reports, pendingVerifications: row.pending_verifications, users: row.users, posts: row.posts,
                newFeedback: row.new_feedback, emailEnabled: emailEnabled(ctx.env) });
}

async function adminListReports(ctx) {
  await requireAdmin(ctx);
  const status = ctx.url.searchParams.get('status') === 'all' ? null : 'open';
  const { results } = await ctx.env.DB.prepare(
    `SELECT r.*, rep.display_name AS reporter_name, tu.display_name AS target_name, tu.email AS target_email,
            tu.suspended_at AS target_suspended, p.hidden_at AS post_hidden_at,
            (SELECT COUNT(*) FROM reports r2 WHERE r2.target_user_id = r.target_user_id) AS reports_against_user
       FROM reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id
       LEFT JOIN users tu ON tu.id = r.target_user_id
       LEFT JOIN help_posts p ON r.target_type = 'post' AND p.id = r.target_id
      ${status ? "WHERE r.status = 'open'" : ''}
      ORDER BY r.created_at DESC LIMIT 200`
  ).all();
  return json({ reports: results.map(r => ({
    id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, details: r.details, snapshot: r.snapshot,
    status: r.status, createdAt: r.created_at, resolution: r.resolution,
    reporter: r.reporter_name || '(deleted account)',
    targetUser: r.target_user_id ? { id: r.target_user_id, name: r.target_name || '(deleted account)', email: r.target_email, deleted: !r.target_name, suspended: !!r.target_suspended, reportCount: r.reports_against_user } : null,
    postHidden: !!r.post_hidden_at
  })) });
}

async function adminResolveReport(ctx, id) {
  const admin = await requireAdmin(ctx);
  const b = await readJson(ctx.request);
  const action = oneOf(b.action, ['dismiss', 'hide-post', 'suspend-user', 'hide-and-suspend', 'hide-rating'], 'Action');
  const note = text(b.note, 500, 'Note');
  const db = ctx.env.DB;
  const r = await db.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first();
  if (!r) throw new HttpError(404, 'Report not found.');
  const stmts = [];
  if ((action === 'hide-post' || action === 'hide-and-suspend')) {
    if (r.target_type !== 'post') throw new HttpError(400, 'Only post reports can hide a post.');
    stmts.push(db.prepare('UPDATE help_posts SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?').bind(Date.now(), r.target_id));
    const post = await db.prepare('SELECT author_id FROM help_posts WHERE id = ?').bind(r.target_id).first();
    if (post) stmts.push(notifyStmt(db, post.author_id, 'post_hidden', { post: r.target_id }));
  }
  if (action === 'hide-rating') {
    if (r.target_type !== 'rating') throw new HttpError(400, 'Only rating reports can hide a rating.');
    stmts.push(db.prepare('UPDATE ratings SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?').bind(Date.now(), r.target_id));
  }
  if (action === 'suspend-user' || action === 'hide-and-suspend') {
    const target = await db.prepare('SELECT is_admin FROM users WHERE id = ?').bind(r.target_user_id).first();
    if (!target) throw new HttpError(404, 'That member no longer exists.');
    if (target.is_admin) throw new HttpError(400, 'Admins can’t be suspended here.');
    stmts.push(...suspendStatements(db, r.target_user_id));
  }
  const resolution = action === 'dismiss' ? 'dismissed' : 'actioned';
  // Resolve every open report about the same target at once.
  stmts.push(db.prepare(`UPDATE reports SET status=?, resolved_at=?, resolved_by=?, resolution=?
                          WHERE status='open' AND target_type=? AND target_id=?`)
    .bind(resolution, Date.now(), admin.id, action + (note ? ': ' + note : ''), r.target_type, r.target_id));
  stmts.push(audit(db, admin, 'report:' + action, `${r.target_type}:${r.target_id}`, note));
  await db.batch(stmts);
  return json({ ok: true });
}

async function adminListVerifications(ctx) {
  await requireAdmin(ctx);
  const all = ctx.url.searchParams.get('status') === 'all';
  const { results } = await ctx.env.DB.prepare(
    `SELECT v.*, u.display_name, u.email, u.website AS profile_website, u.location
       FROM org_verifications v JOIN users u ON u.id = v.user_id
      ${all ? '' : "WHERE v.status = 'pending'"} ORDER BY v.created_at DESC LIMIT 200`
  ).all();
  return json({ verifications: results.map(v => Object.assign(verificationRow(v), {
    org: { id: v.user_id, name: v.display_name, email: v.email, website: v.profile_website, location: v.location }
  })) });
}

async function adminReviewVerification(ctx, id) {
  const admin = await requireAdmin(ctx);
  const b = await readJson(ctx.request);
  const decision = oneOf(b.decision, ['approve', 'reject'], 'Decision');
  const note = text(b.note, 500, 'Note', decision === 'reject');
  const db = ctx.env.DB;
  const v = await db.prepare('SELECT * FROM org_verifications WHERE id = ?').bind(id).first();
  if (!v) throw new HttpError(404, 'Request not found.');
  if (v.status !== 'pending') throw new HttpError(409, 'This request was already reviewed.');
  const now = Date.now();
  await db.batch([
    db.prepare('UPDATE org_verifications SET status=?, reviewed_at=?, reviewer_id=?, review_note=? WHERE id=?')
      .bind(decision === 'approve' ? 'approved' : 'rejected', now, admin.id, note, id),
    db.prepare('UPDATE users SET verification_status=?, updated_at=? WHERE id=?')
      .bind(decision === 'approve' ? 'verified' : 'rejected', now, v.user_id),
    notifyStmt(db, v.user_id, 'verification', { detail: decision === 'approve' ? 'approved' : 'rejected' }),
    audit(db, admin, 'verification:' + decision, 'user:' + v.user_id, note)
  ]);
  return json({ ok: true });
}

async function adminListUsers(ctx) {
  await requireAdmin(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
  const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';
  const { results } = await ctx.env.DB.prepare(
    `SELECT * FROM users ${q ? "WHERE lower(email) LIKE ?1 ESCAPE '\\' OR lower(display_name) LIKE ?1 ESCAPE '\\'" : ''}
      ORDER BY created_at DESC LIMIT 50`
  ).bind(...(q ? [like] : [])).all();
  return json({ users: results.map(u => Object.assign(privateUser(u), { suspended: !!u.suspended_at })) });
}

async function adminUserAction(ctx, id) {
  const admin = await requireAdmin(ctx);
  const b = await readJson(ctx.request);
  const action = oneOf(b.action, ['suspend', 'unsuspend', 'reset-link', 'remove-avatar', 'remove-banner'], 'Action');
  const note = text(b.note, 500, 'Note');
  const db = ctx.env.DB;
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!target) throw new HttpError(404, 'Member not found.');
  if (action === 'reset-link') {
    // For members who can't receive email yet: an admin shares this link with them directly.
    const token = await issueToken(ctx.env, id, 'reset', ADMIN_RESET_TOKEN_TTL_MS);
    await audit(db, admin, 'user:reset-link', 'user:' + id, note).run();
    return json({ link: `${ctx.url.origin}/#/reset/${token}`, expiresInHours: ADMIN_RESET_TOKEN_TTL_MS / HOUR });
  }
  if (action === 'remove-avatar' || action === 'remove-banner') {
    const kind = action.slice(7);
    await db.batch([...removeMediaStatements(db, id, kind), audit(db, admin, 'user:' + action, 'user:' + id, note)]);
    return json({ ok: true });
  }
  if (target.id === admin.id || target.is_admin) throw new HttpError(400, 'Admins can’t be suspended here.');
  const stmts = action === 'suspend' ? suspendStatements(db, id)
    : [db.prepare('UPDATE users SET suspended_at = NULL WHERE id = ?').bind(id)];
  stmts.push(audit(db, admin, 'user:' + action, 'user:' + id, note));
  await db.batch(stmts);
  return json({ ok: true });
}

// Hidden ratings are excluded from averages and profiles.
async function adminRatingAction(ctx, id) {
  const admin = await requireAdmin(ctx);
  const b = await readJson(ctx.request);
  const action = oneOf(b.action, ['hide', 'unhide'], 'Action');
  const db = ctx.env.DB;
  const res = await db.prepare(action === 'hide' ? 'UPDATE ratings SET hidden_at = COALESCE(hidden_at, ?1) WHERE id = ?2' : 'UPDATE ratings SET hidden_at = NULL WHERE id = ?2 AND ?1 IS NOT NULL')
    .bind(Date.now(), id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Rating not found.');
  await audit(db, admin, 'rating:' + action, 'rating:' + id, text(b.note, 500, 'Note')).run();
  return json({ ok: true });
}

async function adminPostAction(ctx, id) {
  const admin = await requireAdmin(ctx);
  const b = await readJson(ctx.request);
  const action = oneOf(b.action, ['hide', 'unhide'], 'Action');
  const db = ctx.env.DB;
  const post = await db.prepare('SELECT author_id, hidden_at FROM help_posts WHERE id = ?').bind(id).first();
  if (!post) throw new HttpError(404, 'That post isn’t available.');
  await db.batch([
    ...(action === 'hide' && !post.hidden_at ? [notifyStmt(db, post.author_id, 'post_hidden', { post: id })] : []),
    db.prepare(action === 'hide' ? 'UPDATE help_posts SET hidden_at = COALESCE(hidden_at, ?1) WHERE id = ?2' : 'UPDATE help_posts SET hidden_at = NULL WHERE id = ?2 AND ?1 IS NOT NULL')
      .bind(Date.now(), id),
    audit(db, admin, 'post:' + action, 'post:' + id, text(b.note, 500, 'Note'))
  ]);
  return json({ ok: true });
}

/* ---------- profile media ---------- */

function mediaUrl(id) { return id ? '/api/media/' + id : null; }

function removeMediaStatements(db, userId, kind) {
  return [
    db.prepare('DELETE FROM media WHERE user_id = ? AND kind = ?').bind(userId, kind),
    db.prepare(`UPDATE users SET ${kind === 'avatar' ? 'avatar_id' : 'banner_id'} = NULL WHERE id = ?`).bind(userId)
  ];
}

function imageMatchesType(type, b) {
  if (type === 'image/jpeg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (type === 'image/webp') return b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  return false;
}

async function uploadMedia(ctx, kind) {
  const user = await requireActive(ctx);
  const { env } = ctx;
  const now = Date.now();
  const key = 'upload:' + user.id;
  if (await countAttempts(env, key, now - HOUR) >= MAX_UPLOADS_PER_HOUR) throw new HttpError(429, 'Too many uploads. Please try again in an hour.');
  const b = await readJson(ctx.request, MAX_UPLOAD_BODY_BYTES);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(b.dataUrl || ''));
  if (!m) throw new HttpError(400, 'Please upload a JPEG, PNG, or WebP image.');
  let bytes;
  try { bytes = unb64(m[2]); } catch { throw new HttpError(400, 'That image couldn’t be read.'); }
  if (bytes.length > MEDIA_LIMITS[kind]) throw new HttpError(413, 'That image is too large. Please choose a smaller one.');
  if (!imageMatchesType(m[1], bytes)) throw new HttpError(400, 'That file isn’t a valid image.');
  const id = crypto.randomUUID();
  const column = kind === 'avatar' ? 'avatar_id' : 'banner_id';
  await env.DB.batch([
    env.DB.prepare('DELETE FROM media WHERE user_id = ? AND kind = ?').bind(user.id, kind),
    env.DB.prepare('INSERT INTO media (id, user_id, kind, content_type, data_b64, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, kind, m[1], m[2], bytes.length, now),
    env.DB.prepare(`UPDATE users SET ${column} = ?, updated_at = ? WHERE id = ?`).bind(id, now, user.id),
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(key, now)
  ]);
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json({ user: privateUser(fresh) });
}

async function deleteMedia(ctx, kind) {
  const user = await requireUser(ctx);
  await ctx.env.DB.batch(removeMediaStatements(ctx.env.DB, user.id, kind));
  const fresh = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json({ user: privateUser(fresh) });
}

// Organization images are public like their profiles; individuals' images are for signed-in members only.
async function serveMedia(ctx, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'Not found.');
  const m = await ctx.env.DB.prepare(
    'SELECT m.content_type, m.data_b64, m.user_id, u.account_type, u.suspended_at FROM media m JOIN users u ON u.id = m.user_id WHERE m.id = ?'
  ).bind(id).first();
  if (!m) throw new HttpError(404, 'Not found.');
  const viewer = await currentUser(ctx);
  const admin = viewer && viewer.is_admin;
  if (m.suspended_at && !admin) throw new HttpError(404, 'Not found.');
  const isPublic = m.account_type === 'org';
  if (!isPublic) {
    if (!viewer) throw new HttpError(404, 'Not found.');
    if (!admin && viewer.id !== m.user_id && await isBlocked(ctx.env, viewer.id, m.user_id)) throw new HttpError(404, 'Not found.');
  }
  return new Response(unb64(m.data_b64), {
    headers: {
      'Content-Type': m.content_type,
      // Each upload gets a new URL, so caching is safe; kept to a day so moderator removals take effect.
      'Cache-Control': (isPublic ? 'public' : 'private') + ', max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline'
    }
  });
}

/* ---------- notifications ---------- */

// Prepared INSERT for a notification (or a no-op when someone would notify themselves).
function notifyStmt(db, userId, type, o = {}) {
  if (!userId || userId === o.actor) return db.prepare('SELECT 1');
  return db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, post_id, reply_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, type, o.actor || null, o.post || null, o.reply || null, o.detail || '', Date.now());
}

async function listNotifications(ctx) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const since = Number(ctx.url.searchParams.get('since')) || 0;
  const [list, unread] = await db.batch([
    db.prepare(`SELECT n.*, a.display_name AS actor_name, a.account_type AS actor_type, a.avatar_id AS actor_avatar, p.title AS post_title
                  FROM notifications n
                  LEFT JOIN users a ON a.id = n.actor_id
                  LEFT JOIN help_posts p ON p.id = n.post_id
                 WHERE n.user_id = ?1 AND n.created_at > ?2
                   AND (n.actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ?1 AND b.blocked_id = n.actor_id) OR (b.blocker_id = n.actor_id AND b.blocked_id = ?1)))
                 ORDER BY n.created_at DESC LIMIT 50`).bind(user.id, since),
    db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id)
  ]);
  if (Math.random() < 0.05) await db.prepare('DELETE FROM notifications WHERE created_at < ?').bind(Date.now() - NOTIFICATION_RETENTION_MS).run();
  return json({
    unread: unread.results[0].n,
    notifications: list.results.map(n => ({
      id: n.id, type: n.type, detail: n.detail, createdAt: n.created_at, read: !!n.read_at, postId: n.post_id, postTitle: n.post_title || '',
      actor: n.actor_id ? { id: n.actor_id, name: n.actor_name || 'A former member', accountType: n.actor_type, avatarUrl: mediaUrl(n.actor_avatar) } : null
    }))
  });
}

async function readNotifications(ctx) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const now = Date.now();
  if (b.all === true) {
    await ctx.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now, user.id).run();
  } else {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter(x => typeof x === 'string' && x.length <= 64).slice(0, 50);
    if (ids.length) {
      await ctx.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
        .bind(now, user.id, ...ids).run();
    }
  }
  const row = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first();
  return json({ unread: row.n });
}

/* ---------- feedback ---------- */

async function createFeedback(ctx) {
  const { env } = ctx;
  const user = await currentUser(ctx);
  const now = Date.now();
  const ipKey = 'feedback-ip:' + clientIp(ctx.request);
  if (await countAttempts(env, ipKey, now - HOUR) >= MAX_FEEDBACK_PER_IP_PER_HOUR) throw new HttpError(429, 'Thanks for all the feedback! Please try again in a little while.');
  const b = await readJson(ctx.request);
  const kind = oneOf(b.kind, FEEDBACK_KINDS, 'Feedback type');
  const message = text(b.message, 2000, 'Feedback', true);
  const contact = user ? '' : (b.contactEmail ? normalizeEmail(b.contactEmail) : '');
  const page = text(b.page, 40, 'Page');
  const id = crypto.randomUUID();
  const { results: admins } = await env.DB.prepare('SELECT id FROM users WHERE is_admin = 1').all();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO feedback (id, user_id, kind, message, contact_email, page, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user ? user.id : null, kind, message, contact, page, now),
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(ipKey, now),
    ...admins.map(a => notifyStmt(env.DB, a.id, 'feedback', { actor: user ? user.id : null, detail: kind }))
  ]);
  return json({ ok: true }, 201);
}

async function adminListFeedback(ctx) {
  await requireAdmin(ctx);
  const status = ctx.url.searchParams.get('status');
  const filter = ['new', 'reviewed', 'done'].includes(status) ? 'WHERE f.status = ?1' : '';
  const stmt = ctx.env.DB.prepare(
    `SELECT f.*, u.display_name, u.email, u.account_type FROM feedback f LEFT JOIN users u ON u.id = f.user_id
     ${filter} ORDER BY f.created_at DESC LIMIT 200`);
  const { results } = await (filter ? stmt.bind(status) : stmt).all();
  return json({ feedback: results.map(f => ({
    id: f.id, kind: f.kind, message: f.message, page: f.page, status: f.status, createdAt: f.created_at,
    from: f.user_id ? { id: f.user_id, name: f.display_name, email: f.email, accountType: f.account_type } : null,
    contactEmail: f.contact_email
  })) });
}

async function adminUpdateFeedback(ctx, id) {
  const admin = await requireAdmin(ctx);
  const b = await readJson(ctx.request);
  const status = oneOf(b.status, ['new', 'reviewed', 'done'], 'Status');
  const db = ctx.env.DB;
  const res = await db.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Feedback not found.');
  await audit(db, admin, 'feedback:' + status, 'feedback:' + id, '').run();
  return json({ ok: true });
}

/* ---------- public stats (aggregate counts only; shown to guests) ---------- */

async function publicStats(ctx) {
  const row = await ctx.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM users WHERE suspended_at IS NULL AND is_admin = 0) AS members,
      (SELECT COUNT(*) FROM users WHERE suspended_at IS NULL AND account_type = 'org') AS orgs,
      (SELECT COUNT(*) FROM help_posts p JOIN users u ON u.id = p.author_id
        WHERE p.status <> 'resolved' AND p.hidden_at IS NULL AND u.suspended_at IS NULL) AS open_posts,
      (SELECT COUNT(*) FROM help_posts WHERE created_at > ?1 AND hidden_at IS NULL) AS posts_this_week,
      (SELECT COUNT(*) FROM help_replies WHERE created_at > ?1) AS replies_this_week`).bind(Date.now() - 7 * DAY).first();
  return new Response(JSON.stringify({
    members: row.members, orgs: row.orgs, openPosts: row.open_posts, postsThisWeek: row.posts_this_week, repliesThisWeek: row.replies_this_week
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

/* ---------- landing page A/B test ---------- */

function landingVariant(experiment, id) {
  return LANDING_EXPERIMENTS[experiment].only || (parseInt(id[0], 16) % 2 === 0 ? 'A' : 'B');
}

// Called by /start when it's first seen and when someone clicks. Members and bots aren't counted:
// the test is about people who haven't joined yet.
async function recordLanding(ctx) {
  const { env, request } = ctx;
  const b = await readJson(request);
  const id = String(b.vid || '');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(400, 'Invalid visitor.');
  const event = b.event === undefined ? null : String(b.event);
  if (event !== null && !LANDING_EVENTS.includes(event)) throw new HttpError(400, 'Unknown event.');
  const exp = String(b.experiment || '');
  if (!Object.hasOwn(LANDING_EXPERIMENTS, exp)) return json({ ok: true, counted: false });   // a page cached from an earlier test
  if (BOT_UA.test(request.headers.get('User-Agent') || '')) return json({ ok: true, counted: false });
  if (await currentUser(ctx)) return json({ ok: true, counted: false });

  const now = Date.now();
  const stmts = [];
  const known = await env.DB.prepare('SELECT 1 FROM landing_visitors WHERE experiment = ? AND id = ?').bind(exp, id).first();
  if (!known) {
    const ipKey = 'landing-ip:' + clientIp(request);
    if (await countAttempts(env, ipKey, now - HOUR) >= MAX_LANDING_VISITORS_PER_IP_PER_HOUR) return json({ ok: true, counted: false });
    const source = /^[a-z0-9_-]{1,24}$/.test(String(b.source || '')) ? b.source : '';
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO landing_visitors (experiment, id, variant, source, device, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(exp, id, landingVariant(exp, id), source, b.device === 'mobile' ? 'mobile' : 'desktop', now));
    stmts.push(env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(ipKey, now));
    stmts.push(env.DB.prepare('DELETE FROM login_attempts WHERE key = ? AND created_at < ?').bind(ipKey, now - DAY));
    if (Math.random() < 0.02) {
      stmts.push(env.DB.prepare('DELETE FROM landing_events WHERE created_at < ?').bind(now - ACTIVITY_RETENTION_MS));
      stmts.push(env.DB.prepare('DELETE FROM landing_visitors WHERE created_at < ?').bind(now - ACTIVITY_RETENTION_MS));
    }
  }
  if (event) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO landing_events (experiment, visitor_id, event, created_at) VALUES (?, ?, ?, ?)')
      .bind(exp, id, event, now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, counted: true, variant: landingVariant(exp, id) });
}

async function recordLandingSignup(env, id, accountType, now) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return;
  await env.DB.prepare(`INSERT OR IGNORE INTO landing_events (experiment, visitor_id, event, created_at)
                        SELECT experiment, id, ?1, ?2 FROM landing_visitors WHERE id = ?3 AND created_at > ?4`)
    .bind('signup:' + accountType, now - (now % DAY), id, now - 30 * DAY).run();
}

async function adminLanding(ctx) {
  await requireAdmin(ctx);
  const db = ctx.env.DB;
  const asked = ctx.url.searchParams.get('experiment') || LANDING_ACTIVE;
  const exp = Object.hasOwn(LANDING_EXPERIMENTS, asked) ? asked : LANDING_ACTIVE;
  // Each visitor counts once per goal, however many times they click.
  const [arms, places, sources, span] = await db.batch([
    db.prepare(`SELECT v.variant, COUNT(*) AS visitors,
                  SUM(CASE WHEN v.device = 'mobile' THEN 1 ELSE 0 END) AS mobile,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event LIKE 'cta:%')) AS cta,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event LIKE 'signup:%')) AS signups,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event = 'signup:org')) AS org_signups,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event = 'guest')) AS guests,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event = 'scroll')) AS scrolled
                FROM landing_visitors v WHERE v.experiment = ?1 GROUP BY v.variant`).bind(exp),
    db.prepare(`SELECT e.event, SUM(v.variant = 'A') AS a, SUM(v.variant = 'B') AS b
                FROM landing_events e JOIN landing_visitors v ON v.experiment = e.experiment AND v.id = e.visitor_id
                WHERE e.experiment = ?1 AND e.event LIKE 'cta:%' GROUP BY e.event`).bind(exp),
    db.prepare(`SELECT v.source, COUNT(*) AS visitors,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event LIKE 'cta:%')) AS cta,
                  SUM(EXISTS (SELECT 1 FROM landing_events e WHERE e.experiment = v.experiment AND e.visitor_id = v.id AND e.event LIKE 'signup:%')) AS signups
                FROM landing_visitors v WHERE v.experiment = ?1 GROUP BY v.source ORDER BY visitors DESC LIMIT 30`).bind(exp),
    db.prepare('SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM landing_visitors WHERE experiment = ?').bind(exp)
  ]);
  const arm = v => {
    const r = arms.results.find(x => x.variant === v) || {};
    const n = r.visitors || 0, cta = r.cta || 0, signups = r.signups || 0;
    return {
      visitors: n, mobile: r.mobile || 0, guests: r.guests || 0, scrolled: r.scrolled || 0, orgSignups: r.org_signups || 0,
      cta: { count: cta, rate: n ? cta / n : 0, ci: wilson(cta, n) },
      signup: { count: signups, rate: n ? signups / n : 0, ci: wilson(signups, n) }
    };
  };
  const A = arm('A'), B = arm('B');
  return json({
    experiment: exp, only: LANDING_EXPERIMENTS[exp].only, target: LANDING_TARGET_PER_VARIANT,
    startedAt: span.results[0].first, lastVisitAt: span.results[0].last,
    a: A, b: B, test: LANDING_EXPERIMENTS[exp].only ? null : landingVerdict(A, B),
    places: places.results.map(p => ({ event: p.event, a: p.a, b: p.b })),
    sources: sources.results.map(x => ({ source: x.source, visitors: x.visitors, cta: x.cta, signups: x.signups }))
  });
}

// 95% Wilson score interval, which stays sensible at small counts.
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

function normalCdf(x) {   // Abramowitz & Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const tail = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

// Two-proportion z-test on the primary goal (CTA click). No verdict until both versions reach the
// sample size chosen in advance; checking early and stopping on a good day finds winners that aren't real.
function landingVerdict(A, B) {
  const n = A.visitors + B.visitors;
  // Visitors should split about evenly. A lopsided split means tracking or assignment is broken.
  const imbalance = n ? Math.abs(A.visitors - B.visitors) / Math.sqrt(n) : 0;
  const splitOk = 2 * (1 - normalCdf(imbalance)) >= 0.001;
  const pool = n ? (A.cta.count + B.cta.count) / n : 0;
  const se = A.visitors && B.visitors ? Math.sqrt(pool * (1 - pool) * (1 / A.visitors + 1 / B.visitors)) : 0;
  const z = se ? (B.cta.rate - A.cta.rate) / se : 0;
  const pValue = se ? Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))) : 1;
  const ready = Math.min(A.visitors, B.visitors) >= LANDING_TARGET_PER_VARIANT;
  const status = !splitOk ? 'broken' : !ready ? 'collecting' : pValue < 0.05 ? (z > 0 ? 'B' : 'A') : 'none';
  return { status, diff: B.cta.rate - A.cta.rate, z, pValue, splitOk };
}

/* ---------- usage analytics ---------- */

// The browser pings every ~30s while the app is open, sending active time since the last ping
// and the features used. Works for guests (anonymous) and members.
async function recordActivity(ctx) {
  const { env } = ctx;
  const b = await readJson(ctx.request);
  let sid = String(b.sid || '');
  if (!/^[a-f0-9]{32}$/.test(sid)) throw new HttpError(400, 'Invalid session.');
  const device = b.device === 'mobile' ? 'mobile' : 'desktop';
  const events = (Array.isArray(b.events) ? b.events : []).filter(f => FEATURES.includes(f)).slice(0, 25);
  const user = await currentUser(ctx);
  const now = Date.now();
  let row = await env.DB.prepare('SELECT * FROM activity_sessions WHERE id = ?').bind(sid).first();

  // A tab that changes hands (log out, then someone else logs in) starts a fresh session.
  if (row && row.user_id && (!user || user.id !== row.user_id)) {
    sid = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    row = null;
  }
  const stmts = [];
  if (!row) {
    const ipKey = 'act-ip:' + clientIp(ctx.request);
    if (await countAttempts(env, ipKey, now - HOUR) >= MAX_NEW_SESSIONS_PER_IP_PER_HOUR) return json({ ok: true, sid });
    stmts.push(env.DB.prepare(`INSERT INTO activity_sessions (id, user_id, kind, device, started_at, last_seen_at, active_ms)
                               VALUES (?, ?, ?, ?, ?, ?, 0)`).bind(sid, user ? user.id : null, user ? 'member' : 'guest', device, now, now));
    stmts.push(env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind(ipKey, now));
    if (Math.random() < 0.02) {
      stmts.push(env.DB.prepare('DELETE FROM activity_events WHERE created_at < ?').bind(now - ACTIVITY_RETENTION_MS));
      stmts.push(env.DB.prepare('DELETE FROM activity_sessions WHERE last_seen_at < ?').bind(now - ACTIVITY_RETENTION_MS));
    }
  } else {
    // Never credit more active time than has actually passed since the last ping.
    const credit = Math.max(0, Math.min(Number(b.activeMs) || 0, MAX_ACTIVE_MS_PER_PING, now - row.last_seen_at + 5000));
    if (row.kind === 'guest' && user) {
      stmts.push(env.DB.prepare("UPDATE activity_sessions SET user_id = ?, kind = 'member', converted = 1 WHERE id = ?").bind(user.id, sid));
    }
    stmts.push(env.DB.prepare('UPDATE activity_sessions SET last_seen_at = ?, active_ms = active_ms + ? WHERE id = ?').bind(now, Math.round(credit), sid));
  }
  for (const f of events) {
    stmts.push(env.DB.prepare('INSERT INTO activity_events (session_id, user_id, feature, created_at) VALUES (?, ?, ?, ?)')
      .bind(sid, user ? user.id : null, f, now));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, sid });
}

function activityWindow(url) {
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const tz = Math.min(840, Math.max(-840, parseInt(url.searchParams.get('tz'), 10) || 0));   // minutes, as from getTimezoneOffset()
  return { days, since: Date.now() - days * DAY, tzMs: tz * 60000 };
}

async function adminActivity(ctx) {
  await requireAdmin(ctx);
  const db = ctx.env.DB;
  const { days, since, tzMs } = activityWindow(ctx.url);
  // Admin accounts are left out so testing the site doesn't skew the numbers.
  const notAdmin = '(s.user_id IS NULL OR s.user_id IN (SELECT id FROM users WHERE is_admin = 0))';
  const notAdminE = '(e.user_id IS NULL OR e.user_id IN (SELECT id FROM users WHERE is_admin = 0))';
  const [summary, people, daily, features, members] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS sessions,
                  SUM(CASE WHEN kind = 'guest' AND converted = 0 THEN 1 ELSE 0 END) AS guest_sessions,
                  COUNT(DISTINCT user_id) AS active_members,
                  COALESCE(SUM(active_ms), 0) AS active_ms,
                  SUM(converted) AS conversions,
                  SUM(CASE WHEN device = 'mobile' THEN 1 ELSE 0 END) AS mobile_sessions
                FROM activity_sessions s WHERE started_at >= ?1 AND ${notAdmin}`).bind(since),
    db.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE is_admin = 0) AS members,
                       (SELECT COUNT(*) FROM users WHERE is_admin = 0 AND created_at >= ?1) AS new_members`).bind(since),
    db.prepare(`SELECT date((started_at - ?2) / 1000, 'unixepoch') AS day, COUNT(*) AS sessions,
                  COUNT(DISTINCT user_id) AS members, COALESCE(SUM(active_ms), 0) AS active_ms
                FROM activity_sessions s WHERE started_at >= ?1 AND ${notAdmin}
                GROUP BY day ORDER BY day`).bind(since, tzMs),
    db.prepare(`SELECT feature, COUNT(*) AS uses, COUNT(DISTINCT user_id) AS members,
                  SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS guest_uses
                FROM activity_events e WHERE created_at >= ?1 AND ${notAdminE}
                GROUP BY feature ORDER BY uses DESC`).bind(since),
    db.prepare(`SELECT u.id, u.display_name, u.email, u.account_type, u.created_at,
                  COUNT(s.id) AS sessions, COALESCE(SUM(s.active_ms), 0) AS active_ms, MAX(s.last_seen_at) AS last_seen,
                  (SELECT e.feature FROM activity_events e WHERE e.user_id = u.id AND e.created_at >= ?1
                    GROUP BY e.feature ORDER BY COUNT(*) DESC LIMIT 1) AS top_feature
                FROM users u LEFT JOIN activity_sessions s ON s.user_id = u.id AND s.started_at >= ?1
                WHERE u.is_admin = 0
                GROUP BY u.id ORDER BY active_ms DESC, last_seen DESC LIMIT 300`).bind(since)
  ]);
  const sm = summary.results[0], pp = people.results[0];
  return json({
    days,
    summary: {
      sessions: sm.sessions || 0, guestSessions: sm.guest_sessions || 0, activeMembers: sm.active_members || 0,
      activeMs: sm.active_ms || 0, conversions: sm.conversions || 0, mobileSessions: sm.mobile_sessions || 0,
      members: pp.members, newMembers: pp.new_members
    },
    daily: daily.results.map(d => ({ day: d.day, sessions: d.sessions, members: d.members, activeMs: d.active_ms })),
    features: features.results.map(f => ({ feature: f.feature, uses: f.uses, members: f.members, guestUses: f.guest_uses })),
    members: members.results.map(m => ({
      id: m.id, name: m.display_name, email: m.email, accountType: m.account_type, joinedAt: m.created_at,
      sessions: m.sessions, activeMs: m.active_ms, lastSeen: m.last_seen, topFeature: m.top_feature
    }))
  });
}

async function adminActivityUser(ctx, id) {
  await requireAdmin(ctx);
  const db = ctx.env.DB;
  const { days, since, tzMs } = activityWindow(ctx.url);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!user) throw new HttpError(404, 'Member not found.');
  const [sessions, daily, features, lastEver] = await db.batch([
    db.prepare(`SELECT started_at, last_seen_at, active_ms, device, converted FROM activity_sessions
                WHERE user_id = ?1 AND started_at >= ?2 ORDER BY started_at DESC LIMIT 100`).bind(id, since),
    db.prepare(`SELECT date((started_at - ?3) / 1000, 'unixepoch') AS day, COUNT(*) AS sessions, COALESCE(SUM(active_ms), 0) AS active_ms
                FROM activity_sessions WHERE user_id = ?1 AND started_at >= ?2 GROUP BY day ORDER BY day`).bind(id, since, tzMs),
    db.prepare(`SELECT feature, COUNT(*) AS uses FROM activity_events WHERE user_id = ?1 AND created_at >= ?2
                GROUP BY feature ORDER BY uses DESC`).bind(id, since),
    db.prepare('SELECT MAX(last_seen_at) AS t FROM activity_sessions WHERE user_id = ?').bind(id)
  ]);
  return json({
    days,
    user: Object.assign(publicUser(user), { email: user.email }),
    lastSeenEver: lastEver.results[0].t,
    sessions: sessions.results.map(s => ({ startedAt: s.started_at, lastSeen: s.last_seen_at, activeMs: s.active_ms, device: s.device, fromGuest: !!s.converted })),
    daily: daily.results.map(d => ({ day: d.day, sessions: d.sessions, activeMs: d.active_ms })),
    features: features.results.map(f => ({ feature: f.feature, uses: f.uses }))
  });
}

/* ---------- email ---------- */

function emailEnabled(env) { return !!(env.RESEND_API_KEY && env.MAIL_FROM); }
function contact(env) { return env.CONTACT_EMAIL || 'the Global Neighbors team'; }

async function sendEmail(env, to, subject, body) {
  // Local development: set RESEND_API_KEY=dev-log in .dev.vars to print emails instead of sending them.
  if (env.RESEND_API_KEY === 'dev-log') { console.log(`[dev email] to=${to} subject=${subject}\n${body}`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text: body })
  });
  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
    throw new HttpError(502, 'We couldn’t send the email just now. Please try again later.');
  }
}

async function emailVerificationLink(ctx, user) {
  const token = await issueToken(ctx.env, user.id, 'verify', VERIFY_TOKEN_TTL_MS);
  const link = `${ctx.url.origin}/#/verify/${token}`;
  await sendEmail(ctx.env, user.email, 'Confirm your email for Global Neighbors',
    `Hi ${user.display_name},\n\nWelcome to Global Neighbors! Please confirm your email address with this link (valid for 24 hours):\n\n${link}\n\nIf you didn’t create an account, you can ignore this email.\n\n— Global Neighbors`);
}

async function issueToken(env, userId, purpose, ttl) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    // Only the newest link of each kind works.
    env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').bind(now, userId, purpose),
    env.DB.prepare('INSERT INTO auth_tokens (id, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, purpose, now, now + ttl),
    env.DB.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').bind(now - 7 * 24 * HOUR)
  ]);
  return token;
}

async function consumeToken(env, token, purpose) {
  if (!token || token.length > 100) throw new HttpError(400, 'This link is invalid or has expired.');
  const id = await sha256Hex(token);
  const now = Date.now();
  const res = await env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?')
    .bind(now, id, purpose, now).run();
  if (!res.meta || !res.meta.changes) throw new HttpError(400, 'This link is invalid, expired, or already used. Please request a new one.');
  const row = await env.DB.prepare('SELECT user_id FROM auth_tokens WHERE id = ?').bind(id).first();
  return row.user_id;
}

/* ---------- sessions ---------- */

async function createSession(env, userId, url) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    // Rate-limit records (which include IP addresses) are kept for at most 7 days.
    env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(now - 7 * 24 * HOUR)
  ]);
  return cookieString(token, Math.floor(SESSION_TTL_MS / 1000), url);
}

async function currentUser(ctx) {
  if (ctx._user !== undefined) return ctx._user;
  const token = getCookie(ctx.request, SESSION_COOKIE);
  ctx._user = null;
  if (token && token.length < 200) {
    ctx._user = await ctx.env.DB.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.suspended_at IS NULL'
    ).bind(await sha256Hex(token), Date.now()).first() || null;
  }
  return ctx._user;
}

async function requireUser(ctx) {
  const user = await currentUser(ctx);
  if (!user) throw new HttpError(401, 'Please log in to continue.');
  return user;
}

// Posting, replying, and messaging require a confirmed email once email is switched on.
async function requireActive(ctx) {
  const user = await requireUser(ctx);
  if (emailEnabled(ctx.env) && !user.email_verified_at) {
    throw new HttpError(403, 'Please confirm your email address first. Check your inbox for the link, or resend it from the banner at the top of the page.');
  }
  return user;
}

function cookieString(value, maxAge, url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function clearCookie(url) { return cookieString('', 0, url); }

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/* ---------- passwords ---------- */

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password, stored) {
  const [algo, iter, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'pbkdf2-sha256') return false;
  const expected = unb64(hashB64);
  const actual = await pbkdf2(password, unb64(saltB64), Number(iter));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function validatePassword(pw) {
  if (pw.length < 10) throw new HttpError(400, 'Password must be at least 10 characters.');
  if (pw.length > 200) throw new HttpError(400, 'Password is too long.');
}

/* ---------- request helpers ---------- */

// Cross-site request forgery guard: state-changing requests must be same-origin JSON.
function checkCsrf(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw new HttpError(403, 'Cross-site request blocked.');
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Requests must be sent as JSON.');
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const raw = await request.text();
  if (raw.length > maxBytes) throw new HttpError(413, 'That request is too large.');
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new HttpError(400, 'Invalid JSON.'); }
}

function clientIp(request) { return request.headers.get('CF-Connecting-IP') || 'local'; }

async function countAttempts(env, key, since) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND created_at > ?').bind(key, since).first();
  return row ? row.n : 0;
}

/* ---------- validation ---------- */

function text(value, max, label, required) {
  const s = (value === undefined || value === null) ? '' : String(value).trim();
  if (required && !s) throw new HttpError(400, `${label} is required.`);
  if (s.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return s;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `${label} is not valid.`);
  return value;
}

function normalizeEmail(value, strict = true) {
  const email = String(value || '').trim().toLowerCase();
  if (strict && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }
  return email.slice(0, 254);
}

function websiteUrl(value) {
  const s = text(value, 200, 'Website');
  if (!s) return '';
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { throw new HttpError(400, 'Website must be a valid web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Website must start with http or https.');
  return u.toString();
}

function tagList(value, max, maxLen, label) {
  if (!Array.isArray(value)) throw new HttpError(400, `${label} must be a list.`);
  const list = [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
  if (list.length > max) throw new HttpError(400, `${label}: choose up to ${max}.`);
  if (list.some(v => v.length > maxLen)) throw new HttpError(400, `${label}: each must be ${maxLen} characters or fewer.`);
  return list;
}

function causeList(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Causes must be a list.');
  const list = [...new Set(value)].filter(c => CAUSES.includes(c));
  if (list.length > 6) throw new HttpError(400, 'Choose up to 6 cause areas.');
  return list;
}

/* ---------- output shapes ---------- */

function publicUser(u) {
  const list = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  return {
    id: u.id, accountType: u.account_type, displayName: u.display_name, headline: u.headline,
    location: u.location, region: u.region, bio: u.bio, website: u.website, causes: list(u.causes), createdAt: u.created_at,
    verified: u.verification_status === 'verified',
    avatarUrl: mediaUrl(u.avatar_id), bannerUrl: mediaUrl(u.banner_id), bannerPreset: u.banner_preset || 'harbor',
    pronouns: u.pronouns || '', languages: list(u.languages), skills: list(u.skills),
    ...(u.rating_count !== undefined ? { rating: { avg: u.rating_avg == null ? null : Number(u.rating_avg), count: u.rating_count } } : {})
  };
}
function privateUser(u) {
  return Object.assign(publicUser(u), {
    email: u.email, emailVerified: !!u.email_verified_at, isAdmin: !!u.is_admin, verificationStatus: u.verification_status
  });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers)
  });
}

/* ---------- encoding ---------- */

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function b64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str || ''); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
