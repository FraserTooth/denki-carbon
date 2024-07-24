import { JapanTsoName } from "../const";

import { getTepcoAreaData } from "./tepco";
import { getTohokuAreaData } from "./tohoku";

import { DateTime } from "luxon";
import { getChubuAreaData } from "./chubu";
import { makePredictionFromMostRecentData } from "../forecast/predict";
import { logger } from "../utils";
import { getHepcoAreaData } from "./hepco";
import { getChugokuAreaData } from "./chugoku";
import { getHokudenAreaData } from "./hokuden";
import { getKepcoAreaData } from "./kepco";
import { getYondenAreaData } from "./yonden";
import { saveAreaDataFile } from "./utils";
import { getKyudenAreaData } from "./kyuden";

/**
 * The type of scraping to perform
 */
export enum ScrapeType {
  // Scrape all data, including old data
  All = "all",
  // Scrape only new data
  New = "new",
  // Scrape only most recent file
  Latest = "latest",
}

/**
 * Entry point for scraping a given TSO
 *
 * @param utility
 * @param scrapeType
 * @returns
 */
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
    } else if (utility === JapanTsoName.KYUDEN) {
      return getKyudenAreaData(scrapeType);
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

/**
 * Entry point for a scraping job
 *
 * @param tsoToScrape
 * @param scrapeType
 * @param shouldPredict
 */
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
