import { DateTime } from "luxon";
import { ScrapeType, downloadCSV, getCSVUrlsFromPage } from ".";
import { JapanTsoName } from "../const";
import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { logger } from "../utils";

const CSV_URL = "https://setsuden.nw.tohoku-epco.co.jp/download.html";

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 1,
  intervalMinutes: 60,
};

const NEW_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "utf-8",
  headerRows: 2,
  intervalMinutes: 30,
};

/**
 * Construct URLs for real-time CSV files
 * There should be a file available for every day in the previous month and current month
 *
 * Format is e.g. https://setsuden.nw.tohoku-epco.co.jp/common/demand/realtime_jukyu/realtime_jukyu_20240603_02.csv
 *
 * @returns URLs for real-time CSV files
 */
const getRealTimeCSVUrls = (
  newCsvUrlsMonthlyConfirmedSeen: string[]
): string[] => {
  // Get datestrings from the URLs we've already seen
  const dateStrings = newCsvUrlsMonthlyConfirmedSeen.map(
    (url) =>
      // Format _yyyyMM_
      url.match(/_\d\d\d\d\d\d_/)?.[0]
  );
  // Remove underscores and get month as number
  const months = dateStrings.map((dateString) =>
    Number(dateString?.replaceAll("_", "").slice(4, 6))
  );
  const nowJST = DateTime.now().setZone("Asia/Tokyo");
  const lastMonth = nowJST.minus({ months: 1 }).month;

  // Start with the the previous month if we haven't seen any URLs for it
  const startOfStartingMonth = months.includes(lastMonth)
    ? nowJST.startOf("month")
    : nowJST.minus({ months: 1 }).startOf("month");

  const today = nowJST;
  const urls = [];
  for (
    let date = startOfStartingMonth;
    date <= today;
    date = date.plus({ days: 1 })
  ) {
    const dateString = date.toFormat("yyyyMMdd");
    urls.push(
      `https://setsuden.nw.tohoku-epco.co.jp/common/demand/realtime_jukyu/realtime_jukyu_${dateString}_02.csv`
    );
  }
  return urls;
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

const parseOldCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  // Trim 1 header row
  const dataRows = csv.slice(OLD_CSV_FORMAT.headerRows);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      dateTime, // "DATE_TIME"
      totalDemandMWh, // "エリア需要〔MWh〕"
      hydroMWh, // "水力〔MWh〕"
      allFossilMWh, // "火力〔MWh〕"
      nuclearMWh, // "原子力〔MWh〕"
      solarOutputMWh, // "太陽光実績〔MWh〕"
      solarThrottlingMWh, // "太陽光抑制量〔MWh〕"
      windOutputMWh, // "風力実績〔MWh〕"
      windThrottlingMWh, // "風力抑制量〔MWh〕"
      geothermalMWh, // "地熱〔MWh〕"
      biomassMWh, // "バイオマス〔MWh〕"
      pumpedStorageMWh, // "揚水〔MWh〕"
      interconnectorsMWh, // "連系線〔MWh〕"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      dateTime.replaceAll("  ", " "),
      // e.g. 2023/4/1 0:00
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    return {
      fromUTC,
      toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT.intervalMinutes }),
      totalDemandkWh: parseDpToKwh(totalDemandMWh),
      hydrokWh: parseDpToKwh(hydroMWh),
      allfossilkWh: parseDpToKwh(allFossilMWh),
      nuclearkWh: parseDpToKwh(nuclearMWh),
      solarOutputkWh: parseDpToKwh(solarOutputMWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottlingMWh),
      windOutputkWh: parseDpToKwh(windOutputMWh),
      windThrottlingkWh: parseDpToKwh(windThrottlingMWh),
      geothermalkWh: parseDpToKwh(geothermalMWh),
      biomasskWh: parseDpToKwh(biomassMWh),
      pumpedStoragekWh: parseDpToKwh(pumpedStorageMWh),
      interconnectorskWh: parseDpToKwh(interconnectorsMWh),
    };
  });
  return data;
};

const parseNewCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  // Trim 2 header rows
  const dataRows = csv.slice(NEW_CSV_FORMAT.headerRows);
  const data: AreaCSVDataProcessed[] = [];
  dataRows.forEach((row) => {
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

    // Skip rows with missing data, which is expected on the "today" realtime value, totalAverageMW is a good indicator
    if (!totalDemandAverageMW) return;

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
    data.push({
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
    });
  });
  return data;
};

export const getTohokuAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. common/demand/juyo_2023_tohoku_1Q.csv
    RegExp(/juyo_\d\d\d\d_tohoku_\dQ.csv$/),
    "https://setsuden.nw.tohoku-epco.co.jp/"
  );
  const oldUrls = oldCsvUrls.map((url) => ({ url, format: "old" }));

  const newCsvUrlsMonthlyConfirmed = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. common/demand/eria_jukyu_202404_02.csv
    RegExp(/eria_jukyu_\d\d\d\d\d\d_\d\d.csv$/),
    "https://setsuden.nw.tohoku-epco.co.jp/"
  );
  const newUrls = newCsvUrlsMonthlyConfirmed.map((url) => ({
    url,
    format: "new",
  }));

  const newCsvUrlsDaily = getRealTimeCSVUrls(newCsvUrlsMonthlyConfirmed);
  const newUrlsDaily = newCsvUrlsDaily.map((url) => ({ url, format: "new" }));

  const urlsToDownload = (() => {
    if (scrapeType === ScrapeType.All)
      return [...oldUrls, ...newUrls, ...newUrlsDaily];
    if (scrapeType === ScrapeType.New) return [...newUrls, ...newUrlsDaily];
    if (scrapeType === ScrapeType.Latest) return [...newUrlsDaily];
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
        tso: JapanTsoName.TOHOKU,
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
