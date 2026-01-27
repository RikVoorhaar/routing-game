CREATE TABLE "active_places" (
	"place_id" bigint NOT NULL,
	"region_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
ALTER TABLE "active_places" ADD CONSTRAINT "active_places_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_places" ADD CONSTRAINT "active_places_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_places" ADD CONSTRAINT "active_places_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_places_region_id_idx" ON "active_places" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "active_places_category_id_idx" ON "active_places" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "active_places_region_category_idx" ON "active_places" USING btree ("region_id","category_id");
