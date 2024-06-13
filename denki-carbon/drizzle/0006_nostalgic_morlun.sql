ALTER TABLE "carbon_intensity_forecasts" DROP CONSTRAINT "carbon_intensity_forecasts_model_used_id_carbon_intensity_forecast_models_model_id_fk";
--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecasts" ADD COLUMN "model_used" text NOT NULL;--> statement-breakpoint
ALTER TABLE "carbon_intensity_forecasts" DROP COLUMN IF EXISTS "model_used_id";