CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "active_job" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"job_id" integer NOT NULL,
	"game_state_id" text NOT NULL,
	"start_time" timestamp with time zone,
	"generated_time" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"duration_seconds" double precision NOT NULL,
	"reward" double precision NOT NULL,
	"driving_xp" integer NOT NULL,
	"job_category" integer NOT NULL,
	"category_xp" integer NOT NULL,
	"employee_start_address_id" varchar NOT NULL,
	"job_address_id" varchar NOT NULL,
	"employee_end_address_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "active_route" (
	"id" text PRIMARY KEY NOT NULL,
	"active_job_id" text NOT NULL,
	"route_data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "address" (
	"id" varchar PRIMARY KEY NOT NULL,
	"street" varchar,
	"house_number" varchar,
	"postcode" varchar,
	"city" varchar,
	"location" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hashed_password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "credential_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"name" text NOT NULL,
	"vehicle_level" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"location" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_state" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"money" double precision DEFAULT 0 NOT NULL,
	"route_level" integer DEFAULT 3 NOT NULL,
	"xp" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"upgrades_purchased" text[] DEFAULT '{}'::text[] NOT NULL,
	"upgrade_effects" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" serial PRIMARY KEY NOT NULL,
	"location" text NOT NULL,
	"start_address_id" varchar NOT NULL,
	"end_address_id" varchar NOT NULL,
	"route_id" text NOT NULL,
	"job_tier" integer NOT NULL,
	"job_category" integer NOT NULL,
	"total_distance_km" double precision NOT NULL,
	"approximate_time_seconds" double precision NOT NULL,
	"generated_time" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"approximate_value" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route" (
	"id" text PRIMARY KEY NOT NULL,
	"start_address_id" varchar NOT NULL,
	"end_address_id" varchar NOT NULL,
	"length_time" double precision NOT NULL,
	"route_data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"username" text,
	"cheats_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_game_state_id_game_state_id_fk" FOREIGN KEY ("game_state_id") REFERENCES "public"."game_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_employee_start_address_id_address_id_fk" FOREIGN KEY ("employee_start_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_job_address_id_address_id_fk" FOREIGN KEY ("job_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_job" ADD CONSTRAINT "active_job_employee_end_address_id_address_id_fk" FOREIGN KEY ("employee_end_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_route" ADD CONSTRAINT "active_route_active_job_id_active_job_id_fk" FOREIGN KEY ("active_job_id") REFERENCES "public"."active_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_game_id_game_state_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game_state"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_state" ADD CONSTRAINT "game_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_start_address_id_address_id_fk" FOREIGN KEY ("start_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_end_address_id_address_id_fk" FOREIGN KEY ("end_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_start_address_id_address_id_fk" FOREIGN KEY ("start_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_end_address_id_address_id_fk" FOREIGN KEY ("end_address_id") REFERENCES "public"."address"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_jobs_game_state_idx" ON "active_job" USING btree ("game_state_id");--> statement-breakpoint
CREATE INDEX "active_jobs_employee_idx" ON "active_job" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "active_jobs_job_idx" ON "active_job" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "active_jobs_generated_time" ON "active_job" USING btree ("generated_time");--> statement-breakpoint
CREATE INDEX "active_jobs_employee_job_idx" ON "active_job" USING btree ("employee_id","job_id");--> statement-breakpoint
CREATE INDEX "active_routes_active_job_idx" ON "active_route" USING btree ("active_job_id");--> statement-breakpoint
CREATE INDEX "addresses_location_idx" ON "address" USING btree ("location");--> statement-breakpoint
CREATE INDEX "addresses_city_idx" ON "address" USING btree ("city");--> statement-breakpoint
CREATE INDEX "addresses_postcode_idx" ON "address" USING btree ("postcode");--> statement-breakpoint
CREATE INDEX "employees_game_id_idx" ON "employee" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_states_user_id_idx" ON "game_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jobs_tier_idx" ON "job" USING btree ("job_tier");--> statement-breakpoint
CREATE INDEX "jobs_category_idx" ON "job" USING btree ("job_category");--> statement-breakpoint
CREATE INDEX "jobs_value_idx" ON "job" USING btree ("approximate_value");--> statement-breakpoint
CREATE INDEX "jobs_generated_time_idx" ON "job" USING btree ("generated_time");--> statement-breakpoint
CREATE INDEX "jobs_location_idx" ON "job" USING btree ("location");--> statement-breakpoint
CREATE INDEX "routes_start_address_idx" ON "route" USING btree ("start_address_id");--> statement-breakpoint
CREATE INDEX "routes_end_address_idx" ON "route" USING btree ("end_address_id");