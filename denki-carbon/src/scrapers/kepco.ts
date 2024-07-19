import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../const";
import { ScrapeType, downloadCSV, getCSVUrlsFromPage } from ".";
import { logger, onlyPositive } from "../utils";

const OLD_CSV_URL = `https://www.kansai-td.co.jp/denkiyoho/area-performance/past.html`;
const LIVE_CSV_FILE_LIST_URL =
  "https://www.kansai-td.co.jp/interchange/denkiyoho/area-performance/filelist.json";

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 2,
  firstHeader: "DATE_TIME",
  intervalMinutes: 60,
};

const NEW_CSV_FORMAT_ZIP = {
  blocksInDay: 48,
  encoding: "Shift_JIS",
  headerRows: 2,
  intervalMinutes: 30,
};

const NEW_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "Shift_JIS",
  headerRows: 2,
  intervalMinutes: 30,
};

type KepcoFileList = {
  year: string;
  list: {
    name: string; // e.g. "eria_jukyu_202407_06.csv"
    label: string;
    size: number;
  }[];
};

type KepcoFileListResponse = {
  past: KepcoFileList[];
  latest: KepcoFileList[];
};

/**
 * Kepcos's live CSV page (https://www.kansai-td.co.jp/denkiyoho/area-performance/index.html) uses Vue
 * and live renders the file links, so a basic scrape doesn't work.
 * That said, we can simply ping the filelist endpoint the frontend uses to get the files.
 */
const getKepcoNewCsvUrls = async (): Promise<
  {
    url: string;
    format: "old" | "new";
  }[]
> => {
  const fileListResponse = await fetch(LIVE_CSV_FILE_LIST_URL);
  const fileList = (await fileListResponse.json()) as KepcoFileListResponse;
  const { past, latest } = fileList;
  const urls: {
    url: string;
    format: "old" | "new";
  }[] = [latest, past].flatMap((list) => {
    return list.flatMap((set) => {
      return set.list.map((file) => {
        return {
          // e.g. https://www.kansai-td.co.jp/interchange/denkiyoho/area-performance/eria_jukyu_202407_06.csv
          url: `https://www.kansai-td.co.jp/interchange/denkiyoho/area-performance/${file.name}`,
          format: "new",
        };
      });
    });
  });

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

const parseAverageMWFor30minToKwh = (raw: string): number => {
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

export const getKepcoAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    OLD_CSV_URL,
    // e.g. ./csv/area_jyukyu_jisseki_2022.csv
    // https://www.kansai-td.co.jp/denkiyoho/area-performance/csv/area_jyukyu_jisseki_2023.csv
    RegExp(/area_jyukyu_jisseki_\d\d\d\d.csv/),
    "https://www.kansai-td.co.jp/denkiyoho/area-performance"
  );
  const oldUrls = oldCsvUrls
    .map((url) => ({ url, format: "old" }))
    .sort((a, b) => a.url.localeCompare(b.url));

  const newUrls = await getKepcoNewCsvUrls();

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
          : url.includes("zip")
            ? {
                parser: parseNewCSV,
                ...NEW_CSV_FORMAT_ZIP,
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
        tso: JapanTsoName.KEPCO,
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
