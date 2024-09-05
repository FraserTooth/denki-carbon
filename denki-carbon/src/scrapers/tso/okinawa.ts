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

const CSV_URL = `https://www.okiden.co.jp/business-support/service/supply-and-demand/index.html`;

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 9,
  firstHeader: "DATE",
  intervalMinutes: 60,
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

  //   DATE	TIME	"エリアの需要実績"		エリアの供給実績
  // 				火力	水力	バイオマス	太陽光		風力		合計
  // 								"太陽光出力制御量"		"風力出力制御量"

  // Header is spit over 3 rows, plus 1 empty row
  const dataRows = csv.slice(headerRow + 4);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "DATE"
      time, // "TIME"
      totalDemand_MWh, // "エリアの需要実績"
      _emptyColumn, // <empty column>
      allfossil_MWh, // "火力"
      hydro_MWh, // "水力"
      biomass_MWh, // "バイオマス"
      solarOutput_MWh, // "太陽光"
      solarThrottling_MWh, // "太陽光出力制御量"
      windOutput_MWh, // "風力"
      windThrottling_MWh, // "風力出力制御量"
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
      allfossilkWh: parseDpToKwh(allfossil_MWh),
      hydrokWh: parseDpToKwh(hydro_MWh),
      biomasskWh: parseDpToKwh(biomass_MWh),
      solarOutputkWh: parseDpToKwh(solarOutput_MWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottling_MWh),
      windOutputkWh: parseDpToKwh(windOutput_MWh),
      windThrottlingkWh: parseDpToKwh(windThrottling_MWh),
      // The following items are not in the data source, so set to 0
      nuclearkWh: 0,
      geothermalkWh: 0,
      pumpedStoragekWh: 0,
      interconnectorskWh: 0,
    };
    return {
      ...parsed,
      // No total in the data, create it from generating and import sources
      totalGenerationkWh: [
        parsed.allfossilkWh,
        parsed.hydrokWh,
        parsed.biomasskWh,
        parsed.solarOutputkWh,
        parsed.windOutputkWh,
      ].reduce((acc, val) => acc + onlyPositive(val), 0),
    };
  });

  return data;
};

export const getOkinawaAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const oldCsvUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. ./jukyu/csv/2023.csv
    // https://www.okiden.co.jp/business-support/service/supply-and-demand/jukyu/csv/2023.csv
    RegExp(/jukyu\/csv\/\d{4}/),
    "https://www.okiden.co.jp/business-support/service/supply-and-demand"
  );
  const oldUrls = oldCsvUrls.map((url) => ({ url, format: "old" }));

  const newCsvUrls = await getCSVUrlsFromPage(
    CSV_URL,
    // e.g. ./csv/eria_jukyu_202404_10.csv
    // https://www.okiden.co.jp/business-support/service/supply-and-demand/csv/eria_jukyu_202402_10.csv
    RegExp(/eria_jukyu_\d{6}_10\.csv/),
    "https://www.okiden.co.jp/business-support/service/supply-and-demand"
  );
  const newUrls = newCsvUrls.map((url) => ({ url, format: "new" }));

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
      const data = parser(csv);
      logger.debug({
        url: url,
        rows: data.length,
        days: data.length / blocksInDay,
      });
      return {
        tso: JapanTsoName.OEPC,
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
