ALTER TABLE "area_data_files" ALTER COLUMN "last_updated" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "area_data_files" ALTER COLUMN "last_updated" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "datetime_from" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "datetime_to" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "last_updated" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "area_data_processed" DROP COLUMN IF EXISTS "datetime_from_utc";--> statement-breakpoint
ALTER TABLE "area_data_processed" DROP COLUMN IF EXISTS "datetime_to_utc";