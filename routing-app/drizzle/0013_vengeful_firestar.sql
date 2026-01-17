CREATE TABLE "places" (
	"id" bigint PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"x_mercator" double precision NOT NULL,
	"y_mercator" double precision NOT NULL,
	"region" varchar NOT NULL,
	"tile_x" integer NOT NULL,
	"tile_y" integer NOT NULL,
	"location_4326" text NOT NULL,
	"location_3857" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "places_tile_idx" ON "places" USING btree ("tile_x","tile_y");
--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_region_region_code_fk" FOREIGN KEY ("region") REFERENCES "public"."region"("code") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_places_location_4326_gist 
ON places USING GIST (ST_GeomFromEWKT(location_4326));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_places_location_3857_gist 
ON places USING GIST (ST_GeomFromEWKT(location_3857));