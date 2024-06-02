import { exit } from "process";
import { JapanTsoName } from "../const";
import { AreaDataFileProcessed } from "../types";
import { db } from "../db";
import { areaDataFiles, areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { getTepcoAreaData } from "./tepco";

export const saveAreaDataFile = async (file: AreaDataFileProcessed) => {
  const insertValues: (typeof areaDataProcessed.$inferInsert)[] = file.data.map(
    (row, rowIndex) => {
      const dateStringJST = row.datetimeUTC.setZone("Asia/Tokyo").toISODate();
      const timeStringJST = row.datetimeUTC
        .setZone("Asia/Tokyo")
        .toISOTime({ suppressMilliseconds: true });
      if (!dateStringJST || !timeStringJST) {
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
        timeJST: timeStringJST,
        datetimeUTC: row.datetimeUTC.toJSDate(),
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
    await db.insert(areaDataProcessed).values(insertBatch);
  }

  // Save the new file URLs
  console.log("Recording file", file.url);
  const scrapedFilesInsert: typeof areaDataFiles.$inferInsert = {
    tso: JapanTsoName.TEPCO,
    from_datetime: file.from_datetime.toJSDate(),
    to_datetime: file.to_datetime.toJSDate(),
    url: file.url,
    last_updated: DateTime.utc().toJSDate(),
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
