ALTER TABLE "area_data_processed" ADD COLUMN "time_from_jst" time NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "time_to_jst" time NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "datetime_from_utc" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "datetime_to_utc" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" DROP COLUMN IF EXISTS "time_jst";--> statement-breakpoint
ALTER TABLE "area_data_processed" DROP COLUMN IF EXISTS "datetime_utc";