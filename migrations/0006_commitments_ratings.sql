-- Commitments, multi-helper posts, and two-way ratings.
--
-- Reply statuses become talking | committed | withdrawn | declined | completed.
-- SQLite can't change a CHECK constraint in place, so help_replies is rebuilt. help_messages
-- references it with ON DELETE CASCADE, and DROP TABLE on a parent runs those cascades even
-- with deferred foreign keys. So both tables are copied aside, the child is dropped before the
-- parent, and both are recreated and refilled. reports is rebuilt to allow 'rating'.

PRAGMA defer_foreign_keys = true;

-- 1. How many helpers a post needs (asks) or can serve (offers).
ALTER TABLE help_posts ADD COLUMN helpers_needed INTEGER NOT NULL DEFAULT 1 CHECK (helpers_needed BETWEEN 1 AND 20);

-- 2. Copy replies and messages aside.
CREATE TABLE help_replies_copy (id TEXT, post_id TEXT, user_id TEXT, text TEXT, status TEXT, created_at INTEGER);
INSERT INTO help_replies_copy (id, post_id, user_id, text, status, created_at)
  SELECT id, post_id, user_id, text, status, created_at FROM help_replies;
CREATE TABLE help_messages_copy (id TEXT, reply_id TEXT, user_id TEXT, text TEXT, created_at INTEGER);
INSERT INTO help_messages_copy (id, reply_id, user_id, text, created_at)
  SELECT id, reply_id, user_id, text, created_at FROM help_messages;

-- 3. Drop child first, then parent (nothing else references either table).
DROP TABLE help_messages;
DROP TABLE help_replies;

-- 4. Recreate help_replies with the new statuses.
CREATE TABLE help_replies (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES help_posts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'talking'
               CHECK (status IN ('talking','committed','withdrawn','declined','completed')),
  created_at   INTEGER NOT NULL,
  committed_at INTEGER,                  -- when the helper committed
  ended_at     INTEGER,                  -- when it was withdrawn, declined, or completed
  ended_by     TEXT,                     -- who withdrew, released, or declined it
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_help_replies_user ON help_replies(user_id);
CREATE INDEX idx_help_replies_post_status ON help_replies(post_id, status);

-- pending -> talking, accepted -> committed, declined stays declined.
INSERT INTO help_replies (id, post_id, user_id, text, status, created_at, committed_at, ended_at)
  SELECT id, post_id, user_id, text,
         CASE status WHEN 'accepted' THEN 'committed' WHEN 'declined' THEN 'declined' ELSE 'talking' END,
         created_at,
         CASE WHEN status = 'accepted' THEN created_at END,
         CASE WHEN status = 'declined' THEN created_at END
    FROM help_replies_copy;

-- 5. Recreate help_messages exactly as before and refill it.
CREATE TABLE help_messages (
  id         TEXT PRIMARY KEY,
  reply_id   TEXT NOT NULL REFERENCES help_replies(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_help_messages_reply ON help_messages(reply_id, created_at);
INSERT INTO help_messages (id, reply_id, user_id, text, created_at)
  SELECT id, reply_id, user_id, text, created_at FROM help_messages_copy;

DROP TABLE help_messages_copy;
DROP TABLE help_replies_copy;

-- 6. Ratings: pairwise between a poster and each helper after completion.
--    reply_id is SET NULL if the post is deleted, so ratings outlive the post.
CREATE TABLE ratings (
  id         TEXT PRIMARY KEY,
  reply_id   TEXT REFERENCES help_replies(id) ON DELETE SET NULL,
  rater_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 280),
  created_at INTEGER NOT NULL,
  hidden_at  INTEGER,
  CHECK (rater_id <> ratee_id),
  UNIQUE (reply_id, rater_id)
);
CREATE INDEX idx_ratings_ratee ON ratings(ratee_id);

-- 7. Reports can now target a rating (nothing references reports, so a rename is safe).
CREATE TABLE reports_new (
  id             TEXT PRIMARY KEY,
  reporter_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type    TEXT NOT NULL CHECK (target_type IN ('post','reply','user','rating')),
  target_id      TEXT NOT NULL,
  target_user_id TEXT,
  reason         TEXT NOT NULL,
  details        TEXT NOT NULL DEFAULT '',
  snapshot       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  created_at     INTEGER NOT NULL,
  resolved_at    INTEGER,
  resolved_by    TEXT,
  resolution     TEXT NOT NULL DEFAULT ''
);
INSERT INTO reports_new (id, reporter_id, target_type, target_id, target_user_id, reason, details, snapshot, status, created_at, resolved_at, resolved_by, resolution)
  SELECT id, reporter_id, target_type, target_id, target_user_id, reason, details, snapshot, status, created_at, resolved_at, resolved_by, resolution FROM reports;
DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;
CREATE INDEX idx_reports_status ON reports(status, created_at);

-- 8. Keep committed <= needed for posts that accepted several replies under the old rules.
UPDATE help_posts SET helpers_needed = MIN(20, (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = help_posts.id AND r.status = 'committed'))
 WHERE (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = help_posts.id AND r.status = 'committed') > 1;

-- 9. Commitments on already-resolved posts count as completed.
UPDATE help_replies SET status = 'completed', ended_at = COALESCE(committed_at, created_at)
 WHERE status = 'committed' AND post_id IN (SELECT id FROM help_posts WHERE status = 'resolved');

-- 10. Recompute every post's status from its commitments.
UPDATE help_posts SET status = CASE
    WHEN status = 'resolved' THEN 'resolved'
    WHEN (SELECT COUNT(*) FROM help_replies r WHERE r.post_id = help_posts.id AND r.status = 'committed') > 0 THEN 'in-progress'
    ELSE 'open'
  END;
