import { DateTime } from "luxon";
import { JapanTsoName } from "./const";

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
  totalkWh?: number; // 合計
};

export type AreaDataFileProcessed = {
  tso: JapanTsoName;
  url: string;
  fromDatetime: DateTime;
  toDatetime: DateTime;
  raw: string[][]; // Raw CSV data
  data: AreaCSVDataProcessed[];
};
