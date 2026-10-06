-- First-party usage analytics for the admin dashboard.
-- Records sessions, active time, and which features are used, never what people type.
-- Rows older than 180 days are deleted automatically.

CREATE TABLE activity_sessions (
  id           TEXT PRIMARY KEY,                    -- random per browser tab; rotates after 30 min idle
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,   -- NULL for guests
  kind         TEXT NOT NULL CHECK (kind IN ('member','guest')),
  converted    INTEGER NOT NULL DEFAULT 0,          -- 1 when a guest session signed up or logged in
  device       TEXT NOT NULL DEFAULT 'desktop' CHECK (device IN ('desktop','mobile')),
  started_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  active_ms    INTEGER NOT NULL DEFAULT 0           -- time the tab was visible and in use
);
CREATE INDEX idx_act_sessions_started ON activity_sessions(started_at);
CREATE INDEX idx_act_sessions_user ON activity_sessions(user_id, started_at);

CREATE TABLE activity_events (
  session_id TEXT NOT NULL,
  user_id    TEXT,                                  -- NULL for guests
  feature    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_act_events_created ON activity_events(created_at);
CREATE INDEX idx_act_events_user ON activity_events(user_id, created_at);
