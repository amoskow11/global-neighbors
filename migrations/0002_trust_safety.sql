-- Email verification, password reset, reporting, blocking, moderation, and org verification.

ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;         -- granted manually, never by email match
ALTER TABLE users ADD COLUMN suspended_at INTEGER;
ALTER TABLE users ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'none'
  CHECK (verification_status IN ('none','pending','verified','rejected'));
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;

ALTER TABLE help_posts ADD COLUMN hidden_at INTEGER;                     -- hidden by a moderator

-- One-time links for email verification and password reset (only hashes stored).
CREATE TABLE auth_tokens (
  id         TEXT PRIMARY KEY,                     -- SHA-256 of the token
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, purpose);

CREATE TABLE reports (
  id             TEXT PRIMARY KEY,
  reporter_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type    TEXT NOT NULL CHECK (target_type IN ('post','reply','user')),
  target_id      TEXT NOT NULL,
  target_user_id TEXT,                              -- the member responsible for the reported content
  reason         TEXT NOT NULL,
  details        TEXT NOT NULL DEFAULT '',
  snapshot       TEXT NOT NULL DEFAULT '',          -- copy of the reported content at report time
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at     INTEGER NOT NULL,
  resolved_at    INTEGER,
  resolved_by    TEXT,
  resolution     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_reports_status ON reports(status, created_at);

CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE org_verifications (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legal_name          TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  country             TEXT NOT NULL,
  website             TEXT NOT NULL DEFAULT '',
  contact_role        TEXT NOT NULL,
  notes               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at          INTEGER NOT NULL,
  reviewed_at         INTEGER,
  reviewer_id         TEXT,
  review_note         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_org_verifications_status ON org_verifications(status, created_at);

CREATE TABLE admin_actions (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
