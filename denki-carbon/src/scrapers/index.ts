import { JapanTsoName } from "../const";
import { AreaDataFileProcessed } from "../types";
import { db } from "../db";
import { areaDataFiles, areaDataProcessed } from "../schema";
import { getTepcoAreaData } from "./tepco";
import { JSDOM } from "jsdom";
import { getTohokuAreaData } from "./tohoku";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { DateTime } from "luxon";
import { getChubuAreaData } from "./chubu";
import { makePredictionFromMostRecentData } from "../forecast/predict";
import { logger, conflictUpdateAllExcept, axiosInstance } from "../utils";
import * as yauzlp from "yauzl-promise";
import { getHepcoAreaData } from "./hepco";
import xlsx from "node-xlsx";
import { getChugokuAreaData } from "./chugoku";
import { AxiosError } from "axios";
import { getHokudenAreaData } from "./hokuden";
import { getKepcoAreaData } from "./kepco";
import { getYondenAreaData } from "./yonden";

export enum ScrapeType {
  // Scrape all data, including old data
  All = "all",
  // Scrape only new data
  New = "new",
  // Scrape only most recent file
  Latest = "latest",
}

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
          `Invalid row #${rowIndex} in ${file.url}:`,
          JSON.stringify(row)
        );
        logger.error("rawRow:", JSON.stringify(file.raw[rowIndex]));
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
        // Possibly undefined fields
        lngkWh: row.lngkWh?.toString(),
        coalkWh: row.coalkWh?.toString(),
        oilkWh: row.oilkWh?.toString(),
        otherFossilkWh: row.otherFossilkWh?.toString(),
        batteryStoragekWh: row.batteryStoragekWh?.toString(),
        otherkWh: row.otherkWh?.toString(),
        totalkWh: row.totalkWh?.toString(),
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

export const scrapeTso = async (
  utility: JapanTsoName,
  scrapeType: ScrapeType
) => {
  const files = await (async () => {
    if (utility === JapanTsoName.TOHOKU) {
      return getTohokuAreaData(scrapeType);
    } else if (utility === JapanTsoName.TEPCO) {
      return getTepcoAreaData(scrapeType);
    } else if (utility === JapanTsoName.CHUBU) {
      return getChubuAreaData(scrapeType);
    } else if (utility === JapanTsoName.HEPCO) {
      return getHepcoAreaData(scrapeType);
    } else if (utility === JapanTsoName.CHUGOKU) {
      return getChugokuAreaData(scrapeType);
    } else if (utility === JapanTsoName.HOKUDEN) {
      return getHokudenAreaData(scrapeType);
    } else if (utility === JapanTsoName.KEPCO) {
      return getKepcoAreaData(scrapeType);
    } else if (utility === JapanTsoName.YONDEN) {
      return getYondenAreaData(scrapeType);
    }
    throw new Error(`Utility ${utility} not supported`);
  })();

  logger.debug(`Scraped ${files.length} files for ${utility}`);

  let newRowsTotal = 0;
  let latestDatetimeSavedOfAllFiles: DateTime | undefined;
  for (const file of files) {
    logger.debug(`Saving file: ${file.url}`);
    const { newRows, latestDatetimeSaved } = await saveAreaDataFile(file);
    newRowsTotal += newRows;
    if (
      !latestDatetimeSavedOfAllFiles ||
      !latestDatetimeSaved ||
      latestDatetimeSaved > latestDatetimeSavedOfAllFiles
    ) {
      latestDatetimeSavedOfAllFiles = latestDatetimeSaved;
    }
  }
  return {
    tso: utility,
    newRows: newRowsTotal,
    latestDatetimeSaved: latestDatetimeSavedOfAllFiles,
  };
};

export const scrapeJob = async (
  tsoToScrape: JapanTsoName[],
  scrapeType: ScrapeType,
  shouldPredict: boolean
) => {
  const statsArray: Partial<{
    newRows: number;
    tso: JapanTsoName;
    latestDatetimeSaved: DateTime;
    newForecastRows: number;
  }>[] = [];

  for (const tso of tsoToScrape) {
    logger.info(`---- Running scraper for ${tso} ----`);
    try {
      const stats = await scrapeTso(tso, scrapeType);
      statsArray.push(stats);
    } catch (e) {
      const error = e as Error;
      logger.error(`Error scraping ${tso}: ${error.message}`);
    }
  }

  logger.info("---- Scraper finished ----");
  statsArray.forEach((stats) => {
    logger.info(
      `${stats.tso} - new rows: ${stats.newRows}, latest datetime JST: ${stats.latestDatetimeSaved?.setZone("Asia/Tokyo").toFormat("yyyy-MM-dd HH:mm")}`
    );
  });

  if (shouldPredict) {
    logger.info("---- Making predictions ----");
    for (const tso of tsoToScrape) {
      const newForecastRows = await makePredictionFromMostRecentData(tso);
      logger.info(`${tso} - new forecast rows: ${newForecastRows.length}`);
    }
  }
};
