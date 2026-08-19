CREATE TABLE channel_requests (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  room_id TEXT NOT NULL COLLATE NOCASE CHECK (
    length(room_id) BETWEEN 1 AND 64 AND
    room_id NOT GLOB '*[^a-z0-9-]*' AND
    substr(room_id, 1, 1) GLOB '[a-z0-9]' AND
    substr(room_id, -1, 1) GLOB '[a-z0-9]'
  ),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 500),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  threshold INTEGER NOT NULL CHECK (threshold BETWEEN 2 AND 10),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  CHECK (
    (status = 'pending' AND resolved_at IS NULL) OR
    (status IN ('approved', 'rejected') AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX channel_requests_status_order ON channel_requests(status, created_at DESC);
CREATE UNIQUE INDEX channel_requests_pending_room ON channel_requests(room_id) WHERE status = 'pending';

CREATE TABLE channel_request_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES channel_requests(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  created_at INTEGER NOT NULL,
  UNIQUE (request_id, voter_id)
);

CREATE INDEX channel_request_votes_counts ON channel_request_votes(request_id, decision);

CREATE TRIGGER channel_request_vote_guard
BEFORE INSERT ON channel_request_votes
BEGIN
  SELECT RAISE(ABORT, 'channel request not pending') WHERE NOT EXISTS (
    SELECT 1 FROM channel_requests WHERE id = NEW.request_id AND status = 'pending'
  );
END;
