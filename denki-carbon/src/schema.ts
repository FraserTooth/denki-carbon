import {
  pgTable,
  serial,
  text,
  timestamp,
  date,
  time,
  numeric,
  pgEnum,
} from "drizzle-orm/pg-core";
import { JapanTsoName } from "./const";

/**
 * Converts an enum to a Postgres enum for Drizzle
 */
export const enumToPgEnum = (myEnum: any): [string, ...string[]] => {
  return Object.values(myEnum) as [typeof myEnum, ...(typeof myEnum)[]];
};

export const tsoEnum = pgEnum("tso", enumToPgEnum(JapanTsoName));

export const areaDataFiles = pgTable("area_data_files", {
  id: serial("id").primaryKey(),
  tso: tsoEnum("tso").notNull(),
  from_datetime: timestamp("from_datetime").notNull(),
  to_datetime: timestamp("to_datetime").notNull(),
  url: text("url").notNull(),
  last_updated: timestamp("last_updated").defaultNow(),
});

export const areaDataProcessed = pgTable("area_data_processed", {
  dataId: text("dataId").primaryKey(),
  tso: tsoEnum("tso").notNull(),
  dateJST: date("date_jst", { mode: "string" }).notNull(),
  timeFromJST: time("time_from_jst").notNull(),
  timeToJST: time("time_to_jst").notNull(),
  datetimeFrom: timestamp("datetime_from", {
    withTimezone: true,
  }).notNull(),
  datetimeTo: timestamp("datetime_to", {
    withTimezone: true,
  }).notNull(),
  totalDemandkWh: numeric("total_demand_kwh"),
  nuclearkWh: numeric("nuclear_kwh"),
  allfossilkWh: numeric("all_fossil_kwh"),
  hydrokWh: numeric("hydro_kwh"),
  geothermalkWh: numeric("geothermal_kwh"),
  biomasskWh: numeric("biomass_kwh"),
  solarOutputkWh: numeric("solar_output_kwh"),
  solarThrottlingkWh: numeric("solar_throttling_kwh"),
  windOutputkWh: numeric("wind_output_kwh"),
  windThrottlingkWh: numeric("wind_throttling_kwh"),
  pumpedStoragekWh: numeric("pumped_storage_kwh"),
  interconnectorskWh: numeric("interconnectors_kwh"),
  totalkWh: numeric("total_kwh"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});
