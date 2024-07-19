import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../const";
import { ScrapeType } from ".";
import { logger } from "../utils";
import { downloadCSV, getCSVUrlsFromPage } from "./utils";

const CSV_URL = `https://www.hepco.co.jp/network/con_service/public_document/supply_demand_results/index.html`;
const LIVE_URL = `https://denkiyoho.hepco.co.jp/supply_demand_results.html`;

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 4,
  intervalMinutes: 60,
};

const OLD_XLS_FORMAT = {
  blocksInDay: 24,
  headerRows: 3, // During processing we trim a row, so its one less than the usual header rows
  intervalMinutes: 60,
};

const NEW_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "Shift_JIS",
  headerRows: 2,
  intervalMinutes: 30,
};

const LATEST_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "Shift_JIS",
  headerRows: 4,
  intervalMinutes: 30,
};

/**
 * This function gets the URLs for the CSV files from the HEPCO website for the current day and any previous days we can find
 *
 * HEPCO only provides the URLs for the current day on their forecast website
 * And the historical data (shown below) only covers up to 5 days ago
 * I've figured out that the URL for yesterday's data is the same as today's URL, but with the date changed,
 * but any further back than that and it 404s
 *
 * Annoyingly this means there is a 4 day gap in the data you can get with an initial seed,
 * naturally this should resolve itself over a few days, but its something that would be nice to get fixed
 *
 * @returns {Promise<string[]>} - An array of URLs for the CSV files
 */
const getLiveCSVUrls = async (): Promise<string[]> => {
  const todayUrl = (
    await getCSVUrlsFromPage(
      LIVE_URL,
      RegExp(/(.csv)$/),
      "https://denkiyoho.hepco.co.jp/"
    )
  )[0];
  const todayJSTString = DateTime.now()
    .setZone("Asia/Tokyo")
    .toFormat("yyyyMMdd");
  const yesterdayJSTString = DateTime.now()
    .setZone("Asia/Tokyo")
    .minus({ days: 1 })
    .toFormat("yyyyMMdd");
  // Change date to yesterday
  const yesterdayUrl = todayUrl.replace(todayJSTString, yesterdayJSTString);
  return [yesterdayUrl, todayUrl];
};

const parseDpToKwh = (raw: string): number => {
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in MWh, so multiply by 1000 to get kWh
  return parseFloat(cleaned) * 1000;
};

const parseAverageMWFor30minToKwh = (raw: string): number => {
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in MW, so multiply by 1000 to get kW
  const averageKw = parseFloat(cleaned) * 1000;
  // Multiply by hours to get kWh
  return averageKw * (30 / 60);
};

const parseOldXLS = (xlsCsv: string[][]): AreaCSVDataProcessed[] => {
  const dataRows = xlsCsv.slice(OLD_XLS_FORMAT.headerRows);
  let lastDate: string | undefined = undefined;
  const data: AreaCSVDataProcessed[] = dataRows.map((row, index) => {
    // 月日	時刻	エリア需要	原子力	火力	水力	地熱	バイオマス	太陽光実績	太陽光抑制量	風力実績	風力抑制量	揚水	連系線	供給力合計
    const [
      date, // "月日" - only filled in for the first row of the day - e.g "2024/1/1"
      time, // "時刻" - Japanese format - e.g. "0時", "1時"
      totalDemand_MWh, // "エリア需要"
      nuclear_MWh, // "原子力"
      allfossil_MWh, // "火力"
      hydro_MWh, // "水力"
      geothermal_MWh, // "地熱"
      biomass_MWh, // "バイオマス"
      solarOutput_MWh, // "太陽光実績"
      solarThrottling_MWh, // "太陽光抑制量"
      windOutput_MWh, // "風力実績"
      windThrottling_MWh, // "風力抑制量"
      pumpedStorage_MWh, // "揚水"
      interconnectors_MWh, // "連系線"
      totalSupply_MWh, // "供給力合計"
    ] = row;
    if (date) lastDate = date;
    if (!lastDate) throw new Error(`Cannot resolve date for row ${index}`);
    const fromUTC = DateTime.fromFormat(
      `${lastDate.trim()} ${time.trim()}`,
      "yyyy/MM/dd H時",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    return {
      fromUTC,
      toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT.intervalMinutes }),
      totalDemandkWh: parseDpToKwh(totalDemand_MWh),
      nuclearkWh: parseDpToKwh(nuclear_MWh),
      allfossilkWh: parseDpToKwh(allfossil_MWh),
      hydrokWh: parseDpToKwh(hydro_MWh),
      geothermalkWh: parseDpToKwh(geothermal_MWh),
      biomasskWh: parseDpToKwh(biomass_MWh),
      solarOutputkWh: parseDpToKwh(solarOutput_MWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottling_MWh),
      windOutputkWh: parseDpToKwh(windOutput_MWh),
      windThrottlingkWh: parseDpToKwh(windThrottling_MWh),
      pumpedStoragekWh: parseDpToKwh(pumpedStorage_MWh),
      interconnectorskWh: parseDpToKwh(interconnectors_MWh),
      totalGenerationkWh: parseDpToKwh(totalSupply_MWh),
    };
  });
  return data;
};

const parseOldCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  const dataRows = csv.slice(OLD_CSV_FORMAT.headerRows);
  let lastDate: string | undefined = undefined;
  const data: AreaCSVDataProcessed[] = dataRows.map((row, index) => {
    // 月日	時刻	エリア需要	原子力	火力	水力	地熱	バイオマス	太陽光実績	太陽光抑制量	風力実績	風力抑制量	揚水	連系線	供給力合計
    const [
      date, // "月日" - only filled in for the first row of the day - e.g "2024/1/1"
      time, // "時刻" - Japanese format - e.g. "0時", "1時"
      totalDemand_MWh, // "エリア需要"
      nuclear_MWh, // "原子力"
      allfossil_MWh, // "火力"
      hydro_MWh, // "水力"
      geothermal_MWh, // "地熱"
      biomass_MWh, // "バイオマス"
      solarOutput_MWh, // "太陽光実績"
      solarThrottling_MWh, // "太陽光抑制量"
      windOutput_MWh, // "風力実績"
      windThrottling_MWh, // "風力抑制量"
      pumpedStorage_MWh, // "揚水"
      interconnectors_MWh, // "連系線"
      totalSupply_MWh, // "供給力合計"
    ] = row;
    if (date) lastDate = date;
    if (!lastDate) throw new Error(`Cannot resolve date for row ${index}`);
    const fromUTC = DateTime.fromFormat(
      `${lastDate.trim()} ${time.trim()}`,
      "yyyy/M/d H時",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    return {
      fromUTC,
      toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT.intervalMinutes }),
      totalDemandkWh: parseDpToKwh(totalDemand_MWh),
      nuclearkWh: parseDpToKwh(nuclear_MWh),
      allfossilkWh: parseDpToKwh(allfossil_MWh),
      hydrokWh: parseDpToKwh(hydro_MWh),
      geothermalkWh: parseDpToKwh(geothermal_MWh),
      biomasskWh: parseDpToKwh(biomass_MWh),
      solarOutputkWh: parseDpToKwh(solarOutput_MWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottling_MWh),
      windOutputkWh: parseDpToKwh(windOutput_MWh),
      windThrottlingkWh: parseDpToKwh(windThrottling_MWh),
      pumpedStoragekWh: parseDpToKwh(pumpedStorage_MWh),
      interconnectorskWh: parseDpToKwh(interconnectors_MWh),
      totalGenerationkWh: parseDpToKwh(totalSupply_MWh),
    };
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
      totalGenerationkWh: parseAverageMWFor30minToKwh(totalAverageMW),
    };
  });
  // Remove NaN rows
  const dataFiltered = data.filter((row) => !isNaN(row.totalDemandkWh));
  logger.debug({ rowsSkipped: data.length - dataFiltered.length });
  return dataFiltered;
};

const parseLatestCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  const dataRows = csv.slice(NEW_CSV_FORMAT.headerRows);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "年月日"
      time, // "時刻"
      totalDemandAverageMW, // "エリア需要"
      nuclearAverageMW, // "原子力"
      lngAverageMW, // "火力（LNG）"
      coalAverageMW, // "火力（石炭）"
      oilAverageMW, // "火力（石油）"
      otherFossilAverageMW, // "火力（その他）"
      hydroAverageMW, // "水力"
      geothermalAverageMW, // "地熱"
      biomassAverageMW, // "バイオマス"
      solarOutputAverageMW, // "太陽光実績"
      solarThrottlingAverageMW, // "太陽光抑制量"
      windOutputAverageMW, // "風力実績"
      windThrottlingAverageMW, // "風力抑制量"
      pumpedStorageAverageMW, // "揚水"
      batteryStorageAverageMW, // "蓄電池"
      interconnectorsAverageMW, // "連系線"
      otherAverageMW, // "その他"
      totalAverageMW, // "供給力合計"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim().split("～")[0]}`,
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
      totalGenerationkWh: parseAverageMWFor30minToKwh(totalAverageMW),
    };
  });
  // Remove NaN rows
  const dataFiltered = data.filter((row) => !isNaN(row.totalDemandkWh));
  logger.debug({ rowsSkipped: data.length - dataFiltered.length });
  return dataFiltered;
};

export const getHepcoAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const historicUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // RegExp(/(.csv)|(.xls)$/),
    RegExp(/(.csv)$/),
    "https://www.hepco.co.jp/network/con_service/public_document/supply_demand_results/"
  );

  // e.g. https://www.hepco.co.jp/network/con_service/public_document/supply_demand_results/csv/sup_dem_results_2023_4q.csv
  // Note, one of the old files is an XLS file
  const oldUrls = historicUrls
    .filter((url) => url.includes("sup_dem_results"))
    .map((url) => ({ url, format: "old" }));
  // e.g. https://www.hepco.co.jp/network/con_service/public_document/supply_demand_results/csv/eria_jukyu_202404_01.csv
  const newUrls = historicUrls
    .filter((url) => url.includes("eria_jukyu"))
    .map((url) => ({ url, format: "new" }));

  const liveUrls = (await getLiveCSVUrls()).map((url) => ({
    url,
    format: "new",
  }));

  const urlsToDownload = (() => {
    if (scrapeType === ScrapeType.All)
      return [...oldUrls, ...newUrls, ...liveUrls];
    if (scrapeType === ScrapeType.New) return [...newUrls, ...liveUrls];
    if (scrapeType === ScrapeType.Latest) return [...liveUrls];
    throw new Error(`Invalid scrape type: ${scrapeType}`);
  })();

  logger.debug({ urlsToDownload: urlsToDownload });

  const dataByCSV = await Promise.all(
    urlsToDownload.map(async (file) => {
      const { url, format } = file;
      const { parser, blocksInDay, encoding, headerRows } =
        format === "old"
          ? url.includes(".xls")
            ? {
                parser: parseOldXLS,
                ...OLD_CSV_FORMAT,
              }
            : {
                parser: parseOldCSV,
                ...OLD_CSV_FORMAT,
              }
          : url.includes("sup_dem_results")
            ? {
                parser: parseNewCSV,
                ...NEW_CSV_FORMAT,
              }
            : {
                parser: parseLatestCSV,
                ...LATEST_CSV_FORMAT,
              };

      logger.debug({ downloading: url });

      try {
        const csv = await downloadCSV(url, encoding);
        const data = parser(csv);
        logger.debug({
          url: url,
          rows: data.length,
          days: data.length / blocksInDay,
        });
        return {
          tso: JapanTsoName.HEPCO,
          url,
          fromDatetime: data[0].fromUTC,
          toDatetime: data[data.length - 1].toUTC,
          data,
          raw: csv.slice(headerRows),
        };
      } catch (e) {
        const error = e as Error;
        logger.error({ error: error.message, url });
        return null;
      }
    })
  );

  // Filter out any failed downloads
  const dataByCSVFiltered = dataByCSV.filter(
    (data) => data !== null
  ) as AreaDataFileProcessed[];

  return dataByCSVFiltered;
};
