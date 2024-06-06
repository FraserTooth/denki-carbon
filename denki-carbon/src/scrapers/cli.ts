import { exit } from "process";
import { JapanTsoName } from "../const.js";
import { SUPPORTED_TSOS, runScraper } from "./index";
import { Argument, program } from "commander";
import { DateTime } from "luxon";

program.exitOverride((err) => {
  if (err.code === "commander.missingArgument") {
    program.outputHelp();
  }
  process.exit(err.exitCode);
});

program
  .version("1.0.0")
  .description("Scraping CLI")
  .addArgument(
    new Argument("tso", "The TSO to scrape data for").choices([
      "all",
      ...Object.values(JapanTsoName),
    ])
  )
  .action(async (tso: JapanTsoName | "all") => {
    console.log(`Running scraper for ${tso}...`);
    const statsArray: Partial<{
      newRows: number;
      tso: JapanTsoName;
      latestDatetimeSaved: DateTime;
    }>[] = [];
    if (tso === "all") {
      for (const tso of SUPPORTED_TSOS) {
        console.log(`Running scraper for ${tso}...`);
        const stats = await runScraper(tso);
        statsArray.push(stats);
      }
    } else {
      const stats = await runScraper(tso);
      statsArray.push(stats);
    }
    console.log("\n---- Scraper finished ----");
    statsArray.forEach((stats) => {
      console.log(
        `${stats.tso} - new rows: ${stats.newRows}, latest datetime: ${stats.latestDatetimeSaved?.toFormat("yyyy-MM-dd HH:mm")}`
      );
    });
    exit(0);
  });

program.parse(process.argv);
