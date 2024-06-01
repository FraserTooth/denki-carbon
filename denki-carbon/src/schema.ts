import {
  pgTable,
  serial,
  text,
  timestamp,
  date,
  time,
  numeric,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  displayName: text("display_name"),
  email: text("email"),
});

export const areaDataProcessed = pgTable("area_data_processed", {
  id: serial("id").primaryKey(),
  utility: text("utility").notNull(),
  dateJST: date("date_jst").notNull(),
  timeJST: time("time_jst").notNull(),
  datetimeUTC: timestamp("datetime_utc").notNull(),
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
});
