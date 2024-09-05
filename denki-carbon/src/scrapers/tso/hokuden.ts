import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../../const";
import { ScrapeType } from "..";
import { logger, onlyPositive } from "../../utils";
import {
  downloadCSV,
  getCSVUrlsFromPage,
  NEW_CSV_FORMAT,
  parseNewCSV,
} from "./utils";

const OLD_CSV_URL = `https://www.rikuden.co.jp/nw_jyukyudata/area_jisseki.html`;
const BASE_LIVE_CSV_URL = "https://www.rikuden.co.jp/nw/denki-yoho/csv";

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 6, // Header row varies, so we're just finding it manually
  intervalMinutes: 60,
};

const START_OF_HOKUDEN_LIVE_DATA = DateTime.fromISO(
  "2024-03-26T00:00:00.000+09:00",
  { zone: "Asia/Tokyo" }
);

/**
 * Rikuden's live CSV page (https://www.rikuden.co.jp/nw/denki-yoho/results_jyukyu.html) doesn't
 * show what CSVs are available, and instead populates a form with disabled/enabled options for the months and years.
 * So, this function will basically create all possible URLs for the months up to the current month
 */
const getHokudenNewCSVUrls = async (): Promise<
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
    let urlMonth = START_OF_HOKUDEN_LIVE_DATA;
    urlMonth.month <= startOfCurrentMonth.month;
    urlMonth = urlMonth.plus({ months: 1 })
  ) {
    // e.g. https://www.rikuden.co.jp/nw/denki-yoho/csv/eria_jukyu_202402_05.csv
    const url = `${BASE_LIVE_CSV_URL}/eria_jukyu_${urlMonth.toFormat("yyyyMM")}_05.csv`;
    urls.push({ url, format: "new" });
  }

  return urls;
};

const parseDpToKwh = (raw: string): number => {
  // Return 0 for placeholder values
  const placeholders = ["－", ""];
  if (placeholders.includes(raw)) return 0;
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
  const headerRow = csv.findIndex((row) => row[0].includes("DATE"));
  const dataRows = csv.slice(headerRow + 1);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "DATE"
      time, // "TIME"
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
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    const parsed = {
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
    };
    return {
      ...parsed,
      // No total in the data, create it from generating and import sources
      totalGenerationkWh: [
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

  // Filter out anything before the start of the live data, if the first item in the file is from 2024
  // This is because there is an overlap between the old and new formats, and we should only keep one
  const filteredData =
    data[0].fromUTC.year === 2024
      ? data.filter((dp) => dp.fromUTC < START_OF_HOKUDEN_LIVE_DATA)
      : data;

  return filteredData;
};

export const getHokudenAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    OLD_CSV_URL,
    // e.g. /nw_jyukyudata/attach/area_jisseki_rikuden202403.csv
    // or /nw_jyukyudata/attach/
    RegExp(/area_jisseki_rikuden.+\.csv/),
    "https://www.rikuden.co.jp"
  );
  const oldUrls = oldCsvUrls
    .map((url) => ({ url, format: "old" }))
    .sort((a, b) => a.url.localeCompare(b.url));

  const newUrls = await getHokudenNewCSVUrls();

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

      logger.debug({ downloading: url });

      const csv = await downloadCSV(url, encoding);
      const data = parser(csv);
      logger.debug({
        url: url,
        rows: data.length,
        days: data.length / blocksInDay,
      });
      return {
        tso: JapanTsoName.HOKUDEN,
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
