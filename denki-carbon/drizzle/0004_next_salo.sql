CREATE TABLE IF NOT EXISTS "carbon_intensity_forecasts" (
	"forecast_id" serial PRIMARY KEY NOT NULL,
	"tso" "tso" NOT NULL,
	"datetime_utc" timestamp with time zone NOT NULL,
	"datetime_to" timestamp with time zone NOT NULL,
	"predicted_carbon_intensity" numeric,
	"model_used_id" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "carbon_intensity_forecasts" ADD CONSTRAINT "carbon_intensity_forecasts_model_used_id_carbon_intensity_forecast_models_model_id_fk" FOREIGN KEY ("model_used_id") REFERENCES "public"."carbon_intensity_forecast_models"("model_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tso_idx" ON "carbon_intensity_forecasts" ("tso");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datetime_from_idx" ON "carbon_intensity_forecasts" ("datetime_utc");