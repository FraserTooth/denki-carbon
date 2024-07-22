import { Static, t } from "elysia";
import { db } from "../../db";
import { areaDataProcessed, carbonIntensityForecasts } from "../../schema";
import { between, eq, and } from "drizzle-orm";
import { getTotalCarbonIntensityForAreaDataRow } from "../../carbon";
import { numberifyAreaDataRow, rTo3Dec, strToNum } from "../utils";
import { DateTime } from "luxon";
import {
  areaDataGetQueryParamsValidator,
  areaDataGetResponseValidator200ElementForecast,
  areaDataGetResponseValidator200ElementHistoric,
} from "../validators/areaData";

const areaDataGetResponseValidator200 = t.Object({
  historic: t.Array(areaDataGetResponseValidator200ElementHistoric),
  forecast: t.Optional(t.Array(areaDataGetResponseValidator200ElementForecast)),
});

const areaDataGetResponseValidator = {
  200: areaDataGetResponseValidator200,
};

export const areaDataGetValidator = {
  query: areaDataGetQueryParamsValidator,
  response: areaDataGetResponseValidator,
};

export const areaDataGetHandler = async (
  query: Static<typeof areaDataGetQueryParamsValidator>
): Promise<Static<typeof areaDataGetResponseValidator200>> => {
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
    const finalRow: Static<
      typeof areaDataGetResponseValidator200ElementHistoric
    > = {
      ...normalizedRow,
      carbonIntensity: carbonIntensityRounded,
    };
    return finalRow;
  });

  const includeForecast = query.includeForecast === "true";
  if (!includeForecast) {
    return { historic: resultsWithIntensity };
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
    // Average the forecasts
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

  // Get forecasts for times after the last row of actual results
  //   if there are no actual results, get all forecasts
  const forecastsInFuture = resultsWithForecasts.length
    ? forecastedDataResult.filter(
        (forecast) =>
          forecast.datetimeFrom.getTime() >
          resultsWithForecasts[
            resultsWithForecasts.length - 1
          ].datetimeFrom.getTime()
      )
    : forecastedDataResult;

  // Remove duplicates using the field that was last created
  const uniqueDatetimeFromsInFutureForecasts = Array.from(
    new Set(
      forecastsInFuture.map((forecast) => forecast.datetimeFrom.getTime())
    )
  );

  // Get the most recent forecast for each unique datetimeFrom
  const forecastsInFutureProcessed = uniqueDatetimeFromsInFutureForecasts.map(
    (datetimeFromEpoch) => {
      const forecastsForDatetime = forecastedDataResult.filter(
        (forecast) => forecast.datetimeFrom.getTime() === datetimeFromEpoch
      );
      // Sort descending by createdAt
      forecastsForDatetime.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      // Use the most recent forecast
      const forecast = forecastsForDatetime[0];
      const datetimeFrom = DateTime.fromJSDate(forecast.datetimeFrom);
      const datetimeTo = DateTime.fromJSDate(forecast.datetimeTo);
      if (!datetimeFrom.isValid) {
        throw new Error("Invalid datetimeFrom in forecast");
      }
      if (!datetimeTo.isValid) {
        throw new Error("Invalid datetimeTo in forecast");
      }
      // And return the forecast with only the necessary fields
      const row: Static<typeof areaDataGetResponseValidator200ElementForecast> =
        {
          tso: forecast.tso,
          dateJST: datetimeFrom.toISODate(),
          timeFromJST: datetimeFrom.setZone("Asia/Tokyo").toFormat("HH:mm:ss"),
          timeToJST: datetimeTo.setZone("Asia/Tokyo").toFormat("HH:mm:ss"),
          datetimeFrom: forecast.datetimeFrom,
          datetimeTo: forecast.datetimeTo,
          predictedCarbonIntensity: strToNum(forecast.predictedCarbonIntensity),
          createdAt: forecast.createdAt,
        };
      return row;
    }
  );

  const finalResults: Static<typeof areaDataGetResponseValidator200> = {
    historic: resultsWithForecasts,
    forecast: forecastsInFutureProcessed,
  };
  return finalResults;
};
