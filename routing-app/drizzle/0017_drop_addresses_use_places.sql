-- Drop foreign key constraints first
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_job_pickup_address_address_id_fk";--> statement-breakpoint
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_job_deliver_address_address_id_fk";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT IF EXISTS "job_start_address_id_address_id_fk";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT IF EXISTS "job_end_address_id_address_id_fk";--> statement-breakpoint
-- Truncate tables first (no important data to preserve)
TRUNCATE TABLE "active_job" CASCADE;--> statement-breakpoint
TRUNCATE TABLE "job" CASCADE;--> statement-breakpoint
-- Add new place foreign key columns (NOT NULL since tables are now empty)
ALTER TABLE "active_job" ADD COLUMN "job_pickup_place_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "active_job" ADD COLUMN "job_deliver_place_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "start_place_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "end_place_id" bigint NOT NULL;--> statement-breakpoint
-- Drop old address columns
ALTER TABLE "active_job" DROP COLUMN "job_pickup_address";--> statement-breakpoint
ALTER TABLE "active_job" DROP COLUMN "job_deliver_address";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "start_address_id";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "end_address_id";--> statement-breakpoint
-- Add foreign key constraints for places
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_job_pickup_place_id_places_id_fk" FOREIGN KEY ("job_pickup_place_id") REFERENCES "places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_job_deliver_place_id_places_id_fk" FOREIGN KEY ("job_deliver_place_id") REFERENCES "places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_start_place_id_places_id_fk" FOREIGN KEY ("start_place_id") REFERENCES "places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_end_place_id_places_id_fk" FOREIGN KEY ("end_place_id") REFERENCES "places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Drop addresses table entirely
DROP TABLE IF EXISTS "address" CASCADE;
