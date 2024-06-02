import { JSDOM } from "jsdom";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { OldAreaCSVDataProcessed } from "../types";
import { DateTime } from "luxon";
import { db } from "../db";
import { areaDataFiles, areaDataProcessed } from "../schema";
import { JapanTsoName } from "../const";

const BASE_URL = "https://www.tepco.co.jp";
const OLD_CSV_URL = `${BASE_URL}/forecast/html/area_jukyu_p-j.html`;

const getOldCSVUrls = async () => {
  const csvUrls: string[] = [];
  const response = await fetch(OLD_CSV_URL);
  const text = await response.text();
  const doc = new JSDOM(text).window.document;
  const links = doc.querySelectorAll("a");
  links.forEach((link: any) => {
    const href = link.getAttribute("href");
    if (href && href.endsWith(".csv")) {
      csvUrls.push(BASE_URL + href);
    }
  });
  return csvUrls.sort();
};

const downloadCSV = async (url: string) => {
  const response = await fetch(url);
  const dataResponse = await response.arrayBuffer();
  const buffer = Buffer.from(dataResponse);
  const decoded = iconv.decode(buffer, "Shift_JIS");

  const records: string[][] = parse(decoded, {
    relax_column_count: true,
    skip_empty_lines: true,
  });
  return records;
};

const parseDpToKwh = (raw: string): number => {
  const cleaned = raw.replace(",", "");
  // Values are in 万kWh, so multiply by 10000 to get kWh
  return parseFloat(cleaned) * 10000;
};

const parseOldCSV = (csv: string[][]): OldAreaCSVDataProcessed[] => {
  // Trim 3 header rows
  const dataRows = csv.slice(3);
  const data: OldAreaCSVDataProcessed[] = dataRows.map((row) => {
    const [
      date, // "DATE"
      time, // "TIME"
      totalDemand_daMWh, // "東京エリア需要"
      nuclear_daMWh, // "原子力"
      allfossil_daMWh, // "火力"
      hydro_daMWh, // "水力"
      geothermal_daMWh, // "地熱"
      biomass_daMWh, // "バイオマス"
      solarOutput_daMWh, // "太陽光発電実績"
      solarThrottling_daMWh, // "太陽光出力制御量"
      windOutput_daMWh, // "風力発電実績"
      windThrottling_daMWh, // "風力出力制御量"
      pumpedStorage_daMWh, // "揚水"
      interconnectors_daMWh, // "連系線"
      total_daMWh, // "合計"
    ] = row;
    return {
      date,
      time,
      datetimeUTC: DateTime.fromFormat(
        `${date.trim()} ${time.trim()}`,
        "yyyy/M/d H:mm",
        {
          zone: "Asia/Tokyo",
        }
      ).toUTC(),
      totalDemandkWh: parseDpToKwh(totalDemand_daMWh),
      nuclearkWh: parseDpToKwh(nuclear_daMWh),
      allfossilkWh: parseDpToKwh(allfossil_daMWh),
      hydrokWh: parseDpToKwh(hydro_daMWh),
      geothermalkWh: parseDpToKwh(geothermal_daMWh),
      biomasskWh: parseDpToKwh(biomass_daMWh),
      solarOutputkWh: parseDpToKwh(solarOutput_daMWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottling_daMWh),
      windOutputkWh: parseDpToKwh(windOutput_daMWh),
      windThrottlingkWh: parseDpToKwh(windThrottling_daMWh),
      pumpedStoragekWh: parseDpToKwh(pumpedStorage_daMWh),
      interconnectorskWh: parseDpToKwh(interconnectors_daMWh),
      totalkWh: parseDpToKwh(total_daMWh),
    };
  });
  return data;
};

export const getAreaData = async () => {
  console.log("TEPCO scraper running");
  const oldCsvUrls = await getOldCSVUrls();

  console.log("oldCsvUrls", oldCsvUrls);

  // Check if we already have the data
  const previousFiles = await db.select().from(areaDataFiles);
  const previousUrls = previousFiles.map((f) => f.url);
  const newUrlsForOldCSV = oldCsvUrls.filter(
    (url) => !previousUrls.includes(url)
  );
  if (newUrlsForOldCSV.length === 0) {
    console.log("No new files to scrape");
    return;
  }

  const dataByCSV = await Promise.all(
    newUrlsForOldCSV.map(async (url) => {
      const csv = await downloadCSV(url);
      const data = parseOldCSV(csv);
      console.log("url:", url, "rows:", data.length, "days:", data.length / 24);
      return {
        url,
        from_datetime: data[0].datetimeUTC,
        to_datetime: data[data.length - 1].datetimeUTC,
        data,
        raw: csv.slice(3),
      };
    })
  );

  // Save the new data
  const dataInsertByCsv = dataByCSV.map((csv) => {
    const data = csv.data;
    const insertValues: (typeof areaDataProcessed.$inferInsert)[] = data.map(
      (row, rowIndex) => {
        const dateStringJST = row.datetimeUTC.setZone("Asia/Tokyo").toISODate();
        const timeStringJST = row.datetimeUTC
          .setZone("Asia/Tokyo")
          .toISOTime({ suppressMilliseconds: true });
        if (!dateStringJST || !timeStringJST) {
          console.error(
            `Invalid row #${rowIndex} in ${csv.url}:`,
            JSON.stringify(row)
          );
          console.error("rawRow:", JSON.stringify(csv.raw[rowIndex]));
          throw new Error("Invalid date or time");
        }
        return {
          tso: JapanTsoName.TEPCO,
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
    return {
      ...csv,
      dataInsert: insertValues,
    };
  });

  // Insert the data 900 rows at a time
  await Promise.all(
    dataInsertByCsv.map(async (csv) => {
      const data = csv.dataInsert;
      console.log("Inserting", data.length, "rows for", csv.url);
      for (let i = 0; i < data.length; i += 900) {
        console.log("Inserting rows", i, "to", i + 900);
        const insertBatch = data.slice(i, i + 900);
        await db.insert(areaDataProcessed).values(insertBatch);
      }
    })
  );

  // Save the new file URLs
  const scrapedFilesInsert: (typeof areaDataFiles.$inferInsert)[] =
    dataByCSV.map((csv) => {
      console.log("Registering File:", csv.url);
      return {
        tso: JapanTsoName.TEPCO,
        from_datetime: csv.from_datetime.toJSDate(),
        to_datetime: csv.to_datetime.toJSDate(),
        url: csv.url,
        last_updated: DateTime.utc().toJSDate(),
      };
    });
  await db.insert(areaDataFiles).values(scrapedFilesInsert);
};
