-- Migration: 0008_canvas_multi_page.sql
-- Add 5-page support and indexing for canvas sketchpads

ALTER TABLE canvas_strokes ADD COLUMN page_index INTEGER NOT NULL DEFAULT 1 CHECK (page_index BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS canvas_strokes_page_order ON canvas_strokes(room_id, page_index, id DESC);
CREATE INDEX IF NOT EXISTS canvas_strokes_created_at ON canvas_strokes(room_id, created_at DESC);
