-- A/B test of the marketing landing page (/start). Additive only.
-- One row per visitor (the unit that is randomized), plus at most one row per kind of event.
-- Anonymous: nothing here links to an account. Rows older than 180 days are deleted.

CREATE TABLE landing_visitors (
  experiment TEXT NOT NULL,
  id         TEXT NOT NULL,                         -- random, made by the visitor's browser
  variant    TEXT NOT NULL CHECK (variant IN ('A','B')),   -- always derived from id by the server
  source     TEXT NOT NULL DEFAULT '',              -- ?src= tag on the link they followed
  device     TEXT NOT NULL CHECK (device IN ('desktop','mobile')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (experiment, id)
);
CREATE INDEX idx_landing_visitors_created ON landing_visitors(created_at);

CREATE TABLE landing_events (
  experiment TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  event      TEXT NOT NULL,                         -- cta:<place> | guest | scroll | signup:person | signup:org
  created_at INTEGER NOT NULL,                      -- sign-ups keep only the day, so they can't be matched to an account
  PRIMARY KEY (experiment, visitor_id, event)
);
CREATE INDEX idx_landing_events_created ON landing_events(created_at);
