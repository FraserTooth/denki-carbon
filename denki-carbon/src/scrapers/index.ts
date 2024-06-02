import { exit } from "process";
import { JapanTsoName } from "../const";
import { AreaDataFileProcessed } from "../types";
import { db } from "../db";
import { areaDataFiles, areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { getTepcoAreaData } from "./tepco";
import { JSDOM } from "jsdom";

export const getCSVUrlsFromPage = async (pageUrl: string) => {
  const csvUrls: string[] = [];
  const response = await fetch(pageUrl);
  const text = await response.text();
  const doc = new JSDOM(text).window.document;
  const baseUrl = "https://" + pageUrl.split("https://")[1].split("/")[0];
  const links = doc.querySelectorAll("a");
  links.forEach((link: any) => {
    const href = link.getAttribute("href");
    if (href && href.endsWith(".csv")) {
      csvUrls.push(baseUrl + href);
    }
  });
  return csvUrls.sort();
};

export const saveAreaDataFile = async (file: AreaDataFileProcessed) => {
  const insertValues: (typeof areaDataProcessed.$inferInsert)[] = file.data.map(
    (row, rowIndex) => {
      const dateStringJST = row.fromUTC.setZone("Asia/Tokyo").toISODate();
      const timeFromStringJST = row.fromUTC
        .setZone("Asia/Tokyo")
        .toISOTime({ suppressMilliseconds: true });
      const timeToStringJST = row.toUTC
        .setZone("Asia/Tokyo")
        .toISOTime({ suppressMilliseconds: true });
      if (!dateStringJST || !timeFromStringJST || !timeToStringJST) {
        console.error(
          `Invalid row #${rowIndex} in ${file.url}:`,
          JSON.stringify(row)
        );
        console.error("rawRow:", JSON.stringify(file.raw[rowIndex]));
        throw new Error("Invalid date or time");
      }
      return {
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
        totalkWh: row.totalkWh.toString(),
      };
    }
  );

  console.log("Inserting", insertValues.length, "rows for", file.url);
  for (let i = 0; i < insertValues.length; i += 900) {
    console.log("Inserting rows", i, "to", i + 900);
    const insertBatch = insertValues.slice(i, i + 900);
    // TODO: make this an upsert
    await db.insert(areaDataProcessed).values(insertBatch);
  }

  // Save the new file URLs
  console.log("Recording file", file.url);
  const scrapedFilesInsert: typeof areaDataFiles.$inferInsert = {
    tso: JapanTsoName.TEPCO,
    from_datetime: file.from_datetime.toJSDate(),
    to_datetime: file.to_datetime.toJSDate(),
    url: file.url,
  };
  await db.insert(areaDataFiles).values(scrapedFilesInsert);
};

export const runScraper = async (utility: JapanTsoName) => {
  if (utility === JapanTsoName.TEPCO) {
    const files = await getTepcoAreaData();
    for (const file of files) {
      await saveAreaDataFile(file);
    }
  }
};

// TODO: just for testing, remove this
await runScraper(JapanTsoName.TEPCO);
exit(0);
