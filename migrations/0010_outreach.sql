-- Outreach (current members and possible new users) and the traction coach. Additive only.

-- A message an admin sent to one member. For in-app messages the id matches the notification.
-- For email, this records only that the admin opened a draft in their own mail app.
CREATE TABLE outreach (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  segment    TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('app','email')),
  sent_by    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_outreach_user ON outreach(user_id, created_at DESC);

-- Possible new users: mostly organizations and groups the team plans to contact.
CREATE TABLE leads (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  audience     TEXT NOT NULL,
  place        TEXT NOT NULL DEFAULT '',
  contact      TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','contacted','talking','joined','notnow')),
  follow_up    TEXT NOT NULL DEFAULT '',           -- YYYY-MM-DD
  tag          TEXT NOT NULL UNIQUE,               -- their own /start?src= link
  created_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  contacted_at INTEGER,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_leads_status ON leads(status, updated_at DESC);

-- What the admin did about each coach suggestion, with the number it was meant to move at the time.
CREATE TABLE coach_log (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('done','later')),
  metric     TEXT NOT NULL DEFAULT '',
  baseline   INTEGER NOT NULL DEFAULT 0,
  until      INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_coach_log_created ON coach_log(created_at DESC);
