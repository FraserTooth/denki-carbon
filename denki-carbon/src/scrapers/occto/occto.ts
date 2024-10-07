import axios, { AxiosInstance } from "axios";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { DateTime, Interval } from "luxon";
import { INTERCONNECTOR_DETAILS, JapanInterconnectors } from "../../const";
import { conflictUpdateAllExcept, logger } from "../../utils";
import {
  InterconnectorDataProcessed,
  RawOcctoInterconnectorData,
} from "../../types";
import { ScrapeType } from "..";
import { interconnectorDataProcessed } from "../../schema";
import { db } from "../../db";

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
    const interconnectorDetails = INTERCONNECTOR_DETAILS.find((ic) => {
      return ic.occtoName === interconnectorNameRaw;
    });
    if (!interconnectorDetails) {
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
      interconnector: interconnectorDetails.id,
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
        // Check that we have 6 rows per interval
        if (group.data.length !== 6) {
          logger.error(
            `Missing data for ${group.interval.start.toISO()} to ${group.interval.end?.toISO()}`
          );
          throw Error("Missing rows for interval group");
        }
        // If row end is after "now" or
        // If less than 2 rows have valid power values,
        // skip this interval
        const rowsWithValidPowerValues = group.data.filter((row) =>
          Number.isFinite(row.powerMW)
        );
        if (group.interval.end > now || rowsWithValidPowerValues.length <= 2) {
          // Skip this interval
          if (group.interval.end < now) {
            // Only debug log if the interval is in the past to reduce log spam
            logger.debug(
              `Skipping interval for ${interconnectorGroup.interconnector} starting ${group.interval.start.toString()} with invalid power values: ${group.data.map((row) => row.powerMW)}`
            );
          }
        } else {
          const totalPowerMW = rowsWithValidPowerValues.reduce(
            (acc, row) => acc + row.powerMW,
            0
          );
          // Average the power values and convert to kW
          const averagePowerkW =
            (totalPowerMW / rowsWithValidPowerValues.length) * 1000;
          // Convert to kWh, 30min period is 0.5 hours
          const averagePowerkWh = averagePowerkW * 0.5;
          // Round to 3 decimal places
          const averagePowerRoundedkWh =
            Math.round(averagePowerkWh * 1000) / 1000;
          averagedData.push({
            interconnector: interconnectorGroup.interconnector,
            fromUTC: group.interval.start.toUTC(),
            toUTC: group.interval.end.toUTC(),
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
      // Two April 1st's ago
      return (
        now
          .startOf("day")
          // If we are past April 1st this year, then we only need to go back 1 year, otherwise 2 years
          .minus({ years: now.month >= 4 && now.day > 1 ? 1 : 2 })
          .set({ month: 4, day: 1 })
      );
    }
    if (scrapeType === ScrapeType.New) {
      // From the start of the last month, should be no more than 31 days
      return now.startOf("month").minus({ months: 1 });
    }
    if (scrapeType === ScrapeType.Latest) {
      // From the start of the day before
      return now.startOf("day").minus({ days: 1 });
    }
    throw Error("Invalid scrape type");
  })();

  return { fromDatetime, toDatetime };
};

/**
 * Get OCCTO interconnector data
 *
 * @param axiosInstance
 * @param fromDatetime
 * @param toDatetime
 * @param chunkNumber - used for logging
 */
const scrapeOcctoChunk = async (
  axiosInstance: AxiosInstance,
  fromDatetime: DateTime,
  toDatetime: DateTime,
  chunkNumber: number
): Promise<InterconnectorDataProcessed[]> => {
  logger.info(
    `Scraping chunk #${chunkNumber} OCCTO interconnector data from ${fromDatetime.toISO()} to ${toDatetime.toISO()}`
  );
  const cookies = await getOcctoCookies(axiosInstance);
  axiosInstance.defaults.headers.Cookie = cookies.join("; ");

  logger.info(`Chunk #${chunkNumber}, got OCCTO cookies`);
  const formData = await getDownloadForm(
    axiosInstance,
    fromDatetime,
    toDatetime
  );

  logger.info(`Chunk #${chunkNumber}, got OCCTO download form`);
  const rawCsv = await downloadFile(axiosInstance, formData);

  // Parse raw data from the CSV without changing the format
  const parsedData = parseCsv(rawCsv);

  logger.info(
    `Parsed chunk #${chunkNumber}, ${parsedData.length} lines of OCCTO data`
  );

  // Consolidate the 5min data into 30min data
  const processedData = processData(parsedData, fromDatetime, toDatetime);

  logger.info(
    `Processed chunk #${chunkNumber}, ${processedData.length} lines of OCCTO data`
  );

  return processedData;
};

const scrapeOccto = async (scrapeType: ScrapeType) => {
  const axiosInstance = axios.create({
    withCredentials: true,
  });

  const { fromDatetime, toDatetime } = getScrapeWindow(scrapeType);

  logger.info(
    `Scraping OCCTO interconnector data from ${fromDatetime.toISO()} to ${toDatetime.toISO()}`
  );

  // OCCTO only allows 150000 lines of data, which works out to about 52 days
  // So we need to scrape in chunks
  const chunkSize = 45; // 45 days to give some wiggle room
  const chunkIntervals = Interval.fromDateTimes(
    fromDatetime,
    toDatetime
  ).splitBy({ days: chunkSize });

  logger.info(`Downloading data in ${chunkIntervals.length} chunks`);

  // Download the files one by one, takes ages but running in parrallel causes errors
  const allData: InterconnectorDataProcessed[] = [];
  for await (const [chunkNumber, interval] of chunkIntervals.entries()) {
    const from = interval.start;
    const to = interval.end;
    if (!from || !from.isValid || !to || !to.isValid)
      throw Error("Invalid chunk intervals");
    try {
      const processedData = await scrapeOcctoChunk(
        axiosInstance,
        from,
        to,
        chunkNumber
      );
      allData.push(...processedData);
    } catch (e) {
      logger.error(`Error in chunk #${chunkNumber}: ${e}`);
      throw e;
    }
  }

  logger.info(`Scraped OCCTO interconnector data, ${allData.length} lines`);

  return allData;
};

const saveOcctoData = async (data: InterconnectorDataProcessed[]) => {
  let latestDatetimeSavedUTC: DateTime | undefined;
  const insertValues: (typeof interconnectorDataProcessed.$inferInsert)[] =
    data.map((row, rowIndex) => {
      // Update the latest datetime saved
      if (!latestDatetimeSavedUTC || row.fromUTC > latestDatetimeSavedUTC) {
        latestDatetimeSavedUTC = row.fromUTC;
      }

      const dateStringJST = row.fromUTC.setZone("Asia/Tokyo").toISODate();
      const timeFromStringJST = row.fromUTC
        .setZone("Asia/Tokyo")
        .toFormat("HH:mm");
      const timeToStringJST = row.toUTC.setZone("Asia/Tokyo").toFormat("HH:mm");
      if (!dateStringJST || !timeFromStringJST || !timeToStringJST) {
        logger.error(`Invalid row #${rowIndex}: ${JSON.stringify(row)}`);
        throw new Error("Invalid date or time");
      }
      return {
        dataId: [row.interconnector, dateStringJST, timeFromStringJST].join(
          "_"
        ),
        interconnector: row.interconnector,
        dateJST: dateStringJST,
        timeFromJST: timeFromStringJST,
        timeToJST: timeToStringJST,
        datetimeFrom: row.fromUTC.toJSDate(),
        datetimeTo: row.toUTC.toJSDate(),
        powerkWh: row.flowkWh.toString(),
      };
    });

  logger.debug(
    `Attempting insert of ${insertValues.length} rows for OCCTO interconnector data`
  );
  let insertedRowsCount = 0;
  for (let i = 0; i < insertValues.length; i += 900) {
    logger.debug(`Inserting rows ${i} to ${i + 900}`);
    const insertBatch = insertValues.slice(i, i + 900);
    const response = await db
      .insert(interconnectorDataProcessed)
      .values(insertBatch)
      .onConflictDoUpdate({
        target: interconnectorDataProcessed.dataId,
        set: conflictUpdateAllExcept(interconnectorDataProcessed, ["dataId"]),
      });
    insertedRowsCount += response.rowCount ?? 0;
  }
  logger.debug(
    `Inserted ${insertedRowsCount} rows for OCCTO interconnector data`
  );

  return { newRows: insertedRowsCount, latestDatetimeSavedUTC };
};

export const scrapeJob = async (scrapeType: ScrapeType) => {
  logger.info(`Running OCCTO scraper for ${scrapeType}`);

  const data = await scrapeOccto(scrapeType);

  // Load the data into the database
  const { newRows, latestDatetimeSavedUTC } = await saveOcctoData(data);

  logger.info(
    `OCCTO scraper finished, new rows: ${newRows}, latest datetime JST: ${latestDatetimeSavedUTC?.setZone("Asia/Tokyo")?.toISO()}`
  );
};
