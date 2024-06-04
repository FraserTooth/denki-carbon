import { JapanTsoName } from "../src/const";
import { areaDataProcessed } from "../src/schema";

/**
 * Example area data row for TEPCO, new format
 *
 * Scenario is:
 * - TEPCO
 * - Midnight
 * - Pumped storage is charging
 * - Some wind output
 * - No solar output
 */
export const EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO: typeof areaDataProcessed.$inferSelect =
  {
    dataId: "tepco_2024-06-03_00:00",
    tso: JapanTsoName.TEPCO,
    dateJST: "2024-06-02T15:00:00.000Z",
    timeFromJST: "00:00:00",
    timeToJST: "00:30:00",
    datetimeFrom: new Date("2024-06-02T15:00:00.000Z"),
    datetimeTo: new Date("2024-06-02T15:30:00.000Z"),
    totalDemandkWh: "11040000",
    nuclearkWh: "0",
    allfossilkWh: "7599500",
    lngkWh: "5066000",
    coalkWh: "1984000",
    oilkWh: "86500",
    otherFossilkWh: "463000",
    hydrokWh: "908000",
    geothermalkWh: "0",
    biomasskWh: "254000",
    solarOutputkWh: "0",
    solarThrottlingkWh: "0",
    windOutputkWh: "14500",
    windThrottlingkWh: "0",
    pumpedStoragekWh: "-3500",
    batteryStoragekWh: "0",
    interconnectorskWh: "2134500",
    otherkWh: "133500",
    totalkWh: "11040500",
    lastUpdated: new Date("2024-06-03T14:06:33.765Z"),
  };

export const EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_ALL_ZEROS: typeof areaDataProcessed.$inferSelect =
  {
    dataId: "tepco_2024-06-03_00:00",
    tso: JapanTsoName.TEPCO,
    dateJST: "2024-06-02T15:00:00.000Z",
    timeFromJST: "00:00:00",
    timeToJST: "00:30:00",
    datetimeFrom: new Date("2024-06-02T15:00:00.000Z"),
    datetimeTo: new Date("2024-06-02T15:30:00.000Z"),
    totalDemandkWh: "0",
    nuclearkWh: "0",
    allfossilkWh: "0",
    lngkWh: "0",
    coalkWh: "0",
    oilkWh: "0",
    otherFossilkWh: "0",
    hydrokWh: "0",
    geothermalkWh: "0",
    biomasskWh: "0",
    solarOutputkWh: "0",
    solarThrottlingkWh: "0",
    windOutputkWh: "0",
    windThrottlingkWh: "0",
    pumpedStoragekWh: "0",
    batteryStoragekWh: "0",
    interconnectorskWh: "0",
    otherkWh: "0",
    totalkWh: "0",
    lastUpdated: new Date("2024-06-03T14:06:33.765Z"),
  };

/**
 * Example area data row for TEPCO, old format
 *
 * Scenario is:
 * - TEPCO
 * - Midnight
 * - Pumped storage is not charging
 * - Some wind output
 * - No solar output
 */
export const EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT: typeof areaDataProcessed.$inferSelect =
  {
    dataId: "tepco_2016-04-01_00:00",
    tso: "tepco",
    dateJST: "2016-03-31T15:00:00.000Z",
    timeFromJST: "00:00:00",
    timeToJST: "01:00:00",
    datetimeFrom: new Date("2016-03-31T15:00:00.000Z"),
    datetimeTo: new Date("2016-03-31T16:00:00.000Z"),
    totalDemandkWh: "25550000",
    nuclearkWh: "0",
    allfossilkWh: "22580000",
    lngkWh: null,
    coalkWh: null,
    oilkWh: null,
    otherFossilkWh: null,
    hydrokWh: "920000",
    geothermalkWh: "0",
    biomasskWh: "20000",
    solarOutputkWh: "0",
    solarThrottlingkWh: "0",
    windOutputkWh: "20000",
    windThrottlingkWh: "0",
    pumpedStoragekWh: "0",
    batteryStoragekWh: null,
    interconnectorskWh: "2010000",
    otherkWh: null,
    totalkWh: "25550000",
    lastUpdated: new Date("2024-06-03T14:06:27.464Z"),
  };

export const EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT_ALL_ZEROS: typeof areaDataProcessed.$inferSelect =
  {
    dataId: "tepco_2016-04-01_00:00",
    tso: "tepco",
    dateJST: "2016-03-31T15:00:00.000Z",
    timeFromJST: "00:00:00",
    timeToJST: "01:00:00",
    datetimeFrom: new Date("2016-03-31T15:00:00.000Z"),
    datetimeTo: new Date("2016-03-31T16:00:00.000Z"),
    totalDemandkWh: "25550000",
    nuclearkWh: "0",
    allfossilkWh: "0",
    lngkWh: null,
    coalkWh: null,
    oilkWh: null,
    otherFossilkWh: null,
    hydrokWh: "0",
    geothermalkWh: "0",
    biomasskWh: "0",
    solarOutputkWh: "0",
    solarThrottlingkWh: "0",
    windOutputkWh: "0",
    windThrottlingkWh: "0",
    pumpedStoragekWh: "0",
    batteryStoragekWh: null,
    interconnectorskWh: "0",
    otherkWh: null,
    totalkWh: "0",
    lastUpdated: new Date("2024-06-03T14:06:27.464Z"),
  };

export const EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT_ZERO_FOSSILS: typeof areaDataProcessed.$inferSelect =
  {
    dataId: "tepco_2016-04-01_00:00",
    tso: "tepco",
    dateJST: "2016-03-31T15:00:00.000Z",
    timeFromJST: "00:00:00",
    timeToJST: "01:00:00",
    datetimeFrom: new Date("2016-03-31T15:00:00.000Z"),
    datetimeTo: new Date("2016-03-31T16:00:00.000Z"),
    totalDemandkWh: "25550000",
    nuclearkWh: "0",
    allfossilkWh: "0",
    lngkWh: null,
    coalkWh: null,
    oilkWh: null,
    otherFossilkWh: null,
    hydrokWh: "920000",
    geothermalkWh: "0",
    biomasskWh: "20000",
    solarOutputkWh: "0",
    solarThrottlingkWh: "0",
    windOutputkWh: "20000",
    windThrottlingkWh: "0",
    pumpedStoragekWh: "0",
    batteryStoragekWh: null,
    interconnectorskWh: "2010000",
    otherkWh: null,
    totalkWh: "25550000",
    lastUpdated: new Date("2024-06-03T14:06:27.464Z"),
  };
