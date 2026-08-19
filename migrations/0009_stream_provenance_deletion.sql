-- Migration: 0009_stream_provenance_deletion.sql
-- Allow 'deleted' trust_tier in stream_provenance for manual stream deletion / removal

CREATE TABLE IF NOT EXISTS stream_provenance_new (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  watch_url TEXT NOT NULL,
  embed_url TEXT,
  hls_url TEXT,
  guild TEXT NOT NULL CHECK (guild IN ('guild_projectionist', 'guild_community', 'guild_archivist', 'unboundarized')),
  trust_tier TEXT NOT NULL CHECK (trust_tier IN ('official', 'trusted_member', 'probationary', 'quarantined', 'deleted')),
  origin_domain TEXT NOT NULL,
  curator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  attestation_notes TEXT,
  boundary_tags TEXT,
  verified_at INTEGER,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO stream_provenance_new (
  id, platform, channel, name, description, watch_url, embed_url, hls_url,
  guild, trust_tier, origin_domain, curator_id, attestation_notes, boundary_tags, verified_at, updated_at
)
SELECT
  id, platform, channel, name, description, watch_url, embed_url, hls_url,
  guild, trust_tier, origin_domain, curator_id, attestation_notes, boundary_tags, verified_at, updated_at
FROM stream_provenance;

DROP TABLE IF EXISTS stream_provenance;

ALTER TABLE stream_provenance_new RENAME TO stream_provenance;

CREATE INDEX IF NOT EXISTS stream_provenance_guild ON stream_provenance(guild, trust_tier);
