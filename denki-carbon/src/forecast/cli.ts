import { exit } from "process";
import { JapanTsoName, SUPPORTED_TSOS } from "../const";
import { program, Option } from "commander";
import { trainCarbonIntensityModel } from "./train";

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
  .action(async (options: { tso: JapanTsoName | "all" }) => {
    const { tso } = options;
    const tsoToScrape = tso === "all" ? SUPPORTED_TSOS : [tso];
    console.log(`Running scraper for ${tso}...`);

    for (const tso of tsoToScrape) {
      console.log(`Training model for ${tso}...`);
      await trainCarbonIntensityModel(tso);
    }

    console.log("\n---- Training finished ----");

    exit(0);
  });

program.parse(process.argv);
