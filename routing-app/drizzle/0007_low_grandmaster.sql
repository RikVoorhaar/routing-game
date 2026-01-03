ALTER TABLE "route" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "route" CASCADE;--> statement-breakpoint
-- Note: DROP TABLE CASCADE already drops the foreign key constraint, so we don't need to drop it separately
-- ALTER TABLE "job" DROP CONSTRAINT "job_route_id_route_id_fk";
--> statement-breakpoint
ALTER TABLE "active_route" ADD COLUMN "route_data_gzip" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "active_route" DROP COLUMN "route_data";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "route_id";