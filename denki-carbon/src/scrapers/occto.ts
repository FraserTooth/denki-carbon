import axios, { AxiosInstance } from "axios";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { DateTime, Interval } from "luxon";
import { INTERCONNECTOR_DETAILS, JapanInterconnectors } from "../const";
import { logger } from "../utils";
import {
  InterconnectorDataProcessed,
  RawOcctoInterconnectorData,
} from "../types";
import { ScrapeType } from ".";

const getOcctoCookies = async (axiosInstance: AxiosInstance) => {
  const response = await axiosInstance.get(
    "http://occtonet.occto.or.jp/public/dfw/RP11/OCCTO/SD/LOGIN_login"
  );
  return response.headers["set-cookie"] || [];
};

/**
 *
 * @param axiosInstance Axios instance with cookies set
 * @param fromDatetime where FROM is inclusive
 * @param toDatetime where TO is inclusive
 * @returns Form data to download the OCCTO data
 */
const getDownloadForm = async (
  axiosInstance: AxiosInstance,
  fromDatetime: DateTime,
  toDatetime: DateTime
) => {
  // Get Date strings
  const fromDate = fromDatetime.toFormat("yyyy/MM/dd");
  // Subtract 1 day from the end date, since the toDate is inclusive
  const toDate = toDatetime.minus({ days: 1 }).toFormat("yyyy/MM/dd");

  // Prep the initial request
  const formData = {
    "fwExtention.actionType": "reference",
    "fwExtention.actionSubType": "ok",
    "fwExtention.pagingTargetTable": "",
    // Standard path for all downloads
    "fwExtention.pathInfo": "CF01S010C",
    "fwExtention.prgbrh": "0",
    // Specific path for this form
    "fwExtention.formId": "CF01S010P",
    "fwExtention.jsonString": "",
    ajaxToken: "",
    requestToken: "",
    requestTokenBk: "",
    transitionContextKey: "DEFAULT",
    tabSntk: "0",
    downloadKey: "",
    dvlSlashLblUpdaf: "1",
    rklDataKnd: "11",
    rklNngpFrom: fromDate,
    rklNngpTo: toDate,
    // Each number corresponds to a different interconnector
    rkl1: "01",
    rkl2: "02",
    rkl3: "03",
    rkl4: "04",
    rkl5: "05",
    rkl6: "06",
    rkl7: "07",
    rkl8: "08",
    rkl9: "09",
    rkl10: "10",
    // Also get the Hokuriku Fence, not sure whether this is needed
    // rkl11: "11",
  };
  const downloadLinkResponse = await axiosInstance.postForm(
    "https://occtonet3.occto.or.jp/public/dfw/RP11/OCCTO/SD/CF01S010C",
    formData
  );
  const dataRoot = downloadLinkResponse?.data?.root;
  if (!dataRoot || dataRoot.errFields || dataRoot.errMessage) {
    logger.error(downloadLinkResponse.data);
    throw Error("Error when getting download link. Error in response.");
  }
  const downloadLinkHeader = dataRoot?.bizRoot?.header;
  const downloadKey = downloadLinkHeader?.downloadKey?.value;
  const requestToken = downloadLinkHeader?.requestToken?.value;
  if (!downloadKey || !requestToken) {
    throw Error(
      "Error when getting download link. Missing download key or request token."
    );
  }

  // Update form data with download key and request token
  formData.downloadKey = downloadKey;
  formData.requestToken = requestToken;
  formData["fwExtention.actionSubType"] = "download";

  return formData;
};

const downloadFile = async (axiosInstance: AxiosInstance, formData: any) => {
  const downloadResponse = await axiosInstance.postForm(
    "https://occtonet3.occto.or.jp/public/dfw/RP11/OCCTO/SD/CF01S010C",
    formData,
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(downloadResponse.data);
  const data = iconv.decode(buffer, "SHIFT_JIS");
  const rawCsv: string[][] = parse(data, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  });
  return rawCsv;
};

const parseCsv = (rawCsv: string[][]): RawOcctoInterconnectorData[] => {
  // Trim the header
  const headerIndex = rawCsv.findIndex((row) => row[0] === "連系線");

  const parsedData = rawCsv.slice(headerIndex + 1).map((row) => {
    // Parse out the bits we want
    // "連系線", "対象日付", "対象時刻", "運用容量(順方向)", "運用容量(逆方向)", "広域調整枠(順方向)", "広域調整枠(逆方向)", "マージン(順方向)", "マージン(逆方向)", "空容量(順方向)", "空容量(逆方向)", "計画潮流(順方向)", "計画潮流(逆方向)", "潮流実績", "運用容量拡大分(順方向)", "運用容量拡大分(逆方向)"

    const interconnectorNameRaw = row[0];
    const dateRaw = row[1];
    const timeRaw = row[2];
    const powerMW = parseFloat(row[13]);

    // Match the interconnector name to the enum
    const interconnector = Object.values(JapanInterconnectors).find((ic) => {
      return (
        INTERCONNECTOR_DETAILS[ic as JapanInterconnectors].occtoName ===
        interconnectorNameRaw
      );
    });
    if (!interconnector) {
      logger.error(
        `Could not find interconnector for ${interconnectorNameRaw}`
      );
      throw Error("Could not find interconnector");
    }

    const timestamp = DateTime.fromFormat(
      `${dateRaw} ${timeRaw}`,
      "yyyy/MM/dd HH:mm",
      { zone: "Asia/Tokyo" }
    );
    if (!timestamp.isValid) {
      logger.error(`Invalid timestamp ${dateRaw} ${timeRaw}`);
      throw Error("Invalid timestamp");
    }

    return {
      interconnectorNameRaw,
      dateRaw,
      timeRaw,
      timestamp,
      interconnector,
      powerMW,
    };
  });

  return parsedData;
};

/**
 * Reworks the raw data into a more usable format, specifically:
 * - Consolidates the 5min data into 30min data
 * - Removes any NaN power values (which are usually for timestamps that haven't happened yet)
 * - Converts the power values to kWh, to match the Area Data format
 *
 * @param parsedData Raw data from the OCCTO CSV
 * @param dataFrom The start of the data period
 * @param dataTo The end of the data period
 * @returns Processed data
 */
const processData = (
  parsedData: RawOcctoInterconnectorData[],
  dataFrom: DateTime,
  dataTo: DateTime
): InterconnectorDataProcessed[] => {
  const now = DateTime.now().setZone("Asia/Tokyo");

  // Create Expected 30min Intervals
  const interval = Interval.fromDateTimes(dataFrom, dataTo);
  const intervals = interval.splitBy({ minutes: 30 });

  // Group the data by interconnector
  const groupedData: {
    interconnector: JapanInterconnectors;
    data: RawOcctoInterconnectorData[];
  }[] = Object.values(JapanInterconnectors).map((interconnector) => ({
    interconnector,
    data: [],
  }));
  parsedData.forEach((row) => {
    groupedData
      .find((group) => group.interconnector === row.interconnector)!
      .data.push(row);
  });

  // For each interconnector
  const processedData: InterconnectorDataProcessed[] = groupedData
    .map((interconnectorGroup) => {
      // Used to check at the end if we have all the data
      const intervalGroups: { interval: Interval; data: any[] }[] =
        intervals.map((interval) => ({
          interval,
          data: [],
        }));

      interconnectorGroup.data.forEach((row) => {
        const interval = intervalGroups.find(
          (group) =>
            group.interval.contains(row.timestamp) ||
            group.interval.end?.equals(row.timestamp)
        );
        if (!interval) {
          logger.error(`Could not find interval for ${row.timestamp.toISO()}`);
          throw Error("Could not find interval");
        }
        interval.data.push(row);
      });

      // For each interval group, check if we have all the data and then average it
      const averagedData: InterconnectorDataProcessed[] = [];
      intervalGroups.forEach((group) => {
        if (
          !group.interval.isValid ||
          !group.interval.start?.isValid ||
          !group.interval.end?.isValid
        ) {
          logger.error(`Invalid interval ${group.interval}`);
          throw Error("Invalid interval");
        }
        if (group.data.length !== 6) {
          logger.error(
            `Missing data for ${group.interval.start.toISO()} to ${group.interval.end?.toISO()}`
          );
          throw Error("Missing data for interval group");
        }
        if (group.data.some((row) => !Number.isFinite(row.powerMW))) {
          // Skip this interval
          if (group.interval.start < now) {
            // Only debug log if the interval has already started to reduce log spam
            logger.debug(
              `Skipping interval for ${interconnectorGroup.interconnector} starting ${group.interval.start.toString()} with invalid power values: ${group.data.map((row) => row.powerMW)}`
            );
          }
        } else {
          const totalPowerMW = group.data.reduce(
            (acc, row) => acc + row.powerMW,
            0
          );
          const averagePowerkW = (totalPowerMW / 6) * 1000;
          const averagePowerkWh = averagePowerkW * 0.5;
          // Round to 3 decimal places
          const averagePowerRoundedkWh =
            Math.round(averagePowerkWh * 1000) / 1000;
          averagedData.push({
            interconnector: interconnectorGroup.interconnector,
            fromUTC: group.interval.start,
            toUTC: group.interval.end,
            flowkWh: averagePowerRoundedkWh,
          });
        }
      });

      return averagedData;
    })
    .flat();

  return processedData;
};

const getScrapeWindow = (
  scrapeType: ScrapeType
): {
  fromDatetime: DateTime;
  toDatetime: DateTime;
} => {
  const now = DateTime.now().setZone("Asia/Tokyo");

  // Until mightnight today
  const toDatetime = now.startOf("day").plus({ days: 1 });

  const fromDatetime = (() => {
    if (scrapeType === ScrapeType.All) {
      // April 1st the year before today, this is the earliest data available
      return now.startOf("year").minus({ years: 1 }).set({ month: 4, day: 1 });
    }
    if (scrapeType === ScrapeType.New) {
      // From the start of the last month, should be no more than 31 days
      return now.startOf("month").minus({ months: 1 });
    }
    if (scrapeType === ScrapeType.Latest) {
      // From the start of the day
      return now.startOf("day");
    }
    throw Error("Invalid scrape type");
  })();

  return { fromDatetime, toDatetime };
};

const scrapeOccto = async (scrapeType: ScrapeType) => {
  const axiosInstance = axios.create({
    withCredentials: true,
  });

  const { fromDatetime, toDatetime } = getScrapeWindow(scrapeType);

  logger.info("Scraping OCCTO interconnector data, logging in...");
  const cookies = await getOcctoCookies(axiosInstance);
  axiosInstance.defaults.headers.Cookie = cookies.join("; ");

  logger.info("Getting download link...");
  const formData = await getDownloadForm(
    axiosInstance,
    fromDatetime,
    toDatetime
  );

  logger.info("Downloading OCCTO interconnector data...");
  const rawCsv = await downloadFile(axiosInstance, formData);

  // Parse raw data from the CSV without changing the format
  const parsedData = parseCsv(rawCsv);

  logger.info(`Scraped OCCTO interconnector data, ${parsedData.length} lines`);

  // Consolidate the 5min data into 30min data
  const processedData = processData(parsedData, fromDatetime, toDatetime);

  return processedData;
};

// await scrapeOccto(ScrapeType.New);
