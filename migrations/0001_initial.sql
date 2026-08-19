PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_access ON sessions(access_hash);
CREATE INDEX sessions_refresh ON sessions(refresh_hash);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO rooms (id, name, description, created_at)
VALUES ('general', 'General', 'General discussion', unixepoch() * 1000);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX messages_room_order ON messages(room_id, id DESC);

CREATE TABLE rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  resets_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(resets_at);

CREATE TABLE websocket_tickets (
  ticket_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX websocket_tickets_expiry ON websocket_tickets(expires_at);
CREATE INDEX websocket_tickets_session ON websocket_tickets(session_id, consumed_at);

CREATE TABLE room_bans (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  moderation_id INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('remove_user', 'delete_message')),
  target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  reason TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'executed', 'rejected')),
  created_at INTEGER NOT NULL,
  executed_at INTEGER,
  CHECK (
    (action = 'remove_user' AND target_user_id IS NOT NULL AND message_id IS NULL) OR
    (action = 'delete_message' AND message_id IS NOT NULL AND target_user_id IS NULL)
  )
);
CREATE INDEX moderation_status_order ON moderation_actions(status, id DESC);

CREATE TABLE approval_quotas (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_votes INTEGER NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
  used_votes INTEGER NOT NULL DEFAULT 0 CHECK (used_votes >= 0),
  CHECK (used_votes <= total_votes)
);

CREATE TABLE moderation_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moderation_id INTEGER NOT NULL REFERENCES moderation_actions(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (moderation_id, voter_id)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_log_order ON audit_log(id DESC);
