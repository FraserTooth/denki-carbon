import { DateTime } from "luxon";
import { JapanInterconnectors, JapanTsoName } from "./const";

export type AreaCSVDataProcessed = {
  fromUTC: DateTime;
  toUTC: DateTime;
  totalDemandkWh: number; // エリア需要
  nuclearkWh: number; // 原子力
  allfossilkWh: number; // 火力(LNG) + 火力(石炭) + 火力(石油) + 火力(その他)
  lngkWh?: number; // 火力(LNG)
  coalkWh?: number; // 火力(石炭)
  oilkWh?: number; // 火力(石油)
  otherFossilkWh?: number; // 火力(その他)
  hydrokWh: number; // 水力
  geothermalkWh: number; // 地熱
  biomasskWh: number; // バイオマス
  solarOutputkWh: number; // 太陽光発電実績
  solarThrottlingkWh: number; // 太陽光出力制御量
  windOutputkWh: number; // 風力発電実績
  windThrottlingkWh: number; // 風力出力制御量
  pumpedStoragekWh: number; // 揚水
  batteryStoragekWh?: number; // 蓄電池
  interconnectorskWh: number; // 連系線
  otherkWh?: number; // その他
  // Note: would be 合計 but this subtracts storage charging and interconnectors
  totalGenerationkWh: number; // Sum of all generation and positive values for storage/interconnectors
};

export type AreaDataFileProcessed = {
  tso: JapanTsoName;
  url: string;
  fromDatetime: DateTime;
  toDatetime: DateTime;
  raw: string[][]; // Raw CSV data
  data: AreaCSVDataProcessed[];
};
/**
 * The from/to pair defines the direction of the interconnector, so the flow is positive when
 * power is flowing from the "from" TSO to the "to" TSO.
 *
 * Capacity is assumed bidirectional for now, its probably not the case in reality and
 * the capacity is limited at any given time by heat and other factors. So its just a rough guide.
 */
export type JapanInterconnectorDetails = {
  id: JapanInterconnectors;
  /** The TSO from which Export is Positive in the OCCTO data */
  from: JapanTsoName;
  /** The TSO from which Export is Negative in the OCCTO data */
  to: JapanTsoName;
  /** The OCCTO name for the interconnector */
  occtoName: string;
  /** The maximum MW at any one time the interconnecter can transmit */
  capacityMW: number;
};

export type RawOcctoInterconnectorData = {
  /**
   * Raw Name for the interconnector as listed in the data,
   * its an annoying long technical name in Kanji, should match
   * an occtoName value in INTERCONNECTOR_DETAILS
   */
  interconnectorNameRaw: string;
  /** Format yyyy/MM/dd */
  dateRaw: string;
  /** Format HH:mm */
  timeRaw: string;
  /** The Interconnector Enum as matched to the raw data string */
  interconnector: JapanInterconnectors;
  /** Timestamp represents the END of the 5min period */
  timestamp: DateTime;
  /** Seems to be the Average Power througout the period */
  powerMW: number;
};

export type InterconnectorDataProcessed = {
  interconnector: JapanInterconnectors;
  fromUTC: DateTime;
  toUTC: DateTime;
  flowkWh: number;
};
