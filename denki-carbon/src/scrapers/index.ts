import { exit } from "process";
import { JapanTsoName } from "../const";

export const runScraper = async (utility: JapanTsoName) => {
  if (utility === JapanTsoName.TEPCO) {
    const { getAreaData } = await import("./tepco");
    await getAreaData();
  }
};

// TODO: just for testing, remove this
await runScraper(JapanTsoName.TEPCO);
exit(0);
