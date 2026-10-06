-- LinkedIn-style profile customization: photos, banners, and extra profile fields.

-- Images are resized and re-encoded in the browser, then stored base64-encoded.
-- (Kept small enough for D1; move to R2 when the account enables it.)
CREATE TABLE media (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('avatar','banner')),
  content_type TEXT NOT NULL,
  data_b64     TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_media_user ON media(user_id, kind);

ALTER TABLE users ADD COLUMN avatar_id TEXT;
ALTER TABLE users ADD COLUMN banner_id TEXT;
ALTER TABLE users ADD COLUMN banner_preset TEXT NOT NULL DEFAULT 'harbor';
ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN languages TEXT NOT NULL DEFAULT '[]';   -- JSON array
ALTER TABLE users ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';      -- JSON array: "ways I can help" / focus areas
