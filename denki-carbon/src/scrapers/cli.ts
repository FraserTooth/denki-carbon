import { exit } from "process";
import { JapanTsoName } from "../const.js";
import { SUPPORTED_TSOS, ScrapeType, runScraper } from "./index";
import { Argument, program, Option } from "commander";
import { DateTime } from "luxon";
import { makePredictionFromMostRecentData } from "../forecast/predict.js";

program.exitOverride((err) => {
  console.debug(err.code);
  if (err.code === "commander.missingMandatoryOptionValue") {
    program.outputHelp();
  }
  process.exit(err.exitCode);
});

program
  .version("1.0.0")
  .description("Scraping CLI")
  .addOption(
    new Option("-t, --tso <choice>", "The TSO to scrape data for")
      .makeOptionMandatory()
      .choices(["all", ...Object.values(JapanTsoName)])
  )
  .addOption(
    new Option("-s, --scrape <choice>", "The type of data to scrape")
      .makeOptionMandatory()
      .choices(Object.values(ScrapeType))
  )
  .addOption(
    new Option(
      "-p, --predict",
      "Whether or not to make a prediction after scraping data"
    ).default(false)
  )
  .action(
    async (options: {
      tso: JapanTsoName | "all";
      scrape: ScrapeType;
      predict: boolean;
    }) => {
      const { tso, scrape: scrapeType, predict } = options;
      const tsoToScrape = tso === "all" ? SUPPORTED_TSOS : [tso];
      console.log(`Running scraper for ${tso}...`);
      const statsArray: Partial<{
        newRows: number;
        tso: JapanTsoName;
        latestDatetimeSaved: DateTime;
        newForecastRows: number;
      }>[] = [];

      for (const tso of tsoToScrape) {
        console.log(`Running scraper for ${tso}...`);
        const stats = await runScraper(tso, scrapeType);
        statsArray.push(stats);
      }

      console.log("\n---- Scraper finished ----");
      statsArray.forEach((stats) => {
        console.log(
          `${stats.tso} - new rows: ${stats.newRows}, latest datetime: ${stats.latestDatetimeSaved?.toFormat("yyyy-MM-dd HH:mm")}`
        );
      });

      if (predict) {
        console.log("\n---- Making predictions ----");
        for (const tso of tsoToScrape) {
          const newForecastRows = await makePredictionFromMostRecentData(tso);
          console.log(`${tso} - new forecast rows: ${newForecastRows.length}`);
        }
      }

      exit(0);
    }
  );

program.parse(process.argv);
