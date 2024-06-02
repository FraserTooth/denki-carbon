import { DateTime } from "luxon";
import { JapanTsoName } from "./const";

export type OldAreaCSVDataProcessed = {
  fromUTC: DateTime;
  toUTC: DateTime;
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

export type AreaDataFileProcessed = {
  tso: JapanTsoName;
  url: string;
  from_datetime: DateTime;
  to_datetime: DateTime;
  raw: string[][]; // Raw CSV data
  data: OldAreaCSVDataProcessed[];
};
