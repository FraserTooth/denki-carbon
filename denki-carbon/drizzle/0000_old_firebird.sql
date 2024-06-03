DO $$ BEGIN
 CREATE TYPE "public"."tso" AS ENUM('hepco', 'tohoku', 'tepco', 'chubu', 'hokuden', 'kepco', 'chugoku', 'yonden', 'kyuden', 'okinawa');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "area_data_files" (
	"fileKey" text PRIMARY KEY NOT NULL,
	"tso" "tso" NOT NULL,
	"from_datetime" timestamp with time zone NOT NULL,
	"to_datetime" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	"data_rows" integer NOT NULL,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "area_data_processed" (
	"dataId" text PRIMARY KEY NOT NULL,
	"tso" "tso" NOT NULL,
	"date_jst" date NOT NULL,
	"time_from_jst" time NOT NULL,
	"time_to_jst" time NOT NULL,
	"datetime_from" timestamp with time zone NOT NULL,
	"datetime_to" timestamp with time zone NOT NULL,
	"total_demand_kwh" numeric,
	"nuclear_kwh" numeric,
	"all_fossil_kwh" numeric,
	"hydro_kwh" numeric,
	"geothermal_kwh" numeric,
	"biomass_kwh" numeric,
	"solar_output_kwh" numeric,
	"solar_throttling_kwh" numeric,
	"wind_output_kwh" numeric,
	"wind_throttling_kwh" numeric,
	"pumped_storage_kwh" numeric,
	"interconnectors_kwh" numeric,
	"total_kwh" numeric,
	"last_updated" timestamp DEFAULT now()
);
