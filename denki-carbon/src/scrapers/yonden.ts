import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../const";
import { ScrapeType, downloadCSV, getCSVUrlsFromPage } from ".";
import { logger } from "../utils";

const CSV_URL = `https://www.yonden.co.jp/nw/supply_demand/data_download.html`;
const LIVE_CSV_URL = `https://www.yonden.co.jp/nw/supply_demand/index.html`;

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 9,
  firstHeader: "DATE",
  intervalMinutes: 60,
};

const NEW_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "Shift_JIS",
  headerRows: 2,
  intervalMinutes: 30,
};

const parseDpToKwh = (raw: string): number => {
  // Return 0 for placeholder values
  const placeholders = ["－", ""];
  if (placeholders.includes(raw)) return 0;
  try {
    const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
    // Values are in 万kWh, so multiply by 10000 to get kWh
    return parseFloat(cleaned) * 10000;
  } catch (error) {
    logger.error(`Failed to parse ${raw} to kWh`);
    throw error;
  }
};

const parseAverageMWFor30minToKwh = (raw: string): number => {
  const placeholders = ["－", ""];
  if (placeholders.includes(raw)) return 0;
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in MW, so multiply by 1000 to get kW
  const averageKw = parseFloat(cleaned) * 1000;
  // Multiply by hours to get kWh
  return averageKw * (30 / 60);
};

const parseOldCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  const headerRow = csv.findIndex((row) =>
    row[0].includes(OLD_CSV_FORMAT.firstHeader)
  );
  // Header for the xlsx files is split across 3 rows
  const dataRows = csv.slice(headerRow + 3);
  const data: AreaCSVDataProcessed[] = dataRows.map((row, i) => {
    const [
      date, // "DATE"
      time, // "TIME"
      totalDemand_daMWh, // "エリア需要"
      nuclear_daMWh, // "原子力"
      allfossil_daMWh, // "火力"
      hydro_daMWh, // "水力"
      geothermal_daMWh, // "地熱"
      biomass_daMWh, // "バイオマス"
      solarOutput_daMWh, // "太陽光 <newCell> 実績"
      solarThrottling_daMWh, // "太陽光 <newCell> 制御量"
      windOutput_daMWh, // "風力 <newCell> 実績"
      windThrottling_daMWh, // "風力 <newCell> 制御量"
      pumpedStorage_daMWh, // "揚水"
      interconnectors_daMWh, // "連系線"
      total_daMWh, // "合計"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/MM/dd H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    try {
      const parsed = {
        fromUTC,
        toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT.intervalMinutes }),
        totalDemandkWh: parseDpToKwh(totalDemand_daMWh),
        nuclearkWh: parseDpToKwh(nuclear_daMWh),
        allfossilkWh: parseDpToKwh(allfossil_daMWh),
        hydrokWh: parseDpToKwh(hydro_daMWh),
        geothermalkWh: parseDpToKwh(geothermal_daMWh),
        biomasskWh: parseDpToKwh(biomass_daMWh),
        solarOutputkWh: parseDpToKwh(solarOutput_daMWh),
        solarThrottlingkWh: parseDpToKwh(solarThrottling_daMWh),
        windOutputkWh: parseDpToKwh(windOutput_daMWh),
        windThrottlingkWh: parseDpToKwh(windThrottling_daMWh),
        pumpedStoragekWh: parseDpToKwh(pumpedStorage_daMWh),
        interconnectorskWh: parseDpToKwh(interconnectors_daMWh),
        totalkWh: parseDpToKwh(total_daMWh),
      };
      return parsed;
    } catch (e) {
      logger.error(`Failed to parse row index ${i}: ${row}`);
      throw e;
    }
  });

  return data;
};

const parseNewCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  const dataRows = csv.slice(NEW_CSV_FORMAT.headerRows);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "DATE"
      time, // "TIME"
      totalDemandAverageMW, // "エリア需要"
      nuclearAverageMW, // "原子力"
      lngAverageMW, // "火力(LNG)"
      coalAverageMW, // "火力(石炭)"
      oilAverageMW, // "火力(石油)"
      otherFossilAverageMW, // "火力(その他)"
      hydroAverageMW, // "水力"
      geothermalAverageMW, // "地熱"
      biomassAverageMW, // "バイオマス"
      solarOutputAverageMW, // "太陽光発電実績"
      solarThrottlingAverageMW, // "太陽光出力制御量"
      windOutputAverageMW, // "風力発電実績"
      windThrottlingAverageMW, // "風力出力制御量"
      pumpedStorageAverageMW, // "揚水"
      batteryStorageAverageMW, // "蓄電池"
      interconnectorsAverageMW, // "連系線"
      otherAverageMW, // "その他"
      totalAverageMW, // "合計"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    const lngkWh = parseAverageMWFor30minToKwh(lngAverageMW);
    const coalkWh = parseAverageMWFor30minToKwh(coalAverageMW);
    const oilkWh = parseAverageMWFor30minToKwh(oilAverageMW);
    const otherFossilkWh = parseAverageMWFor30minToKwh(otherFossilAverageMW);
    return {
      fromUTC,
      toUTC: fromUTC.plus({ minutes: NEW_CSV_FORMAT.intervalMinutes }),
      totalDemandkWh: parseAverageMWFor30minToKwh(totalDemandAverageMW),
      nuclearkWh: parseAverageMWFor30minToKwh(nuclearAverageMW),
      allfossilkWh: lngkWh + coalkWh + oilkWh + otherFossilkWh,
      lngkWh,
      coalkWh,
      oilkWh,
      otherFossilkWh,
      hydrokWh: parseAverageMWFor30minToKwh(hydroAverageMW),
      geothermalkWh: parseAverageMWFor30minToKwh(geothermalAverageMW),
      biomasskWh: parseAverageMWFor30minToKwh(biomassAverageMW),
      solarOutputkWh: parseAverageMWFor30minToKwh(solarOutputAverageMW),
      solarThrottlingkWh: parseAverageMWFor30minToKwh(solarThrottlingAverageMW),
      windOutputkWh: parseAverageMWFor30minToKwh(windOutputAverageMW),
      windThrottlingkWh: parseAverageMWFor30minToKwh(windThrottlingAverageMW),
      pumpedStoragekWh: parseAverageMWFor30minToKwh(pumpedStorageAverageMW),
      batteryStoragekWh: parseAverageMWFor30minToKwh(batteryStorageAverageMW),
      interconnectorskWh: parseAverageMWFor30minToKwh(interconnectorsAverageMW),
      otherkWh: parseAverageMWFor30minToKwh(otherAverageMW),
      totalkWh: parseAverageMWFor30minToKwh(totalAverageMW),
    };
  });
  // Remove NaN rows
  const dataFiltered = data.filter((row) => !isNaN(row.totalDemandkWh));
  logger.debug({ rowsSkipped: data.length - dataFiltered.length });
  return dataFiltered;
};

export const getYondenAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. jukyu2023.xlsx
    // https://www.yonden.co.jp/nw/supply_demand/jukyu2023.xlsx
    RegExp(/jukyu\d\d\d\d.xlsx/),
    "https://www.yonden.co.jp/nw/supply_demand/"
  );
  const oldUrls = oldCsvUrls.map((url) => ({ url, format: "old" }));

  const newCsvUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. csv/eria_jukyu_202406_08.csv
    // https://www.yonden.co.jp/nw/supply_demand/csv/eria_jukyu_202403_08.csv
    RegExp(/eria_jukyu_\d\d\d\d\d\d_08.csv/),
    "https://www.yonden.co.jp/nw/supply_demand/"
  );

  const newUrls = newCsvUrls.map((url) => ({ url, format: "new" }));

  const latestCsvUrls = await getCSVUrlsFromPage(
    LIVE_CSV_URL,
    // e.g. csv/eria_jukyu_202407_08.csv
    // https://www.yonden.co.jp/nw/supply_demand/csv/eria_jukyu_202407_08.csv
    RegExp(/eria_jukyu_\d\d\d\d\d\d_08.csv/),
    "https://www.yonden.co.jp/nw/supply_demand/"
  );
  const latestUrls = latestCsvUrls.map((url) => ({ url, format: "new" }));

  const urlsToDownload = (() => {
    if (scrapeType === ScrapeType.All)
      return [...oldUrls, ...newUrls, ...latestUrls];
    if (scrapeType === ScrapeType.New) return [...newUrls, ...latestUrls];
    if (scrapeType === ScrapeType.Latest) return [...latestUrls];
    throw new Error(`Invalid scrape type: ${scrapeType}`);
  })();

  logger.debug({ urlsToDownload: urlsToDownload });

  const dataByCSV = await Promise.all(
    urlsToDownload.map(async (file) => {
      const { url, format } = file;
      const { parser, blocksInDay, encoding, headerRows } =
        format === "old"
          ? {
              parser: parseOldCSV,
              ...OLD_CSV_FORMAT,
            }
          : url.includes("zip")
            ? {
                parser: parseNewCSV,
                ...NEW_CSV_FORMAT,
              }
            : {
                parser: parseNewCSV,
                ...NEW_CSV_FORMAT,
              };

      logger.debug({ downloading: url });

      const csv = await downloadCSV(url, encoding);
      const data = parser(csv);
      logger.debug({
        url: url,
        rows: data.length,
        days: data.length / blocksInDay,
      });
      return {
        tso: JapanTsoName.YONDEN,
        url,
        fromDatetime: data[0].fromUTC,
        toDatetime: data[data.length - 1].toUTC,
        data,
        raw: csv.slice(headerRows),
      };
    })
  );

  return dataByCSV;
};
