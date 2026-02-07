-- Add missing index on active_places.place_id for fast JOINs in views
-- This is critical for performance with 340k+ rows - enables index scan instead of sequential scan
-- Without this index, JOINs on place_id require full table scans, causing queries to take 1m+ seconds
CREATE INDEX "active_places_place_id_idx" ON "active_places" USING btree ("place_id");