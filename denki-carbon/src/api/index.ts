import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { areaDataGetHandler } from "./get/areaData";
import { areaDataGetValidator } from "./validators/areaData";
import cron from "@elysiajs/cron";
import { scrapeJob } from "../scrapers/tso";
import { SUPPORTED_TSOS } from "../const";
import { logger } from "../utils";
import cors from "@elysiajs/cors";
import { ScrapeType } from "../scrapers";
import { overviewGetValidator } from "./validators/overview";
import { overviewGetHandler } from "./get/overview";
import { ElysiaCustomStatusResponse } from "elysia/dist/error";

const app = new Elysia({ normalize: true })
  .use(
    swagger({
      path: "/docs",
      exclude: ["/", "/docs"],
      documentation: {
        info: {
          title: "Denki Carbon API Documentation",
          description: `
            API for the Denki Carbon project, which provides historical energy data and supplementary carbon intensity values for Japan's electricity grid.
            The data is sourced from each TSO's website and is updated every 30 minutes.
            This documentation is automatically generated from the API code itself, and is intended to be used to understand how to interact with the API.
            `,
          version: "1.0.0",
          contact: {
            url: "https://frasertooth.dev",
          },
          license: {
            name: "LGPL-3.0",
            url: "https://www.gnu.org/licenses/lgpl-3.0.html",
          },
        },
      },
    })
  )
  .use(cors({ origin: true }))
  .use(logger.into())
  .use(
    cron({
      name: "getLatestDataAndForecast",
      pattern: "1,31 * * * *",
      async run() {
        logger.info("Running cron job to get latest data and forecast...");
        try {
          await scrapeJob(SUPPORTED_TSOS, ScrapeType.Latest, true);
        } catch (e) {
          const error = e as Error;
          logger.error(error, `Error scraping data: ${error.message}`);
        }
      },
    })
  )
  .use(
    cron({
      name: "getNewData",
      pattern: "5 0 * * 1",
      async run() {
        logger.info("Running cron job to ensure new data in place");
        try {
          await scrapeJob(SUPPORTED_TSOS, ScrapeType.New, false);
        } catch (e) {
          const error = e as Error;
          logger.error(error, `Error scraping data: ${error.message}`);
        }
      },
    })
  )
  // TODO: Maybe use the root path for a landing page? Currently it's just a redirect to the docs
  .get("/", ({ redirect }) => {
    return redirect("/docs");
  })
  .get(
    "/v1/area_data",
    ({ query }) => areaDataGetHandler(query),
    areaDataGetValidator
  )
  .get("/v1/overview", overviewGetHandler, overviewGetValidator)
  .onError((ctx) => {
    const error = ctx.error;
    if ("name" in error) {
      logger.error(ctx, error.message);
    } else {
      logger.error(ctx, "Unknown error");
    }
    return "onError";
  })
  .listen(3000);

logger.info(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
