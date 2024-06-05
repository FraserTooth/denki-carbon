CREATE TABLE IF NOT EXISTS "carbon_intensity_forecast_models" (
	"model_id" serial PRIMARY KEY NOT NULL,
	"tso" "tso" NOT NULL,
	"training_data_from" timestamp with time zone NOT NULL,
	"training_data_to" timestamp with time zone NOT NULL,
	"model_name" text NOT NULL,
	"normalisation_factors" json NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
