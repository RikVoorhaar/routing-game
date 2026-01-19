ALTER TABLE "places" ALTER COLUMN "region" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "seed" integer;--> statement-breakpoint
ALTER TABLE "game_state" ADD COLUMN "seed_generated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "game_state" SET "seed" = floor(random() * 2147483647)::integer, "seed_generated_at" = COALESCE("created_at", CURRENT_TIMESTAMP) WHERE "seed" IS NULL;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed_generated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed" SET DEFAULT floor(random() * 2147483647)::integer;--> statement-breakpoint
ALTER TABLE "game_state" ALTER COLUMN "seed_generated_at" SET DEFAULT CURRENT_TIMESTAMP;