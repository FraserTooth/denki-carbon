import { DateTime } from "luxon";

export type OldAreaCSVDataProcessed = {
  datetimeUTC: DateTime;
  totalDemandkWh: number;
  nuclearkWh: number;
  allfossilkWh: number;
  hydrokWh: number;
  geothermalkWh: number;
  biomasskWh: number;
  solarOutputkWh: number;
  solarThrottlingkWh: number;
  windOutputkWh: number;
  windThrottlingkWh: number;
  pumpedStoragekWh: number;
  interconnectorskWh: number;
  totalkWh: number;
};
