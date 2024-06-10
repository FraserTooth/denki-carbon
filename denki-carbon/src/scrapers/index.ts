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
  const response = await fetch(pageUrl);
  const text = await response.text();
  const doc = new JSDOM(text).window.document;
  const links = doc.querySelectorAll("a");
  links.forEach((link: any) => {
    const href = link.getAttribute("href");
    if (href && urlRegex.test(href)) {
      csvUrls.push(baseUrl + href);
    }
  });
  return csvUrls.sort();
};

export const downloadCSV = async (url: string, encoding: string) => {
  const response = await fetch(url);
  const dataResponse = await response.arrayBuffer();
  const buffer = Buffer.from(dataResponse);
  const decoded = iconv.decode(buffer, encoding);

  const records: string[][] = parse(decoded, {
    relax_column_count: true,
    skip_empty_lines: true,
  });
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
        console.error(
          `Invalid row #${rowIndex} in ${file.url}:`,
          JSON.stringify(row)
        );
        console.error("rawRow:", JSON.stringify(file.raw[rowIndex]));
        throw new Error("Invalid date or time");
      }
      // Not the only column that can be invalid, but would indicate a problem
      if (!isFinite(row.totalDemandkWh)) {
        console.error(
          `Invalid in row #${rowIndex} in ${file.url}:`,
          JSON.stringify(row)
        );
        console.error("rawRow:", JSON.stringify(file.raw[rowIndex]));
        throw new Error("Invalid totalDemandkWh");
      }
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

  console.log(
    `Attempting insert of ${insertValues.length} rows for ${file.url}`
  );
  let insertedRowsCount = 0;
  for (let i = 0; i < insertValues.length; i += 900) {
    console.debug("Inserting rows", i, "to", i + 900);
    const insertBatch = insertValues.slice(i, i + 900);
    const response = await db
      .insert(areaDataProcessed)
      .values(insertBatch)
      .onConflictDoNothing();
    insertedRowsCount += response.rowCount ?? 0;
  }
  console.log(`Inserted ${insertedRowsCount} rows for ${file.url}`);

  // Save the new file URLs
  console.log("Recording file", file.url);
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

export const runScraper = async (
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
    }
    throw new Error(`Utility ${utility} not supported`);
  })();

  let newRowsTotal = 0;
  let latestDatetimeSavedOfAllFiles: DateTime | undefined;
  for (const file of files) {
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
