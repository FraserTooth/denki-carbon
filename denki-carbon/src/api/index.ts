import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { areaDataGetHandler, areaDataGetValidator } from "./get/areaData";
import cron from "@elysiajs/cron";
import { ScrapeType, scrapeJob } from "../scrapers";
import { SUPPORTED_TSOS } from "../const";

const app = new Elysia({ normalize: true })
  .use(
    swagger({
      path: "/docs",
    })
  )
  .use(
    cron({
      name: "getLatestDataAndForecast",
      pattern: "1,31 * * * *",
      async run() {
        console.log("Running cron job to get latest data and forecast...");
        await scrapeJob(SUPPORTED_TSOS, ScrapeType.Latest, true);
      },
    })
  )
  .get(
    "/v1/area_data",
    ({ query }) => areaDataGetHandler(query),
    areaDataGetValidator
  )

  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
