-- Changes from Traction Write-up #2: notifications, broader categories, and in-app feedback.

-- "Other" posts carry the poster's own short category description.
ALTER TABLE help_posts ADD COLUMN category_note TEXT NOT NULL DEFAULT '';

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- who receives it
  type       TEXT NOT NULL,                       -- reply | accepted | message | verification | post_hidden | feedback
  actor_id   TEXT,                                -- who caused it (NULL for system notices)
  post_id    TEXT,
  reply_id   TEXT,
  detail     TEXT NOT NULL DEFAULT '',            -- short context, e.g. 'approved'
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE feedback (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,          -- NULL for guests
  kind          TEXT NOT NULL CHECK (kind IN ('idea','problem','category','other')),
  message       TEXT NOT NULL,
  contact_email TEXT NOT NULL DEFAULT '',          -- optional, guests only
  page          TEXT NOT NULL DEFAULT '',          -- which part of the app it was sent from
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','done')),
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_feedback_status ON feedback(status, created_at DESC);
