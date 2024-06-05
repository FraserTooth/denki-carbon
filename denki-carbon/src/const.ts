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
