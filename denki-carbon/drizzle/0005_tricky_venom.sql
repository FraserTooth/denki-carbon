ALTER TABLE "carbon_intensity_forecasts" RENAME COLUMN "last_updated" TO "created_at";--> statement-breakpoint
ALTER TABLE "area_data_files" ALTER COLUMN "last_updated" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "area_data_files" ALTER COLUMN "last_updated" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ALTER COLUMN "last_updated" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "area_data_processed" ALTER COLUMN "last_updated" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecast_models" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecast_models" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecasts" ALTER COLUMN "predicted_carbon_intensity" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecasts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecasts" ALTER COLUMN "created_at" SET NOT NULL;