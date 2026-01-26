CREATE TYPE "public"."origin_table" AS ENUM('point', 'line', 'polygon', 'rel');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- Drop address table if it exists (may have been dropped in migration 0017)
DROP TABLE IF EXISTS "address" CASCADE;--> statement-breakpoint
-- Conditionally rename columns if they still have old names (migration 0017 may have already renamed them)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'active_job' AND column_name = 'job_pickup_address') THEN
        ALTER TABLE "active_job" RENAME COLUMN "job_pickup_address" TO "job_pickup_place_id";
    END IF;
END $$;--> statement-breakpoint
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'active_job' AND column_name = 'job_deliver_address') THEN
        ALTER TABLE "active_job" RENAME COLUMN "job_deliver_address" TO "job_deliver_place_id";
    END IF;
END $$;--> statement-breakpoint
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job' AND column_name = 'start_address_id') THEN
        ALTER TABLE "job" RENAME COLUMN "start_address_id" TO "start_place_id";
    END IF;
END $$;--> statement-breakpoint
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job' AND column_name = 'end_address_id') THEN
        ALTER TABLE "job" RENAME COLUMN "end_address_id" TO "end_place_id";
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "region" RENAME COLUMN "name_latn" TO "name_latin";--> statement-breakpoint
-- Drop constraints if they exist (may have been dropped in previous migration)
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_job_pickup_address_address_id_fk";--> statement-breakpoint
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_job_deliver_address_address_id_fk";--> statement-breakpoint
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_start_region_region_code_fk";--> statement-breakpoint
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_end_region_region_code_fk";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT IF EXISTS "job_start_address_id_address_id_fk";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT IF EXISTS "job_end_address_id_address_id_fk";--> statement-breakpoint
ALTER TABLE "places" DROP CONSTRAINT IF EXISTS "places_region_region_code_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "jobs_start_address_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "places_tile_idx";--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'region'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "region" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
-- Drop old primary key constraint on region.code
ALTER TABLE "region" DROP CONSTRAINT "region_pkey";--> statement-breakpoint
ALTER TABLE "region" ALTER COLUMN "code" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "region" ALTER COLUMN "country_code" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "region" ALTER COLUMN "country_code" DROP NOT NULL;--> statement-breakpoint
-- Add new columns to region first (before making id the PK)
-- Note: geom is nullable initially, will be populated and then made NOT NULL
ALTER TABLE "region" ADD COLUMN "id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "region" ADD COLUMN "name_local" text;--> statement-breakpoint
ALTER TABLE "region" ADD COLUMN "geom" geometry(MultiPolygon, 3857);--> statement-breakpoint
-- Make id the new primary key
ALTER TABLE "region" ADD PRIMARY KEY ("id");--> statement-breakpoint
-- Convert start_region and end_region from text (region.code) to integer (region.id)
-- Now that region.id exists, we can convert the foreign keys
-- Add temporary columns for the conversion
ALTER TABLE "active_job" ADD COLUMN "start_region_new" integer;--> statement-breakpoint
ALTER TABLE "active_job" ADD COLUMN "end_region_new" integer;--> statement-breakpoint
-- Populate new columns by joining on region.code
UPDATE "active_job" SET "start_region_new" = (SELECT id FROM region WHERE code = active_job.start_region) WHERE start_region IS NOT NULL;--> statement-breakpoint
UPDATE "active_job" SET "end_region_new" = (SELECT id FROM region WHERE code = active_job.end_region) WHERE end_region IS NOT NULL;--> statement-breakpoint
-- Drop old columns and rename new ones
ALTER TABLE "active_job" DROP COLUMN "start_region";--> statement-breakpoint
ALTER TABLE "active_job" DROP COLUMN "end_region";--> statement-breakpoint
ALTER TABLE "active_job" RENAME COLUMN "start_region_new" TO "start_region";--> statement-breakpoint
ALTER TABLE "active_job" RENAME COLUMN "end_region_new" TO "end_region";--> statement-breakpoint
-- Drop and recreate places table with new schema
DROP TABLE "places" CASCADE;--> statement-breakpoint
CREATE TABLE "places" (
	"id" bigint PRIMARY KEY NOT NULL,
	"origin_table" "origin_table" NOT NULL,
	"origin_id" bigint NOT NULL,
	"category_id" integer,
	"region_id" integer,
	"geom" geometry(Point, 3857) NOT NULL
);--> statement-breakpoint
-- Add foreign key constraints
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_job_pickup_place_id_places_id_fk" FOREIGN KEY ("job_pickup_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_job_deliver_place_id_places_id_fk" FOREIGN KEY ("job_deliver_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_start_region_region_id_fk" FOREIGN KEY ("start_region") REFERENCES "public"."region"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_end_region_region_id_fk" FOREIGN KEY ("end_region") REFERENCES "public"."region"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_start_place_id_places_id_fk" FOREIGN KEY ("start_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_end_place_id_places_id_fk" FOREIGN KEY ("end_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Create indexes
CREATE INDEX "jobs_start_place_idx" ON "job" USING btree ("start_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "places_origin_unique_idx" ON "places" USING btree ("origin_table","origin_id");--> statement-breakpoint
CREATE INDEX "places_category_id_idx" ON "places" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "places_region_id_idx" ON "places" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "places_category_region_idx" ON "places" USING btree ("category_id","region_id");--> statement-breakpoint
CREATE INDEX "regions_country_code_idx" ON "region" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "regions_name_latin_idx" ON "region" USING btree ("name_latin");--> statement-breakpoint
-- Add unique constraint on region.code
ALTER TABLE "region" ADD CONSTRAINT "region_code_unique" UNIQUE("code");--> statement-breakpoint
-- Create GIST indexes on geometry columns
CREATE INDEX IF NOT EXISTS "idx_regions_geom_gist" ON "region" USING GIST ("geom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_places_geom_gist" ON "places" USING GIST ("geom");--> statement-breakpoint
-- Make region.geom NOT NULL after data is populated (run populate-regions.ts first)
-- ALTER TABLE "region" ALTER COLUMN "geom" SET NOT NULL;