import { DateTime } from "luxon";
import { ScrapeType, downloadCSV, getCSVUrlsFromPage } from ".";
import { JapanTsoName } from "../const";
import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { logger, onlyPositive } from "../utils";

const OLD_CSV_URL = "https://www.energia.co.jp/nw/service/retailer/data/area/";
const BASE_LIVE_CSV_URL = "https://www.energia.co.jp/nw/jukyuu";

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 3,
  intervalMinutes: 60,
};

const NEW_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "utf-8",
  headerRows: 2,
  intervalMinutes: 30,
};

const START_OF_CHUBU_LIVE_DATA = DateTime.fromISO(
  "2024-02-01T00:00:00.000+09:00",
  { zone: "Asia/Tokyo" }
);

/**
 * Chugokus's live CSV page (https://www.energia.co.jp/nw/jukyuu/eria_jukyu.html) doesn't really
 * show what CSVs are available, instead, every time you change the date in the box, it literally
 * sends a GET request for the file.
 * So, this function will basically jsut do the same thing, but without bothering to check the page
 */
const getChubuCSVUrls = async (): Promise<
  {
    url: string;
    format: "old" | "new";
  }[]
> => {
  const nowJST = DateTime.now().setZone("Asia/Tokyo");
  const startOfCurrentMonth = nowJST.startOf("month");
  const urls: { url: string; format: "old" | "new" }[] = [];
  // From the start of data to the start of the current month, return a url for each month
  for (
    let urlMonth = START_OF_CHUBU_LIVE_DATA;
    urlMonth.month <= startOfCurrentMonth.month;
    urlMonth = urlMonth.plus({ months: 1 })
  ) {
    // e.g. https://www.energia.co.jp/nw/jukyuu/sys/eria_jukyu_202404_07.csv?ver=1719750310860
    const url = `${BASE_LIVE_CSV_URL}/sys/eria_jukyu_${urlMonth.toFormat(
      "yyyyMM"
    )}_07.csv?ver=${nowJST.toMillis()}`;
    urls.push({ url, format: "new" });
  }

  return urls;
};

const parseDpToKwh = (raw: string): number => {
  // Return 0 for placeholder values
  if (raw === "－") return 0;
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
  const dataRows = csv.slice(OLD_CSV_FORMAT.headerRows);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "DATE"
      time, // "TIME"
      totalDemandMWh, // "需要"
      nuclearMWh, // "原子力"
      allFossilMWh, // "火力"
      hydroMWh, // "水力"
      geothermalMWh, // "地熱"
      biomassMWh, // "バイオマス"
      solarOutputMWh, // "太陽光(実績)"
      solarThrottlingMWh, // "太陽光(抑制量)"
      windOutputMWh, // "風力(実績)"
      windThrottlingMWh, // "風力(抑制量)"
      pumpedStorageMWh, // "揚水"
      interconnectorsMWh, // "連系線潮流"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    if (!fromUTC.isValid) {
      throw new Error(`Invalid date: ${date} ${time}`);
    }
    const parsed = {
      fromUTC,
      toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT.intervalMinutes }),
      totalDemandkWh: parseDpToKwh(totalDemandMWh),
      nuclearkWh: parseDpToKwh(nuclearMWh),
      allfossilkWh: parseDpToKwh(allFossilMWh),
      hydrokWh: parseDpToKwh(hydroMWh),
      geothermalkWh: parseDpToKwh(geothermalMWh),
      biomasskWh: parseDpToKwh(biomassMWh),
      solarOutputkWh: parseDpToKwh(solarOutputMWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottlingMWh),
      windOutputkWh: parseDpToKwh(windOutputMWh),
      windThrottlingkWh: parseDpToKwh(windThrottlingMWh),
      pumpedStoragekWh: parseDpToKwh(pumpedStorageMWh),
      interconnectorskWh: parseDpToKwh(interconnectorsMWh),
    };

    return {
      ...parsed,
      // No total in the data, create it from generating and import sources
      totalkWh: [
        parsed.nuclearkWh,
        parsed.allfossilkWh,
        parsed.hydrokWh,
        parsed.geothermalkWh,
        parsed.biomasskWh,
        parsed.solarOutputkWh,
        parsed.windOutputkWh,
        parsed.pumpedStoragekWh,
        parsed.interconnectorskWh,
      ].reduce((acc, val) => acc + onlyPositive(val), 0),
    };
  });

  // Filter out anything before the start of the live data, if the first value in the file is from 2023
  // This is because there is an overlap between the old and new formats, and we should only keep one
  const filteredData =
    data[0].fromUTC.year === 2023
      ? data.filter((dp) => dp.fromUTC < START_OF_CHUBU_LIVE_DATA)
      : data;

  return filteredData;
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

export const getChugokuAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    OLD_CSV_URL,
    // e.g. csv/kako-2023.csv
    RegExp(/csv\/kako-\d\d\d\d.csv$/),
    "https://www.energia.co.jp/nw/service/retailer/data/area/"
  );
  const oldUrls = oldCsvUrls.map((url) => ({ url, format: "old" }));

  const newUrls = await getChubuCSVUrls();

  const urlsToDownload = (() => {
    if (scrapeType === ScrapeType.All) return [...oldUrls, ...newUrls];
    if (scrapeType === ScrapeType.New) return [...newUrls];
    // Just most recent data, sorted by url
    if (scrapeType === ScrapeType.Latest)
      return [...newUrls.sort((a, b) => (a.url > b.url ? 1 : -1)).slice(-1)];
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
        tso: JapanTsoName.CHUGOKU,
        url,
        fromDatetime: data[0].fromUTC,
        toDatetime: data[data.length - 1].toUTC,
        data,
        raw: csv.slice(headerRows),
      };
    })
  );

  logger.debug("All files retrieved", {
    data: dataByCSV.map((d) => ({
      fromDatetime: d.fromDatetime,
      toDatetime: d.toDatetime,
      rows: d.data.length,
      url: d.url,
    })),
  });

  return dataByCSV;
};
