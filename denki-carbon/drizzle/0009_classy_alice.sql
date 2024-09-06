DO $$ BEGIN
 CREATE TYPE "public"."interconnector" AS ENUM('HEPCO_TOHOKU', 'TOHOKU_TEPCO', 'TEPCO_CHUBU', 'CHUBU_HOKUDEN', 'CHUBU_KEPCO', 'HOKUDEN_KEPCO', 'KEPCO_CHUGOKU', 'KEPCO_YONDEN', 'CHUGOKU_YONDEN', 'CHUGOKU_KYUDEN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interconnector_data_processed" (
	"data_id" text PRIMARY KEY NOT NULL,
	"interconnector" "interconnector" NOT NULL,
	"date_jst" date NOT NULL,
	"time_from_jst" time NOT NULL,
	"time_to_jst" time NOT NULL,
	"datetime_from" timestamp with time zone NOT NULL,
	"datetime_to" timestamp with time zone NOT NULL,
	"power_kwh" numeric NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
