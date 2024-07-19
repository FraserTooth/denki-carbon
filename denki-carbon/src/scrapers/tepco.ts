import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../const";
import { ScrapeType } from ".";
import { logger } from "../utils";
import {
  downloadCSV,
  getCSVUrlsFromPage,
  NEW_CSV_FORMAT,
  parseNewCSV,
} from "./utils";

const OLD_CSV_URL = `https://www.tepco.co.jp/forecast/html/area_jukyu_p-j.html`;

const NEW_CSV_URL = `https://www.tepco.co.jp/forecast/html/area_jukyu-j.html`;

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 3,
  intervalMinutes: 60,
};

const parseDpToKwh = (raw: string): number => {
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in 万kWh, so multiply by 10000 to get kWh
  return parseFloat(cleaned) * 10000;
};

const parseAverageMWFor30minToKwh = (raw: string): number => {
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in MW, so multiply by 1000 to get kW
  const averageKw = parseFloat(cleaned) * 1000;
  // Multiply by hours to get kWh
  return averageKw * (30 / 60);
};

const parseOldCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  // Trim 3 header rows
  const dataRows = csv.slice(OLD_CSV_FORMAT.headerRows);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "DATE"
      time, // "TIME"
      totalDemand_daMWh, // "東京エリア需要"
      nuclear_daMWh, // "原子力"
      allfossil_daMWh, // "火力"
      hydro_daMWh, // "水力"
      geothermal_daMWh, // "地熱"
      biomass_daMWh, // "バイオマス"
      solarOutput_daMWh, // "太陽光発電実績"
      solarThrottling_daMWh, // "太陽光出力制御量"
      windOutput_daMWh, // "風力発電実績"
      windThrottling_daMWh, // "風力出力制御量"
      pumpedStorage_daMWh, // "揚水"
      interconnectors_daMWh, // "連系線"
      total_daMWh, // "合計"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    return {
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
      totalGenerationkWh: parseDpToKwh(total_daMWh),
    };
  });
  return data;
};

export const getTepcoAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    OLD_CSV_URL,
    RegExp(/.csv$/),
    "https://www.tepco.co.jp"
  );
  const oldUrls = oldCsvUrls.map((url) => ({ url, format: "old" }));

  const newCsvUrls = await getCSVUrlsFromPage(
    NEW_CSV_URL,
    RegExp(/.csv$/),
    "https://www.tepco.co.jp"
  );
  const newUrls = newCsvUrls.map((url) => ({ url, format: "new" }));

  const urlsToDownload = (() => {
    if (scrapeType === ScrapeType.All) return [...oldUrls, ...newUrls];
    if (scrapeType === ScrapeType.New) return [...newUrls];
    // Sort so that the latest file is last
    if (scrapeType === ScrapeType.Latest)
      return [newUrls.sort()[newUrls.length - 1]];
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
          : {
              parser: parseNewCSV,
              ...NEW_CSV_FORMAT,
            };

      const csv = await downloadCSV(url, encoding);
      const data = parser(csv);
      logger.debug({
        url: url,
        rows: data.length,
        days: data.length / blocksInDay,
      });
      return {
        tso: JapanTsoName.TEPCO,
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
