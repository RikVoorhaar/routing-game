CREATE TABLE "region" (
	"code" varchar PRIMARY KEY NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"name_latn" text NOT NULL
);
--> statement-breakpoint
-- Truncate address table CASCADE to remove all existing data (required before adding NOT NULL FK)
TRUNCATE TABLE "address" CASCADE;--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "region" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "address" ADD CONSTRAINT "address_region_region_code_fk" FOREIGN KEY ("region") REFERENCES "public"."region"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_region_idx" ON "address" USING btree ("region");