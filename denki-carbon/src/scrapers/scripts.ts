import { exit } from "process";
import { JapanTsoName } from "../const.js";
import { runScraper } from "./index";

const tepcoStats = await runScraper(JapanTsoName.TEPCO);
console.log(tepcoStats);
const tohokuStats = await runScraper(JapanTsoName.TOHOKU);
console.log(tohokuStats);

exit(0);
