CREATE TABLE custom_emojis (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  shortcode TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(shortcode) BETWEEN 2 AND 32),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  image_bytes BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 327680),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 256),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 256),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'disabled')),
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  disabled_at INTEGER,
  disabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (
    (status = 'published' AND disabled_at IS NULL AND disabled_by IS NULL) OR
    (status = 'disabled' AND disabled_at IS NOT NULL)
  )
);
CREATE INDEX custom_emojis_catalog ON custom_emojis(status, created_at DESC);

CREATE TABLE canvas_state (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  updated_at INTEGER NOT NULL
);

CREATE TABLE canvas_strokes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL CHECK (length(client_id) = 36),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 48),
  tool TEXT NOT NULL CHECK (tool IN ('pen', 'eraser')),
  color TEXT NOT NULL CHECK (
    length(color) = 7 AND
    color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'
  ),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 24),
  points_json TEXT NOT NULL CHECK (length(points_json) BETWEEN 2 AND 8192),
  created_at INTEGER NOT NULL,
  UNIQUE (room_id, user_id, client_id)
);
CREATE INDEX canvas_strokes_room_order ON canvas_strokes(room_id, id DESC);

INSERT OR IGNORE INTO canvas_state (room_id, updated_at)
SELECT id, created_at FROM rooms;
