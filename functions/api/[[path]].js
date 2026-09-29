// Global Neighbors API — Cloudflare Pages Function backed by D1 (binding: DB).
// Every route lives under /api/*. Responses are JSON; auth is a session cookie.

const SESSION_COOKIE = 'gn_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;          // Workers' WebCrypto caps PBKDF2 at 100k
const MAX_BODY_BYTES = 20 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 30;
const MAX_SIGNUPS_PER_IP_PER_HOUR = 10;

const REGIONS = ['Greater Boston', 'North America', 'Latin America', 'Africa', 'South Asia', 'Global'];
const CATEGORIES = [
  'Groceries & errands', 'Elder care & companionship', 'Clean water & sanitation', 'Food & meals',
  'Housing & repairs', 'Health & medical', 'Education & tutoring', 'Transportation & rides',
  'Jobs & livelihoods', 'Legal & paperwork', 'Disaster & emergency', 'Energy & solar', 'Tech & skills'
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

    // Auth
    if (route === 'auth/signup' && method === 'POST') return await signup(ctx);
    if (route === 'auth/login' && method === 'POST') return await login(ctx);
    if (route === 'auth/logout' && method === 'POST') return await logout(ctx);

    // Current user
    if (route === 'me' && method === 'GET') return await getMe(ctx);
    if (route === 'me' && method === 'PATCH') return await updateMe(ctx);
    if (route === 'me' && method === 'DELETE') return await deleteMe(ctx);
    if (route === 'me/password' && method === 'POST') return await changePassword(ctx);

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
    if (seg[0] === 'help' && seg.length === 3 && seg[2] === 'replies' && method === 'POST') return await createReply(ctx, seg[1]);
    if (seg[0] === 'replies' && seg.length === 2 && method === 'PATCH') return await updateReply(ctx, seg[1]);
    if (seg[0] === 'replies' && seg.length === 3 && seg[2] === 'messages' && method === 'POST') return await createMessage(ctx, seg[1]);

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
  const recent = await countAttempts(env, 'signup-ip:' + ip, now - 60 * 60 * 1000);
  if (recent >= MAX_SIGNUPS_PER_IP_PER_HOUR) throw new HttpError(429, 'Too many sign-ups from this network. Please try again later.');

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  validatePassword(password);
  const accountType = oneOf(body.accountType, ['person', 'org'], 'Account type');
  const displayName = text(body.displayName, 80, accountType === 'org' ? 'Organization name' : 'Name', true);
  const location = text(body.location, 100, 'Location', true);
  const region = oneOf(body.region, REGIONS, 'Region');
  const headline = text(body.headline, 120, 'Headline');

  const existing = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (existing) throw new HttpError(409, 'An account with that email already exists. Try logging in instead.');

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, account_type, display_name, headline, location, region, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, email, hash, accountType, displayName, headline, location, region, now, now),
    env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)').bind('signup-ip:' + ip, now)
  ]);
  const cookie = await createSession(env, id, ctx.url);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ user: privateUser(user) }, 201, { 'Set-Cookie': cookie });
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
      env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(now - 24 * 60 * 60 * 1000)
    ]);
    throw new HttpError(401, 'That email and password don’t match an account.');
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind('email:' + email).run();
  const cookie = await createSession(env, user.id, ctx.url);
  return json({ user: privateUser(user) }, 200, { 'Set-Cookie': cookie });
}

async function logout(ctx) {
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (token) await ctx.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(ctx.url) });
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
    location: body.location !== undefined ? text(body.location, 100, 'Location', true) : user.location,
    region: body.region !== undefined ? oneOf(body.region, REGIONS, 'Region') : user.region,
    bio: body.bio !== undefined ? text(body.bio, 2000, 'About') : user.bio,
    website: body.website !== undefined ? websiteUrl(body.website) : user.website,
    causes: body.causes !== undefined ? JSON.stringify(causeList(body.causes)) : user.causes
  };
  const now = Date.now();
  await ctx.env.DB.prepare(`UPDATE users SET display_name=?, headline=?, location=?, region=?, bio=?, website=?, causes=?, updated_at=? WHERE id=?`)
    .bind(f.display_name, f.headline, f.location, f.region, f.bio, f.website, f.causes, now, user.id).run();
  const fresh = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json({ user: privateUser(fresh) });
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
  const token = getCookie(ctx.request, SESSION_COOKIE);
  const keep = await sha256Hex(token);
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
  await db.batch([
    db.prepare(`DELETE FROM help_messages WHERE user_id=?1
                  OR reply_id IN (SELECT id FROM help_replies WHERE user_id=?1)
                  OR reply_id IN (SELECT r.id FROM help_replies r JOIN help_posts p ON p.id=r.post_id WHERE p.author_id=?1)`).bind(user.id),
    db.prepare('DELETE FROM help_replies WHERE user_id=?1 OR post_id IN (SELECT id FROM help_posts WHERE author_id=?1)').bind(user.id),
    db.prepare('DELETE FROM help_posts WHERE author_id=?').bind(user.id),
    db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
    db.prepare('DELETE FROM login_attempts WHERE key=?').bind('email:' + user.email),
    db.prepare('DELETE FROM users WHERE id=?').bind(user.id)
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(ctx.url) });
}

/* ---------- directory & profiles ---------- */

async function listOrgs(ctx) {
  const { results } = await ctx.env.DB.prepare(
    "SELECT * FROM users WHERE account_type='org' ORDER BY display_name COLLATE NOCASE LIMIT 500"
  ).all();
  return json({ orgs: results.map(publicUser) });
}

async function getUser(ctx, id) {
  const viewer = await currentUser(ctx);
  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  // Organization profiles are public; individuals are visible to signed-in members only.
  if (!user || (user.account_type === 'person' && !viewer)) throw new HttpError(404, 'Profile not found.');
  let posts = [];
  if (viewer) {
    const { results } = await ctx.env.DB.prepare(helpSelect('WHERE p.author_id = ?2')).bind(viewer.id, id).all();
    posts = results.map(r => helpRow(r, viewer.id));
  }
  return json({ user: publicUser(user), posts });
}

/* ---------- help board ---------- */

function helpSelect(where) {
  return `SELECT p.*, u.display_name AS author_name, u.account_type AS author_type, u.headline AS author_headline,
            (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = p.id) AS reply_count,
            (SELECT r.status FROM help_replies r WHERE r.post_id = p.id AND r.user_id = ?1) AS my_reply_status
          FROM help_posts p JOIN users u ON u.id = p.author_id
          ${where}
          ORDER BY p.created_at DESC LIMIT 300`;
}

function helpRow(r, viewerId) {
  return {
    id: r.id,
    author: { id: r.author_id, name: r.author_name, accountType: r.author_type, headline: r.author_headline },
    type: r.type, category: r.category, scale: r.scale, title: r.title, detail: r.detail,
    location: r.location, region: r.region, pay: { kind: r.pay_kind, label: r.pay_label },
    urgency: r.urgency, status: r.status, createdAt: r.created_at,
    replyCount: r.reply_count, myReplyStatus: r.my_reply_status || null, isMine: r.author_id === viewerId
  };
}

async function listHelp(ctx) {
  const user = await requireUser(ctx);
  const view = ctx.url.searchParams.get('view') || 'browse';
  const where = view === 'mine' ? 'WHERE p.author_id = ?1'
    : view === 'helping' ? 'WHERE EXISTS (SELECT 1 FROM help_replies r WHERE r.post_id = p.id AND r.user_id = ?1)'
    : '';
  const { results } = await ctx.env.DB.prepare(helpSelect(where)).bind(user.id).all();
  return json({ posts: results.map(r => helpRow(r, user.id)) });
}

async function loadPost(ctx, id, viewerId) {
  const row = await ctx.env.DB.prepare(helpSelect('WHERE p.id = ?2')).bind(viewerId, id).first();
  if (!row) throw new HttpError(404, 'That post no longer exists.');
  return row;
}

async function getHelp(ctx, id) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const row = await loadPost(ctx, id, user.id);
  const post = helpRow(row, user.id);

  // Only the post's author sees every reply; everyone else sees only their own.
  const filter = post.isMine ? 'r.post_id = ?' : 'r.post_id = ? AND r.user_id = ?';
  const binds = post.isMine ? [id] : [id, user.id];
  const { results: replies } = await db.prepare(
    `SELECT r.*, u.display_name, u.account_type, u.headline, u.location
       FROM help_replies r JOIN users u ON u.id = r.user_id
      WHERE ${filter} ORDER BY r.created_at`
  ).bind(...binds).all();

  let messages = [];
  if (replies.length) {
    const ph = replies.map(() => '?').join(',');
    ({ results: messages } = await db.prepare(
      `SELECT m.*, u.display_name FROM help_messages m JOIN users u ON u.id = m.user_id
        WHERE m.reply_id IN (${ph}) ORDER BY m.created_at`
    ).bind(...replies.map(r => r.id)).all());
  }

  post.replies = replies.map(r => ({
    id: r.id, status: r.status, text: r.text, createdAt: r.created_at, isMine: r.user_id === user.id,
    user: { id: r.user_id, name: r.display_name, accountType: r.account_type, headline: r.headline, location: r.location },
    messages: messages.filter(m => m.reply_id === r.id).map(m => ({
      id: m.id, text: m.text, createdAt: m.created_at, isMine: m.user_id === user.id, from: m.display_name
    }))
  }));
  return json({ post });
}

async function createHelp(ctx) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const now = Date.now();
  const id = crypto.randomUUID();
  const payKind = oneOf(b.payKind, PAY_KINDS, 'Compensation');
  await ctx.env.DB.prepare(
    `INSERT INTO help_posts (id, author_id, type, category, scale, title, detail, location, region, pay_kind, pay_label, urgency, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).bind(
    id, user.id,
    oneOf(b.type, ['ask', 'offer'], 'Post type'),
    oneOf(b.category, CATEGORIES, 'Category'),
    oneOf(b.scale, SCALES, 'Reach'),
    text(b.title, 120, 'Title', true),
    text(b.detail, 3000, 'Details', true),
    text(b.location, 100, 'Location', true),
    oneOf(b.region, REGIONS, 'Region'),
    payKind,
    text(b.payLabel, 60, 'Amount'),
    oneOf(b.urgency, URGENCIES, 'Timing'),
    now, now
  ).run();
  const row = await loadPost(ctx, id, user.id);
  return json({ post: helpRow(row, user.id) }, 201);
}

async function updateHelp(ctx, id) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const post = await ctx.env.DB.prepare('SELECT * FROM help_posts WHERE id = ?').bind(id).first();
  if (!post) throw new HttpError(404, 'That post no longer exists.');
  if (post.author_id !== user.id) throw new HttpError(403, 'Only the person who posted this can change it.');
  const status = oneOf(b.status, ['open', 'in-progress', 'resolved'], 'Status');
  await ctx.env.DB.prepare('UPDATE help_posts SET status=?, updated_at=? WHERE id=?').bind(status, Date.now(), id).run();
  const row = await loadPost(ctx, id, user.id);
  return json({ post: helpRow(row, user.id) });
}

async function deleteHelp(ctx, id) {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const post = await db.prepare('SELECT author_id FROM help_posts WHERE id = ?').bind(id).first();
  if (!post) throw new HttpError(404, 'That post no longer exists.');
  if (post.author_id !== user.id) throw new HttpError(403, 'Only the person who posted this can delete it.');
  await db.batch([
    db.prepare('DELETE FROM help_messages WHERE reply_id IN (SELECT id FROM help_replies WHERE post_id=?)').bind(id),
    db.prepare('DELETE FROM help_replies WHERE post_id=?').bind(id),
    db.prepare('DELETE FROM help_posts WHERE id=?').bind(id)
  ]);
  return json({ ok: true });
}

async function createReply(ctx, postId) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const post = await ctx.env.DB.prepare('SELECT author_id, status FROM help_posts WHERE id = ?').bind(postId).first();
  if (!post) throw new HttpError(404, 'That post no longer exists.');
  if (post.author_id === user.id) throw new HttpError(400, 'You can’t reply to your own post.');
  if (post.status === 'resolved') throw new HttpError(400, 'This post has been resolved.');
  const replyText = text(b.text, 2000, 'Reply', true);
  try {
    await ctx.env.DB.prepare('INSERT INTO help_replies (id, post_id, user_id, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), postId, user.id, replyText, 'pending', Date.now()).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, 'You’ve already replied to this post.');
    throw e;
  }
  return getHelp(ctx, postId);
}

async function loadReplyWithPost(ctx, replyId) {
  const r = await ctx.env.DB.prepare(
    `SELECT r.*, p.author_id AS post_author_id, p.status AS post_status
       FROM help_replies r JOIN help_posts p ON p.id = r.post_id WHERE r.id = ?`
  ).bind(replyId).first();
  if (!r) throw new HttpError(404, 'That reply no longer exists.');
  return r;
}

async function updateReply(ctx, replyId) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const r = await loadReplyWithPost(ctx, replyId);
  if (r.post_author_id !== user.id) throw new HttpError(403, 'Only the person who posted can accept or decline replies.');
  const status = oneOf(b.status, ['accepted', 'declined'], 'Status');
  const db = ctx.env.DB;
  const stmts = [db.prepare('UPDATE help_replies SET status=? WHERE id=?').bind(status, replyId)];
  if (status === 'accepted' && r.post_status === 'open') {
    stmts.push(db.prepare("UPDATE help_posts SET status='in-progress', updated_at=? WHERE id=?").bind(Date.now(), r.post_id));
  }
  await db.batch(stmts);
  return getHelp(ctx, r.post_id);
}

async function createMessage(ctx, replyId) {
  const user = await requireUser(ctx);
  const b = await readJson(ctx.request);
  const r = await loadReplyWithPost(ctx, replyId);
  if (r.user_id !== user.id && r.post_author_id !== user.id) throw new HttpError(403, 'You’re not part of this conversation.');
  if (r.post_status === 'resolved') throw new HttpError(400, 'This post has been resolved.');
  await ctx.env.DB.prepare('INSERT INTO help_messages (id, reply_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), replyId, user.id, text(b.text, 2000, 'Message', true), Date.now()).run();
  return getHelp(ctx, r.post_id);
}

/* ---------- sessions ---------- */

async function createSession(env, userId, url) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now)
  ]);
  return cookieString(token, Math.floor(SESSION_TTL_MS / 1000), url);
}

async function currentUser(ctx) {
  if (ctx._user !== undefined) return ctx._user;
  const token = getCookie(ctx.request, SESSION_COOKIE);
  ctx._user = null;
  if (token && token.length < 200) {
    ctx._user = await ctx.env.DB.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?'
    ).bind(await sha256Hex(token), Date.now()).first() || null;
  }
  return ctx._user;
}

async function requireUser(ctx) {
  const user = await currentUser(ctx);
  if (!user) throw new HttpError(401, 'Please log in to continue.');
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

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.');
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

function causeList(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Causes must be a list.');
  const list = [...new Set(value)].filter(c => CAUSES.includes(c));
  if (list.length > 6) throw new HttpError(400, 'Choose up to 6 cause areas.');
  return list;
}

/* ---------- output shapes ---------- */

function publicUser(u) {
  let causes = [];
  try { causes = JSON.parse(u.causes || '[]'); } catch {}
  return {
    id: u.id, accountType: u.account_type, displayName: u.display_name, headline: u.headline,
    location: u.location, region: u.region, bio: u.bio, website: u.website, causes, createdAt: u.created_at
  };
}
function privateUser(u) { return Object.assign(publicUser(u), { email: u.email }); }

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
