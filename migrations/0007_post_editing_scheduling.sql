-- Post editing and scheduling. Additive only: older code ignores these columns.

-- Optional date (and time) the task happens or is needed by, in the poster's local terms.
ALTER TABLE help_posts ADD COLUMN when_date TEXT CHECK (when_date IS NULL OR when_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
ALTER TABLE help_posts ADD COLUMN when_time TEXT CHECK (when_time IS NULL OR when_time GLOB '[0-2][0-9]:[0-5][0-9]');
-- Set when the poster edits the post's content (not when its status changes).
ALTER TABLE help_posts ADD COLUMN edited_at INTEGER;

CREATE INDEX idx_help_posts_when ON help_posts(when_date);
