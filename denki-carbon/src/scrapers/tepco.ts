import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import {
  AreaCSVDataProcessed,
  AreaDataFileProcessed,
  OldAreaCSVDataProcessed,
} from "../types";
import { DateTime } from "luxon";
import { db } from "../db";
import { areaDataFiles } from "../schema";
import { JapanTsoName } from "../const";
import { eq } from "drizzle-orm";
import { getCSVUrlsFromPage } from ".";

const OLD_CSV_URL = `https://www.tepco.co.jp/forecast/html/area_jukyu_p-j.html`;
const OLD_CSV_FORMAT_INTERVAL_MINUTES = 60;
const NEW_CSV_FORMAT_INTERVAL_MINUTES = 30;

const NEW_CSV_URL = `https://www.tepco.co.jp/forecast/html/area_jukyu-j.html`;

const downloadCSV = async (url: string, encoding: string) => {
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

const parseDpToKwh = (raw: string): number => {
  const cleaned = raw.trim().replace(",", "");
  // Values are in 万kWh, so multiply by 10000 to get kWh
  return parseFloat(cleaned) * 10000;
};

const parseAverageMWFor30minToKwh = (raw: string): number => {
  const cleaned = raw.trim().replace(",", "");
  // Values are in MW, so multiply by 1000 to get kW
  const averageKw = parseFloat(cleaned) * 1000;
  // Multiply by hours to get kWh
  return averageKw * (30 / 60);
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
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    return {
      date,
      time,
      fromUTC,
      toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT_INTERVAL_MINUTES }),
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

const parseNewCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  // Trim 2 header rows
  const dataRows = csv.slice(2);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
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
      totalAverageMW, // "合計"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      `${date.trim()} ${time.trim()}`,
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    const lngkWh = parseAverageMWFor30minToKwh(lngAverageMW);
    const coalkWh = parseAverageMWFor30minToKwh(coalAverageMW);
    const oilkWh = parseAverageMWFor30minToKwh(oilAverageMW);
    const otherFossilkWh = parseAverageMWFor30minToKwh(otherFossilAverageMW);
    return {
      date,
      time,
      fromUTC,
      toUTC: fromUTC.plus({ minutes: NEW_CSV_FORMAT_INTERVAL_MINUTES }),
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
      interconnectorskWh: parseAverageMWFor30minToKwh(interconnectorsAverageMW),
      otherkWh: parseAverageMWFor30minToKwh(otherAverageMW),
      totalkWh: parseAverageMWFor30minToKwh(totalAverageMW),
    };
  });
  return data;
};

export const getTepcoAreaData = async (): Promise<AreaDataFileProcessed[]> => {
  console.log("TEPCO scraper running");
  const oldCsvUrls = await getCSVUrlsFromPage(OLD_CSV_URL);
  console.log("oldCsvUrls", oldCsvUrls);

  const newCsvUrls = await getCSVUrlsFromPage(NEW_CSV_URL);
  console.log("newCsvUrls", newCsvUrls);

  // Check if we already have the data
  // TODO: remove in favor of upsert
  const previousFiles = await db
    .select()
    .from(areaDataFiles)
    .where(eq(areaDataFiles.tso, JapanTsoName.TEPCO));
  const previousUrls = previousFiles.map((f) => f.url);
  const newUrlsForOldCSV = oldCsvUrls.filter(
    (url) => !previousUrls.includes(url)
  );
  if (newUrlsForOldCSV.length === 0) {
    console.log("No new files to scrape");
    return [];
  }

  const dataByCSV = await Promise.all(
    newUrlsForOldCSV.map(async (url) => {
      const csv = await downloadCSV(url, "Shift_JIS");
      const data = parseOldCSV(csv);
      console.log("url:", url, "rows:", data.length, "days:", data.length / 24);
      return {
        tso: JapanTsoName.TEPCO,
        url,
        from_datetime: data[0].fromUTC,
        to_datetime: data[data.length - 1].toUTC,
        data,
        raw: csv.slice(3),
      };
    })
  );

  return dataByCSV;
};
