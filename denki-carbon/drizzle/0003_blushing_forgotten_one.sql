CREATE TABLE IF NOT EXISTS "area_data_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"utility" text NOT NULL,
	"from_datetime" timestamp NOT NULL,
	"to_datetime" timestamp NOT NULL,
	"url" text NOT NULL,
	"last_updated" timestamp NOT NULL
);
