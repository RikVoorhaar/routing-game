CREATE TABLE "travel_job" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"game_state_id" text NOT NULL,
	"destination_location" jsonb NOT NULL,
	"start_time" timestamp with time zone,
	"duration_seconds" double precision,
	"employee_start_location" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "travel_job" ADD CONSTRAINT "travel_job_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_job" ADD CONSTRAINT "travel_job_game_state_id_game_state_id_fk" FOREIGN KEY ("game_state_id") REFERENCES "public"."game_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "travel_jobs_game_state_idx" ON "travel_job" USING btree ("game_state_id");--> statement-breakpoint
CREATE INDEX "travel_jobs_employee_idx" ON "travel_job" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "travel_jobs_start_time_idx" ON "travel_job" USING btree ("start_time");