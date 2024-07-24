import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../const";
import { ScrapeType } from ".";
import { logger, onlyPositive } from "../utils";
import {
  downloadCSV,
  getCSVUrlsFromPage,
  NEW_CSV_FORMAT,
  parseNewCSV,
} from "./utils";

const CSV_URL = `https://www.kyuden.co.jp/td_area_jukyu/jukyu.html`;
const LIVE_CSV_FILE_LIST_URL =
  "https://www.kyuden.co.jp/td_area_jukyu/csv/eria_jukyu_nendo_list.csv";

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 2,
  firstHeader: "DATE_TIME",
  intervalMinutes: 60,
};

const START_OF_KYUDEN_LIVE_DATA = DateTime.fromISO(
  "2024-03-01T00:00:00.000+09:00",
  { zone: "Asia/Tokyo" }
);

/**
 * Kyuden's live CSV page (https://www.kyuden.co.jp/td_area_jukyu/jukyu.html) live renders
 * the available new files via an XHR request, so a basic scrape doesn't work.
 * That said, we can simply ping the filelist endpoint the frontend uses to get the files.
 *
 * The file is actually a CSV, but we don't really need to parse it and can simply scrape the URLs from the text
 */
const getKyudenNewCsvUrls = async (): Promise<
  {
    url: string;
    format: "old" | "new";
  }[]
> => {
  const now = DateTime.now().setZone("Asia/Tokyo");
  // the slice matches the way the Kyuden frontend generates the timestamp
  const timestampString = now.toMillis().toString().slice(0, -5);

  const fileListResponse = await fetch(
    `${LIVE_CSV_FILE_LIST_URL}?${timestampString}`
  );
  const fileList = await fileListResponse.text();
  const regex = /eria_jukyu_\d{6}_09\.csv/g;
  const rawUrls = fileList.match(regex);
  if (!rawUrls) {
    throw new Error("Failed to find any URLs in the file list");
  }
  const urls: {
    url: string;
    format: "old" | "new";
  }[] = rawUrls.map((rawUrl) => ({
    // raw format: e.g. eria_jukyu_202403_09.csv
    // e.g. https://www.kyuden.co.jp/td_area_jukyu/csv/eria_jukyu_202404_09.csv?17217448
    url: `https://www.kyuden.co.jp/td_area_jukyu/csv/${rawUrl}?${timestampString}`,
    format: "new",
  }));

  return urls.sort((a, b) => a.url.localeCompare(b.url));
};

const parseDpToKwh = (raw: string): number => {
  // Return 0 for placeholder values
  const placeholders = ["－", ""];
  if (placeholders.includes(raw)) return 0;
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in MWh, so multiply by 1000 to get kWh
  return parseFloat(cleaned) * 1000;
};

const parseOldCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  const headerRow = csv.findIndex((row) =>
    row[0].includes(OLD_CSV_FORMAT.firstHeader)
  );
  const dataRows = csv.slice(headerRow + 1);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      dateTime, // "DATE_TIME"
      totalDemand_MWh, // "エリア需要〔MWh〕"
      nuclear_MWh, // "原子力〔MWh〕"
      allfossil_MWh, // "火力〔MWh〕"
      hydro_MWh, // "水力〔MWh〕"
      geothermal_MWh, // "地熱〔MWh〕"
      biomass_MWh, // "バイオマス〔MWh〕"
      solarOutput_MWh, // "太陽光 <newCell> 実績〔MWh〕"
      solarThrottling_MWh, // "太陽光 <newCell> 抑制量〔MWh〕"
      windOutput_MWh, // "風力 <newCell> 実績〔MWh〕"
      windThrottling_MWh, // "風力 <newCell> 抑制量〔MWh〕"
      pumpedStorage_MWh, // "揚水〔MWh〕"
      interconnectors_MWh, // "連系線〔MWh〕"
    ] = row;
    // e.g. 2016/4/1 0:00
    const fromUTC = DateTime.fromFormat(dateTime.trim(), "yyyy/M/d H:mm", {
      zone: "Asia/Tokyo",
    }).toUTC();
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
    data[0].fromUTC.year >= 2023
      ? data.filter(
          (dp) => dp.fromUTC.valueOf() < START_OF_KYUDEN_LIVE_DATA.valueOf()
        )
      : data;

  return filteredData;
};

export const getKyudenAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. csv_area_jyukyu_jisseki/area_jyukyu_jisseki_H28_1Q.csv
    // (format changes from Heiwa format "H28" to Roman format "2020" in the middle)
    // https://www.kyuden.co.jp/td_area_jukyu/csv_area_jyukyu_jisseki/area_jyukyu_jisseki_2023_3Q.csv
    RegExp(/area_jyukyu_jisseki\S+_\dQ\.csv/),
    "https://www.kyuden.co.jp/td_area_jukyu/"
  );
  const oldUrls = oldCsvUrls
    .map((url) => ({ url, format: "old" }))
    .sort((a, b) =>
      a.url
        // Stupid hack, ensures all Heiwa formatted files come before Roman formatted files
        .replaceAll("_H", "_00")
        .localeCompare(b.url.replaceAll("_H", "_00"))
    );

  const newUrls = await getKyudenNewCsvUrls();

  const urlsToDownload = (() => {
    if (scrapeType === ScrapeType.All) return [...oldUrls, ...newUrls];
    if (scrapeType === ScrapeType.New) return [...newUrls];
    if (scrapeType === ScrapeType.Latest) return [newUrls[newUrls.length - 1]];
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
      const data = parser(csv, {
        dateFormat: "yyyyMMdd",
        isTimeAtEndOfBlock: true,
        flipInterconnectors: true,
      });
      logger.debug({
        url: url,
        rows: data.length,
        days: data.length / blocksInDay,
      });
      return {
        tso: JapanTsoName.KYUDEN,
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
