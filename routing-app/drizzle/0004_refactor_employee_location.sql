-- Add employeeStartLocation JSONB column to active_job table
ALTER TABLE "active_job" ADD COLUMN "employee_start_location" jsonb;--> statement-breakpoint
-- Migrate existing data: extract lat/lon from addresses table for existing employeeStartAddressId values
UPDATE "active_job" SET "employee_start_location" = jsonb_build_object('lat', a.lat, 'lon', a.lon)
FROM "address" a
WHERE "active_job"."employee_start_address_id" = a.id;--> statement-breakpoint
-- Set column to NOT NULL after migration
ALTER TABLE "active_job" ALTER COLUMN "employee_start_location" SET NOT NULL;--> statement-breakpoint
-- Rename job_address_id to job_pickup_address
ALTER TABLE "active_job" RENAME COLUMN "job_address_id" TO "job_pickup_address";--> statement-breakpoint
-- Rename employee_end_address_id to job_deliver_address
ALTER TABLE "active_job" RENAME COLUMN "employee_end_address_id" TO "job_deliver_address";--> statement-breakpoint
-- Drop foreign key constraint on employee_start_address_id
ALTER TABLE "active_job" DROP CONSTRAINT IF EXISTS "active_job_employee_start_address_id_address_id_fk";--> statement-breakpoint
-- Drop employee_start_address_id column
ALTER TABLE "active_job" DROP COLUMN "employee_start_address_id";--> statement-breakpoint
-- Update employee.location JSONB data: convert existing Address objects to Coordinate objects (extract lat/lon)
-- This assumes the location field contains JSONB with lat/lon fields
UPDATE "employee" SET "location" = jsonb_build_object('lat', (location->>'lat')::double precision, 'lon', (location->>'lon')::double precision)
WHERE location IS NOT NULL AND (location->>'lat') IS NOT NULL AND (location->>'lon') IS NOT NULL;
