-- Migrate job.location from text (EWKT) to geometry(Point,3857)
-- This enables efficient GiST indexing and KNN queries

-- Step 1: Drop the old indexes
DROP INDEX IF EXISTS idx_jobs_location_gist;
DROP INDEX "jobs_location_idx";

-- Step 2: Add a new geometry column
ALTER TABLE "job" ADD COLUMN "location_geom" geometry(Point, 3857);

-- Step 3: Transform existing data from 4326 (lat/lon degrees) to 3857 (WebMercator meters)
-- Parse the EWKT text, extract coordinates, transform to 3857
UPDATE "job"
SET "location_geom" = ST_Transform(
  ST_GeomFromEWKT("location"),
  3857
)
WHERE "location" IS NOT NULL;

-- Step 4: Make the new column NOT NULL (after backfill)
ALTER TABLE "job" ALTER COLUMN "location_geom" SET NOT NULL;

-- Step 5: Drop the old text column
ALTER TABLE "job" DROP COLUMN "location";

-- Step 6: Rename the new column to the original name
ALTER TABLE "job" RENAME COLUMN "location_geom" TO "location";

-- Step 7: Create GiST index on the geometry column for KNN queries
CREATE INDEX IF NOT EXISTS idx_jobs_location_gist 
ON "job" USING GIST ("location");
