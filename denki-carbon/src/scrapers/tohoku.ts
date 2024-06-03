import { DateTime } from "luxon";
import { getCSVUrlsFromPage } from ".";
import { JapanTsoName } from "../const";
import { AreaCSVDataProcessed, AreaDataFileProcessed } from "../types";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";

const OLD_CSV_URL = "https://setsuden.nw.tohoku-epco.co.jp/download.html";
const OLD_CSV_FORMAT_INTERVAL_MINUTES = 60;

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
  // Values are in MWh, so multiply by 1000 to get kWh
  return parseFloat(cleaned) * 1000;
};

const parseOldCSV = (csv: string[][]): AreaCSVDataProcessed[] => {
  // Trim 1 header row
  const dataRows = csv.slice(1);
  const data: AreaCSVDataProcessed[] = dataRows.map((row) => {
    // DATE_TIME,エリア需要〔MWh〕,水力〔MWh〕,火力〔MWh〕,原子力〔MWh〕,太陽光実績〔MWh〕,太陽光抑制量〔MWh〕,風力実績〔MWh〕,風力抑制量〔MWh〕,地熱〔MWh〕,バイオマス〔MWh〕,揚水〔MWh〕,連系線〔MWh〕
    const [
      dateTime, // "DATE_TIME"
      totalDemandMWh, // "エリア需要〔MWh〕"
      hydroMWh, // "水力〔MWh〕"
      allFossilMWh, // "火力〔MWh〕"
      nuclearMWh, // "原子力〔MWh〕"
      solarOutputMWh, // "太陽光実績〔MWh〕"
      solarThrottlingMWh, // "太陽光抑制量〔MWh〕"
      windOutputMWh, // "風力実績〔MWh〕"
      windThrottlingMWh, // "風力抑制量〔MWh〕"
      geothermalMWh, // "地熱〔MWh〕"
      biomassMWh, // "バイオマス〔MWh〕"
      pumpedStorageMWh, // "揚水〔MWh〕"
      interconnectorsMWh, // "連系線〔MWh〕"
    ] = row;
    const fromUTC = DateTime.fromFormat(
      dateTime.replaceAll("  ", " "),
      // e.g. 2023/4/1 0:00
      "yyyy/M/d H:mm",
      {
        zone: "Asia/Tokyo",
      }
    ).toUTC();
    return {
      fromUTC,
      toUTC: fromUTC.plus({ minutes: OLD_CSV_FORMAT_INTERVAL_MINUTES }),
      totalDemandkWh: parseDpToKwh(totalDemandMWh),
      hydrokWh: parseDpToKwh(hydroMWh),
      allfossilkWh: parseDpToKwh(allFossilMWh),
      nuclearkWh: parseDpToKwh(nuclearMWh),
      solarOutputkWh: parseDpToKwh(solarOutputMWh),
      solarThrottlingkWh: parseDpToKwh(solarThrottlingMWh),
      windOutputkWh: parseDpToKwh(windOutputMWh),
      windThrottlingkWh: parseDpToKwh(windThrottlingMWh),
      geothermalkWh: parseDpToKwh(geothermalMWh),
      biomasskWh: parseDpToKwh(biomassMWh),
      pumpedStoragekWh: parseDpToKwh(pumpedStorageMWh),
      interconnectorskWh: parseDpToKwh(interconnectorsMWh),
    };
  });
  return data;
};

export const getTohokuAreaData = async (): Promise<AreaDataFileProcessed[]> => {
  console.log("TOHOKU scraper running");

  const oldCsvUrls = await getCSVUrlsFromPage(
    OLD_CSV_URL,
    RegExp(/juyo_\d\d\d\d_tohoku_\dQ.csv$/),
    "https://setsuden.nw.tohoku-epco.co.jp/"
  );
  console.log("oldCsvUrls", oldCsvUrls);

  const urlsToDownload = [...oldCsvUrls.map((url) => ({ url, format: "old" }))];
  const dataByCSV = await Promise.all(
    urlsToDownload.map(async (file) => {
      const { url, format } = file;
      const csv = await downloadCSV(
        url,
        format === "old" ? "Shift_JIS" : "utf-8"
      );
      const data = format === "old" ? parseOldCSV(csv) : [];
      console.log("url:", url, "rows:", data.length, "days:", data.length / 24);
      return {
        tso: JapanTsoName.TOHOKU,
        url,
        fromDatetime: data[0].fromUTC,
        toDatetime: data[data.length - 1].toUTC,
        data,
        raw: csv.slice(1),
      };
    })
  );

  return dataByCSV;
};
