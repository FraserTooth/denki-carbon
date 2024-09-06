import { exit } from "process";
import { ScrapeType } from "../index";
import { program, Option } from "commander";
import { logger } from "../../utils";
import { scrapeJob } from "./occto";

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
    new Option("-s, --scrape <choice>", "The type of data to scrape")
      .makeOptionMandatory()
      .choices(Object.values(ScrapeType))
  )
  .action(async (options: { scrape: ScrapeType }) => {
    const { scrape: scrapeType } = options;
    logger.info(
      `Running scraper from CLI for OCCTO for ${scrapeType} readings.`
    );
    await scrapeJob(scrapeType);
    logger.info(`CLI Scraping job for OCCTO complete.`);
    exit(0);
  });

program.parse(process.argv);
