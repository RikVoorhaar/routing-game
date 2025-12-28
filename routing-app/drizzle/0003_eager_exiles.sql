-- Add order column as nullable initially
ALTER TABLE "employee" ADD COLUMN "order" integer;--> statement-breakpoint
-- Populate order for existing employees using ROW_NUMBER() window function
-- This assigns sequential numbers per game state based on employee creation order
UPDATE "employee" SET "order" = subquery.row_num - 1
FROM (
    SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY id) as row_num
    FROM "employee"
) AS subquery
WHERE "employee".id = subquery.id;--> statement-breakpoint
-- Set column to NOT NULL after population
ALTER TABLE "employee" ALTER COLUMN "order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ALTER COLUMN "order" SET DEFAULT 0;--> statement-breakpoint
-- Create index for efficient ordering queries
CREATE INDEX "employees_game_id_order_idx" ON "employee" USING btree ("game_id","order");