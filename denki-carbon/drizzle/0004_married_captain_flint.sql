DO $$ BEGIN
 CREATE TYPE "public"."tso" AS ENUM('hepco', 'tohoku', 'tokyo', 'chubu', 'hokuden', 'kepco', 'chugoku', 'yonden', 'kyuden', 'okinawa');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "area_data_files" ADD COLUMN "tso" "tso" NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_processed" ADD COLUMN "tso" "tso" NOT NULL;--> statement-breakpoint
ALTER TABLE "area_data_files" DROP COLUMN IF EXISTS "utility";--> statement-breakpoint
ALTER TABLE "area_data_processed" DROP COLUMN IF EXISTS "utility";