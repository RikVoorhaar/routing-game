ALTER TABLE "game_state" ALTER COLUMN "seed" SET DEFAULT floor(random() * 2147483647)::integer;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed_generated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed_generated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "active_job" ADD COLUMN "start_region" varchar;--> statement-breakpoint
ALTER TABLE "active_job" ADD COLUMN "end_region" varchar;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_start_region_region_code_fk" FOREIGN KEY ("start_region") REFERENCES "public"."region"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_end_region_region_code_fk" FOREIGN KEY ("end_region") REFERENCES "public"."region"("code") ON DELETE restrict ON UPDATE no action;