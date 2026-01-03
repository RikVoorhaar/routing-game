DROP INDEX "jobs_value_idx";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "approximate_time_seconds";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "approximate_value";