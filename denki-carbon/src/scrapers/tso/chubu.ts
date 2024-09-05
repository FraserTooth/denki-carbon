import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../../types";
import { DateTime } from "luxon";
import { JapanTsoName } from "../../const";
import { ScrapeType } from "../index";
import { downloadCSV, NEW_CSV_FORMAT, parseNewCSV } from "./utils";
import { axiosInstance, logger, onlyPositive } from "../../utils";

const CSV_URL = `https://powergrid.chuden.co.jp/denkiyoho/resource/php/getFilesInfo.php`;

const OLD_CSV_FORMAT = {
  blocksInDay: 24,
  encoding: "Shift_JIS",
  headerRows: 5,
  intervalMinutes: 60,
};

/**
 * Chubu's CSV page is dynamically rendered, but we can just call the PHP script directly
 */
const getChubuCSVUrls = async (): Promise<
  {
    url: string;
    format: "old" | "new";
  }[]
> => {
  const response = await axiosInstance.get(CSV_URL);

  const data = (await response.data) as { category: string; path: string }[];
  const areaData = data.filter(
    (d) =>
      d.category === "年別エリア需給実績" ||
      d.category === "直近のエリア需要実績"
  );

  const urls: { url: string; format: "old" | "new" }[] = areaData.map((d) => {
    const url = `https://powergrid.chuden.co.jp${d.path}`;
    const format = d.path.includes("areabalance") ? "old" : "new";
    return { url, format };
  });
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
  const dataRows = csv.slice(OLD_CSV_FORMAT.headerRows);
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
      solarOutput_MWh, // "太陽光（実績）"
      solarThrottling_MWh, // "太陽光（出力制御量）"
      windOutput_MWh, // "風力（実績）"
      windThrottling_MWh, // "風力（出力制御量）"
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
  return data;
};

export const getChubuAreaData = async (
  scrapeType: ScrapeType
): Promise<AreaDataFileProcessed[]> => {
  const allUrls = await getChubuCSVUrls();

  const oldUrls = allUrls.filter((u) => u.format === "old");
  const newUrls = allUrls.filter((u) => u.format === "new");

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
        tso: JapanTsoName.CHUBU,
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
