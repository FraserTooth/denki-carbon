ALTER TABLE "area_data_processed" RENAME COLUMN "id" TO "dataId";--> statement-breakpoint
ALTER TABLE "area_data_processed" ALTER COLUMN "dataId" SET DATA TYPE text;