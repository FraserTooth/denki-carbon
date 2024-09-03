import { JapanInterconnectorDetails } from "./types";

export enum JapanTsoName {
  HEPCO = "hepco",
  TOHOKU = "tohoku",
  TEPCO = "tepco",
  CHUBU = "chubu",
  HOKUDEN = "hokuden",
  KEPCO = "kepco",
  CHUGOKU = "chugoku",
  YONDEN = "yonden",
  KYUDEN = "kyuden",
  OEPC = "okinawa",
}

/**
 * The type of generation
 */
export enum GenerationSource {
  /** 原子力 */
  NUCLEAR = "nuclear",
  /** 火力(LNG) */
  LNG = "lng",
  /** 火力(石炭) */
  COAL = "coal",
  /** 火力(石油) */
  OIL = "oil",
  /**
   * 火力(その他) - e.g. mixed fuel
   * From TEPCO:
   *  - "「火力(その他)」は、主な燃種がLNG・石炭・石油の中から特定できない混焼火力や燃種切替可能な火力となります。"
   *  - "Thermal power (other)" refers to mixed-fuel power plants where the main fuel is not specified as being LNG, coal, or oil, and thermal power plants where the fuel type can be switched.
   */
  OTHER_FOSSIL = "other_fossil",
  /** 水力 */
  HYDRO = "hydro",
  /** 地熱 */
  GEOTHERMAL = "geothermal",
  /** バイオマス */
  BIOMASS = "biomass",
  /** 太陽光発電実績 */
  SOLAR = "solar",
  /** 風力発電実績 */
  WIND = "wind",
  /**
   * 揚水
   * Note: This only counts as generation when the pumped hydro is exporting power.
   */
  PUMPED_HYDRO = "pumped_hydro",
  /**
   * 蓄電池
   * Note: This only counts as generation when the battery is exporting power.
   */
  BATTERY = "battery",
  /** 連系線
   * Note: This only counts as generation when the interconnector is importing power.
   */
  INTERCONNECTORS = "interconnectors",
  /** その他 - e.g. VPPs
   * From TEPCO:
   * -「その他」は既設の電源別に区分できない発電所（VPP等）や燃種が把握できない発電所を含みます。
   * - "Other" includes power plants (VPPs, etc.) and power plants where the fuel type cannot be identified that cannot be classified by existing power sources.
   */
  OTHER = "other",
}

// Gets us to Watts, which is the lowest common denominator for power
export const DECIMAL_PLACES = 3;

export const SUPPORTED_TSOS = [
  JapanTsoName.HEPCO,
  JapanTsoName.TOHOKU,
  JapanTsoName.TEPCO,
  JapanTsoName.CHUBU,
  JapanTsoName.HOKUDEN,
  JapanTsoName.KEPCO,
  JapanTsoName.CHUGOKU,
  JapanTsoName.YONDEN,
  JapanTsoName.KYUDEN,
  JapanTsoName.OEPC,
];

/**
 * Interconnector names
 */
export enum JapanInterconnectors {
  // 50Hz side
  HEPCO_TOHOKU = "HEPCO_TOHOKU",
  TOHOKU_TEPCO = "TOHOKU_TEPCO",
  /** 50Hz/60Hz crossover */
  TEPCO_CHUBU = "TEPCO_CHUBU",
  // 60Hz side
  CHUBU_HOKUDEN = "CHUBU_HOKUDEN",
  CHUBU_KEPCO = "CHUBU_KEPCO",
  HOKUDEN_KEPCO = "HOKUDEN_KEPCO",
  KEPCO_CHUGOKU = "KEPCO_CHUGOKU",
  KEPCO_YONDEN = "KEPCO_YONDEN",
  CHUGOKU_YONDEN = "CHUGOKU_YONDEN",
  CHUGOKU_KYUDEN = "CHUGOKU_KYUDEN",
}
/**
 * Details about the Japanese interconnector
 *
 * As listed in the OCCTO data:
 * "北海道・本州間電力連系設備", - 北海道-本州間
 * "相馬双葉幹線", - 東北-東京間
 * "周波数変換設備", - 東京-中部間
 * "三重東近江線", - 中部-関西間
 * "南福光連系所・南福光変電所の連系設備", - 中部-北陸間
 * "越前嶺南線", - 北陸-関西間
 * "西播東岡山線・山崎智頭線", - 関西-中国間
 * "阿南紀北直流幹線", - 関西-四国間
 * "本四連系線", - 中国-四国間
 * "関門連系線", - 中国-九州間
 * "北陸フェンス" - 中部・関西-北陸間
 */
export const INTERCONNECTOR_DETAILS: Record<
  JapanInterconnectors,
  JapanInterconnectorDetails
> = {
  [JapanInterconnectors.HEPCO_TOHOKU]: {
    from: JapanTsoName.HEPCO,
    to: JapanTsoName.TOHOKU,
    occtoName: "北海道・本州間電力連系設備",
    capacityMW: 900,
  },
  [JapanInterconnectors.TOHOKU_TEPCO]: {
    from: JapanTsoName.TOHOKU,
    to: JapanTsoName.TEPCO,
    occtoName: "相馬双葉幹線",
    capacityMW: 6050,
  },
  [JapanInterconnectors.TEPCO_CHUBU]: {
    from: JapanTsoName.TEPCO,
    to: JapanTsoName.CHUBU,
    occtoName: "周波数変換設備",
    capacityMW: 2100,
  },
  [JapanInterconnectors.CHUBU_KEPCO]: {
    from: JapanTsoName.CHUBU,
    to: JapanTsoName.KEPCO,
    occtoName: "三重東近江線",
    capacityMW: 2500,
  },
  [JapanInterconnectors.CHUBU_HOKUDEN]: {
    from: JapanTsoName.CHUBU,
    to: JapanTsoName.HOKUDEN,
    occtoName: "南福光連系所・南福光変電所の連系設備",
    capacityMW: 300,
  },

  [JapanInterconnectors.HOKUDEN_KEPCO]: {
    from: JapanTsoName.HOKUDEN,
    to: JapanTsoName.KEPCO,
    occtoName: "越前嶺南線",
    capacityMW: 1900,
  },
  [JapanInterconnectors.KEPCO_CHUGOKU]: {
    from: JapanTsoName.KEPCO,
    to: JapanTsoName.CHUGOKU,
    occtoName: "西播東岡山線・山崎智頭線",
    capacityMW: 4250,
  },
  [JapanInterconnectors.KEPCO_YONDEN]: {
    from: JapanTsoName.KEPCO,
    to: JapanTsoName.YONDEN,
    occtoName: "阿南紀北直流幹線",
    capacityMW: 1400,
  },
  [JapanInterconnectors.CHUGOKU_YONDEN]: {
    from: JapanTsoName.CHUGOKU,
    to: JapanTsoName.YONDEN,
    occtoName: "本四連系線",
    capacityMW: 2400,
  },
  [JapanInterconnectors.CHUGOKU_KYUDEN]: {
    from: JapanTsoName.CHUGOKU,
    to: JapanTsoName.KYUDEN,
    occtoName: "関門連系線",
    capacityMW: 2780,
  },
};
