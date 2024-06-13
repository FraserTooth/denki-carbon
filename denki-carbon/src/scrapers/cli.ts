import { exit } from "process";
import { JapanTsoName, SUPPORTED_TSOS } from "../const";
import { ScrapeType, scrapeJob } from "./index";
import { program, Option } from "commander";
import { logger } from "../utils";

program.exitOverride((err) => {
  logger.debug(err.code);
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
      logger.info(`Running scraper from CLI for ${tso}...`);
      await scrapeJob(tsoToScrape, scrapeType, predict);
      exit(0);
    }
  );

program.parse(process.argv);
