import { JSDOM } from "jsdom";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { OldAreaCSVDataProcessed } from "../types";
import { DateTime } from "luxon";

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
      date, //  "DATE"
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
      datetimeUTC: DateTime.fromFormat(`${date} ${time}`, "yyyy/M/d H:mm", {
        zone: "Asia/Tokyo",
      }).toUTC(),
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

  // TODO: check which CSVs are new before downloading
  const dataByCSV = await Promise.all(
    oldCsvUrls.map(async (url) => {
      const csv = await downloadCSV(url);
      const data = parseOldCSV(csv);
      console.log("url:", url, "rows:", data.length, "days:", data.length / 24);
      return {
        url,
        data,
      };
    })
  );

  const allData = dataByCSV.flatMap((d) => d.data);
  console.log("allData.length", allData.length);
};
