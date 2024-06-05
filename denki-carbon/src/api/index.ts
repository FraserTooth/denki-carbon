import { Elysia, Static, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { db } from "../db";
import { JapanTsoName } from "../const";
import { areaDataProcessed, carbonIntensityForecasts } from "../schema";
import { between, eq, and } from "drizzle-orm";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { numberifyAreaDataRow, rTo3Dec, strToNum } from "./utils";

const areaDataGetQueryParamsValidator = t.Object({
  tso: t.Enum(JapanTsoName),
  from: t.Date(),
  to: t.Date(),
  includeForecast: t.Optional(t.String()),
});
type AreaDataGetParamsValidated = Static<
  typeof areaDataGetQueryParamsValidator
>;
const areaDataGetHandler = async (query: AreaDataGetParamsValidated) => {
  const areaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        eq(areaDataProcessed.tso, query.tso),
        between(areaDataProcessed.datetimeFrom, query.from, query.to)
      )
    )
    .orderBy(areaDataProcessed.datetimeFrom);

  const resultsWithIntensity = areaDataResult.map((row) => {
    const normalizedRow = numberifyAreaDataRow(row);

    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    // Trim to 2 decimal places
    const carbonIntensityRounded = Math.round(carbonIntensity * 100) / 100;
    return { ...normalizedRow, carbonIntensity: carbonIntensityRounded };
  });

  if (!query.includeForecast || query.includeForecast === "false") {
    return resultsWithIntensity;
  }

  // Get the forecasted data
  const forecastedDataResult = await db
    .select()
    .from(carbonIntensityForecasts)
    .where(
      and(
        eq(carbonIntensityForecasts.tso, query.tso),
        between(carbonIntensityForecasts.datetimeFrom, query.from, query.to)
      )
    )
    .orderBy(carbonIntensityForecasts.datetimeFrom);

  const resultsWithForecasts = resultsWithIntensity.map((row) => {
    const forecastsForRow = forecastedDataResult.filter(
      (forecast) =>
        forecast.datetimeFrom.getTime() === row.datetimeFrom.getTime()
    );
    if (forecastsForRow.length === 0) return row;
    // Sort descending by createdAt
    forecastsForRow.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    // If datetimeFrom is in the future, use the most recent forecast
    if (row.datetimeFrom.getTime() > new Date().getTime()) {
      return {
        ...row,
        predictedCarbonIntensity: strToNum(
          forecastsForRow[0].predictedCarbonIntensity
        ),
      };
    }
    // Otherwise, average the forecasts
    const totalIntensity = forecastsForRow.reduce(
      (acc, forecast) => acc + parseFloat(forecast.predictedCarbonIntensity),
      0
    );
    const averageForecastedIntensity = totalIntensity / forecastsForRow.length;
    return {
      ...row,
      averagePredictedCarbonIntensity: rTo3Dec(averageForecastedIntensity),
    };
  });

  // Get forecasts in the future, and trim down to the relevant fields
  const forecastsInFuture = forecastedDataResult
    .filter(
      (forecast) => forecast.datetimeFrom.getTime() > new Date().getTime()
    )
    .map((forecast) => ({
      datetimeFrom: forecast.datetimeFrom,
      datetimeTo: forecast.datetimeTo,
      predictedCarbonIntensity: strToNum(forecast.predictedCarbonIntensity),
      createdAt: forecast.createdAt,
    }));

  return [...resultsWithForecasts, ...forecastsInFuture];
};

const app = new Elysia()
  .use(
    swagger({
      path: "/docs",
    })
  )
  .get("/v1/area_data", ({ query }) => areaDataGetHandler(query), {
    query: areaDataGetQueryParamsValidator,
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
