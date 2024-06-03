import { exit } from "process";
import { JapanTsoName } from "../const.js";
import { getCSVUrlsFromPage, runScraper } from "./index";
import { getTohokuAreaData } from "./tohoku";
import { getTepcoAreaData } from "./tepco";

// await getTohokuAreaData();
// await getTepcoAreaData();
await runScraper(JapanTsoName.TOHOKU);

exit(0);
