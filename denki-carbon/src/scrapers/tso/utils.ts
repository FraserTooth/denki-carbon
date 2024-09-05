import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../../types";
import { db } from "../../db";
import { areaDataFiles, areaDataProcessed } from "../../schema";
import { JSDOM } from "jsdom";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { DateTime } from "luxon";
import {
  logger,
  conflictUpdateAllExcept,
  axiosInstance,
  onlyPositive,
} from "../../utils";
import * as yauzlp from "yauzl-promise";
import xlsx from "node-xlsx";
import { AxiosError } from "axios";

export const NEW_CSV_FORMAT = {
  blocksInDay: 48,
  encoding: "Shift_JIS",
  headerRows: 2,
  intervalMinutes: 30,
};

/**
 * Common function to handle the datapoint parsing for new format CSVs
 *
 * @param raw the raw datapoint as a string
 * @returns the datapoint as a number
 */
export const parseAverageMWFor30minToKwh = (raw: string): number => {
  const placeholders = ["－", ""];
  if (placeholders.includes(raw)) return 0;
  const cleaned = raw.trim().replace(RegExp(/[^-\d]/g), "");
  // Values are in MW, so multiply by 1000 to get kW
  const averageKw = parseFloat(cleaned) * 1000;
  // Multiply by hours to get kWh
  return averageKw * (30 / 60);
};

/**
 * Parses the CSV data for the new format, which is consistent across all TSOs
 *
 * @param csv
 * @returns
 */
export const parseNewCSV = (
  csv: string[][],
  config: {
    dateFormat: string; // Only different for Kyuden
    isTimeAtEndOfBlock: boolean; // Only different for Kyuden
    flipInterconnectors: boolean; // Only different for Kyuden
  } = {
    dateFormat: "yyyy/M/d",
    isTimeAtEndOfBlock: false,
    flipInterconnectors: false,
  }
): AreaCSVDataProcessed[] => {
  const headerRow = csv.findIndex((row) =>
    ["DATE", "年月日"].includes(row[0].trim())
  );
  let startRow = headerRow + 1;
  if (
    // Skip first row if it is empty
    csv[startRow].every((value) => value === "") ||
    // or if it looks like another header row
    csv[startRow].some((value) => value.includes("MW"))
  )
    startRow++;
  const dataRows = csv.slice(startRow);
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
      totalAverageMW, // "合計" - uses a value that subtracts charging storage and interconnectors, so isn't useful for carbon calcs
    ] = row;

    // Skip rows with missing data, which is expected on the "today" realtime value, totalAverageMW is a good indicator
    if (!totalDemandAverageMW) return;

    const [fromUTC, toUTC] = (() => {
      const timeCleaned = time
        .trim()
        .split("～")[0] // Handles HEPCOs weird format
        .replaceAll(":00:00", ":00") // Remove randomly occuring seconds from time values, handles odd datapoints in the Kyuden CSVs
        .replaceAll(":30:00", ":30"); // Remove randomly occuring seconds from time values, handles odd datapoints in the Kyuden CSVs

      const datetimeForBlock = DateTime.fromFormat(
        `${date.trim()} ${timeCleaned}`,
        `${config.dateFormat} H:mm`,
        {
          zone: "Asia/Tokyo",
        }
      ).toUTC();
      if (config.isTimeAtEndOfBlock) {
        return [
          datetimeForBlock.minus({ minutes: NEW_CSV_FORMAT.intervalMinutes }),
          datetimeForBlock,
        ];
      } else {
        return [
          datetimeForBlock,
          datetimeForBlock.plus({ minutes: NEW_CSV_FORMAT.intervalMinutes }),
        ];
      }
    })();

    const lngkWh = parseAverageMWFor30minToKwh(lngAverageMW);
    const coalkWh = parseAverageMWFor30minToKwh(coalAverageMW);
    const oilkWh = parseAverageMWFor30minToKwh(oilAverageMW);
    const otherFossilkWh = parseAverageMWFor30minToKwh(otherFossilAverageMW);
    const parsed = {
      fromUTC,
      toUTC,
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
      interconnectorskWh:
        parseAverageMWFor30minToKwh(interconnectorsAverageMW) *
        (config.flipInterconnectors ? -1 : 1),
      otherkWh: parseAverageMWFor30minToKwh(otherAverageMW),
    };
    data.push({
      ...parsed,
      // Calculate total generation manually, sum of the positive values
      totalGenerationkWh: [
        parsed.nuclearkWh,
        parsed.lngkWh,
        parsed.coalkWh,
        parsed.oilkWh,
        parsed.otherFossilkWh,
        parsed.hydrokWh,
        parsed.geothermalkWh,
        parsed.biomasskWh,
        parsed.solarOutputkWh, // TODO - do I need to subtract throttling to get the right output?
        parsed.windOutputkWh, // TODO - do I need to subtract throttling to get the right output?
        parsed.pumpedStoragekWh,
        parsed.batteryStoragekWh,
        parsed.interconnectorskWh,
        parsed.otherkWh,
      ].reduce((acc, val) => acc + onlyPositive(val), 0),
    });
  });
  // Remove NaN rows
  const dataFiltered = data.filter((row) => !isNaN(row.totalDemandkWh));
  logger.debug({ rowsSkipped: data.length - dataFiltered.length });
  return dataFiltered;
};

/**
 * Downloads a HTML page and extracts URLs from it based on a regex
 *
 * @param pageUrl the URL of the page to download
 * @param urlRegex the regex to match URLs
 * @param baseUrl the base URL to prepend to the matched URLs (since <a> tags generally don't have the full URL)
 * @returns an array of URLs as strings
 */
export const getCSVUrlsFromPage = async (
  pageUrl: string,
  urlRegex: RegExp,
  baseUrl: string
) => {
  const csvUrls: string[] = [];
  const response = await axiosInstance.get(pageUrl, {
    responseType: "text",
  });
  const text = await response.data;
  const doc = new JSDOM(text).window.document;
  const links = doc.querySelectorAll("a");
  links.forEach((link: any) => {
    const href = link.getAttribute("href");
    if (href && urlRegex.test(href)) {
      // Remove leading non-alphanumeric and non-slash characters
      const hrefStripped = href.replace(/^[^a-zA-Z0-9\/]/, "");
      csvUrls.push(baseUrl + hrefStripped);
    }
  });
  return csvUrls.sort();
};

/**
 * Core function to handle the downloading of files from a TSO website
 *
 * @param url the URL to download from
 * @param encoding the encoding of the file
 * @param attempt which attempt we're on, part of the retry recursion, defaults to 1
 * @returns the decoded raw data of the file in a 2D array of strings
 */
export const downloadCSV = async (
  url: string,
  encoding: string,
  attempt: number = 1
): Promise<string[][]> => {
  const response = await (async () => {
    try {
      // Add abort signal to handle connection issues
      const abortSignal = AbortSignal.timeout(1000);
      return await axiosInstance.get(url, {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=data.csv",
        },
        signal: abortSignal,
      });
    } catch (e) {
      const error = e as AxiosError;
      logger.error(`Error downloading ${url}: ${error.message}, ${error.code}`);
      logger.error("Error response:", error.response?.data);
      throw e;
    }
  })();
  const dataResponse = await response.data;

  // If buffer is empty, retry up to 3 times
  if (dataResponse.byteLength === 0) {
    if (attempt >= 4) {
      throw new Error(`Empty response for ${url}`);
    }
    logger.warn(
      `Empty response for ${url}, retrying with attempt #${attempt + 1}`
    );
    // Wait 1 second before retrying
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return downloadCSV(url, encoding, attempt + 1);
  }

  const decoded = await (async () => {
    if (url.includes("csv")) {
      const buffer = Buffer.from(dataResponse);
      return iconv.decode(buffer, encoding);
    } else if (url.includes("xls")) {
      const buffer = Buffer.from(dataResponse);
      const recordsXLS = xlsx.parse(buffer, {
        type: "buffer",
        cellDates: true,
        cellNF: false,
        cellText: false,
        UTC: true,
      });
      // Convert to CSV string
      const csv = recordsXLS[0].data
        .map((row: any[]) => {
          if (row[0] instanceof Date) {
            row[0] = DateTime.fromJSDate(row[0])
              .setZone("Asia/Tokyo")
              .toFormat("yyyy/MM/dd");
          }
          if (row[1] instanceof Date) {
            row[1] = DateTime.fromJSDate(row[1])
              .setZone("Asia/Tokyo")
              .toFormat("HH:mm");
          }
          return row.join(",");
        })
        .join("\n");
      return csv;
    } else if (url.includes("zip")) {
      const zipBuffer = Buffer.from(dataResponse);
      const buffer = await (async () => {
        const zip = await yauzlp.fromBuffer(zipBuffer);
        const chunks: Uint8Array[] = [];
        try {
          for await (const entry of zip) {
            if (entry.filename.endsWith("/")) {
              // Directory, we can ignore
              continue;
            } else {
              // We currently just assume the ZIP file only contains one CSV file
              const readStream = await entry.openReadStream();
              for await (const chunk of readStream) {
                chunks.push(chunk);
              }
            }
          }
        } finally {
          await zip.close();
          return Buffer.concat(chunks);
        }
      })();
      return iconv.decode(buffer, encoding);
    } else {
      throw new Error(`Unsupported file type: ${url}`);
    }
  })();

  const records: string[][] = parse(decoded, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  });

  // Trim rows, but only at the end of the file
  for (let i = records.length - 1; i >= 0; i--) {
    if (
      // If has 2 or fewer columns, it's likely a datetime row with no data, trim it
      records[i].length <= 2 ||
      // If all cells are empty, trim it
      records[i].every((cell) => cell === "") ||
      // If first cell contains "合", trim it - edge case for Yonden
      records[i][0].includes("合")
    ) {
      records.pop();
    } else {
      break;
    }
  }

  return records;
};

/**
 * Given the data from a processed file, uploads it into the database
 *
 * @param file the processed file data
 * @returns information about the uploaded file
 */
export const saveAreaDataFile = async (file: AreaDataFileProcessed) => {
  let latestDatetimeSaved: DateTime | undefined;
  const insertValues: (typeof areaDataProcessed.$inferInsert)[] = file.data.map(
    (row, rowIndex) => {
      // Update the latest datetime saved
      if (!latestDatetimeSaved || row.fromUTC > latestDatetimeSaved) {
        latestDatetimeSaved = row.fromUTC;
      }

      const dateStringJST = row.fromUTC.setZone("Asia/Tokyo").toISODate();
      const timeFromStringJST = row.fromUTC
        .setZone("Asia/Tokyo")
        .toFormat("HH:mm");
      const timeToStringJST = row.toUTC.setZone("Asia/Tokyo").toFormat("HH:mm");
      if (!dateStringJST || !timeFromStringJST || !timeToStringJST) {
        logger.error(
          `Invalid row #${rowIndex} in ${file.url}: ${JSON.stringify(row)}`
        );
        logger.error(`rawRow: ${JSON.stringify(file.raw[rowIndex])}`);
        throw new Error("Invalid date or time");
      }
      // Values that must be finite
      const valuesToCheck = [
        row.totalDemandkWh,
        row.solarThrottlingkWh,
        row.windThrottlingkWh,
      ];
      valuesToCheck.forEach((value) => {
        if (!isFinite(value)) {
          logger.error(
            `Invalid data in row #${rowIndex} in ${file.url}: ${JSON.stringify(row)}`,
            row
          );
          logger.error(
            `rawRow: ${JSON.stringify(file.raw[rowIndex])}`,
            JSON.stringify(file.raw[rowIndex])
          );
          throw new Error("Invalid data");
        }
      });
      return {
        dataId: [file.tso, dateStringJST, timeFromStringJST].join("_"),
        tso: file.tso,
        dateJST: dateStringJST,
        timeFromJST: timeFromStringJST,
        timeToJST: timeToStringJST,
        datetimeFrom: row.fromUTC.toJSDate(),
        datetimeTo: row.toUTC.toJSDate(),
        totalDemandkWh: row.totalDemandkWh.toString(),
        nuclearkWh: row.nuclearkWh.toString(),
        allfossilkWh: row.allfossilkWh.toString(),
        hydrokWh: row.hydrokWh.toString(),
        geothermalkWh: row.geothermalkWh.toString(),
        biomasskWh: row.biomasskWh.toString(),
        solarOutputkWh: row.solarOutputkWh.toString(),
        solarThrottlingkWh: row.solarThrottlingkWh.toString(),
        windOutputkWh: row.windOutputkWh.toString(),
        windThrottlingkWh: row.windThrottlingkWh.toString(),
        pumpedStoragekWh: row.pumpedStoragekWh.toString(),
        interconnectorskWh: row.interconnectorskWh.toString(),
        totalGenerationkWh: row.totalGenerationkWh.toString(),
        // Possibly undefined fields
        lngkWh: row.lngkWh?.toString(),
        coalkWh: row.coalkWh?.toString(),
        oilkWh: row.oilkWh?.toString(),
        otherFossilkWh: row.otherFossilkWh?.toString(),
        batteryStoragekWh: row.batteryStoragekWh?.toString(),
        otherkWh: row.otherkWh?.toString(),
      };
    }
  );

  logger.debug(
    `Attempting insert of ${insertValues.length} rows for ${file.url}`
  );
  let insertedRowsCount = 0;
  for (let i = 0; i < insertValues.length; i += 900) {
    logger.debug(`Inserting rows ${i} to ${i + 900}`);
    const insertBatch = insertValues.slice(i, i + 900);
    const response = await db
      .insert(areaDataProcessed)
      .values(insertBatch)
      .onConflictDoUpdate({
        target: areaDataProcessed.dataId,
        set: conflictUpdateAllExcept(areaDataProcessed, ["dataId"]),
      });
    insertedRowsCount += response.rowCount ?? 0;
  }
  logger.debug(`Inserted ${insertedRowsCount} rows for ${file.url}`);

  // Save the new file URLs
  logger.debug(`Recording file: ${file.url}`);
  const fileDateStringJST = file.fromDatetime.setZone("Asia/Tokyo").toISODate();
  const scrapedFilesInsert: typeof areaDataFiles.$inferInsert = {
    fileKey: `${file.tso}_${fileDateStringJST}`,
    tso: file.tso,
    fromDatetime: file.fromDatetime.toJSDate(),
    toDatetime: file.toDatetime.toJSDate(),
    dataRows: file.data.length,
    url: file.url,
  };
  await db
    .insert(areaDataFiles)
    .values(scrapedFilesInsert)
    .onConflictDoUpdate({
      target: areaDataFiles.fileKey,
      set: {
        toDatetime: scrapedFilesInsert.toDatetime,
        dataRows: scrapedFilesInsert.dataRows,
        lastUpdated: new Date(),
      },
    });
  return {
    fileKey: scrapedFilesInsert.fileKey,
    newRows: insertedRowsCount,
    latestDatetimeSaved,
  };
};
