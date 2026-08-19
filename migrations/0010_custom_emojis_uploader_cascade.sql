-- Migration: 0010_custom_emojis_uploader_cascade.sql
-- Update custom_emojis table to allow SET NULL or safe cascading on user deletion

CREATE TABLE IF NOT EXISTS custom_emojis_new (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  shortcode TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(shortcode) BETWEEN 2 AND 32),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  image_bytes BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 327680),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 256),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 256),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'disabled')),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  disabled_at INTEGER,
  disabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (
    (status = 'published' AND disabled_at IS NULL AND disabled_by IS NULL) OR
    (status = 'disabled' AND disabled_at IS NOT NULL)
  )
);

INSERT OR IGNORE INTO custom_emojis_new (
  id, shortcode, label, image_bytes, byte_size, width, height, sha256, status, uploaded_by, created_at, disabled_at, disabled_by
)
SELECT
  id, shortcode, label, image_bytes, byte_size, width, height, sha256, status, uploaded_by, created_at, disabled_at, disabled_by
FROM custom_emojis;

DROP TABLE IF EXISTS custom_emojis;

ALTER TABLE custom_emojis_new RENAME TO custom_emojis;

CREATE INDEX IF NOT EXISTS custom_emojis_catalog ON custom_emojis(status, created_at DESC);
